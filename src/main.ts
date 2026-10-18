import './style.css';
import { parseSeed } from './world/generate';
import { createIslandScene, IslandScene } from './render/scene';
import { SceneRecovery } from './render/recovery';
import { FrameDiagnostics } from './render/diagnostics';
import { AdaptiveQuality } from './render/quality';
import { ReadinessGate } from './render/readiness';
import { Dials } from './sim/types';
import { SimulationClient } from './sim/client';
import { AgentInspector } from './ui/agents';
import { SimulationHUD } from './ui/simulation';
import { LoadingProgress, LoadingScreen, paintLoading } from './ui/loading';

const params = new URLSearchParams(window.location.search);
const seed = parseSeed(params.get('seed'));
const forceWebGL2 = params.get('renderer') === 'webgl2';
const postEnabled = params.get('post') !== '0';
const debug = params.get('debug') === '1';
const qualityLocked = debug && params.get('quality') === 'high';
const requestedRatio = Number(params.get('pixelRatio'));
const pixelRatio = debug && requestedRatio >= 0.5 && requestedRatio <= 1.5
  ? requestedRatio : Math.min(devicePixelRatio, 1.5);
const shadowMapSize = debug && params.get('shadow') === '1024' ? 1024 : 2048;
const diagnostics = debug ? new FrameDiagnostics({ seed, forceWebGL2, postEnabled, qualityLocked }) : undefined;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App root is missing');
const app: HTMLDivElement = root;
app.classList.add('is-loading');
app.setAttribute('aria-busy', 'true');
const canvas = document.createElement('canvas');
const label = document.createElement('div');
const fps = document.createElement('div');
label.className = 'label';
fps.className = 'fps';
label.textContent = `seed ${seed} · starting renderer…`;
fps.textContent = '… fps · … ms · warming up';
app.append(canvas, label, fps);
let loading = new LoadingScreen(app, seed);
let currentIsland: IslandScene | undefined;
const simulation = new SimulationClient();
const simulationHUD = new SimulationHUD(app, simulation);
const inspector = new AgentInspector(app, simulationHUD.element,
  (id) => currentIsland?.selectAgent(id), (id) => currentIsland?.followAgent(id), () => currentIsland?.islandView());
simulation.onSnapshot = (snapshot) => {
  simulationHUD.update(snapshot); inspector.update(snapshot);
  currentIsland?.updateSnapshot(snapshot, performance.now());
};
simulation.onError = (message) => { simulation.running(false); simulationHUD.fail(message); };
window.addEventListener('pagehide', () => simulation.dispose());
const notice = document.createElement('div');
notice.className = 'graphics-notice';
notice.setAttribute('role', 'status');
notice.hidden = true;
app.append(notice);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let frameRequest = 0;
let sceneEvents: AbortController | undefined;
let controller: SceneRecovery<IslandScene>;
const stopped = () => {
  currentIsland = undefined;
  generation += 1;
  cancelAnimationFrame(frameRequest);
  sceneEvents?.abort();
  app.classList.add('is-loading');
  app.classList.remove('is-measuring');
  loading.element.classList.remove('is-measuring');
  app.setAttribute('aria-busy', 'true');
  label.textContent = `seed ${seed} · preparing graphics…`;
  fps.textContent = '… fps · … ms · restoring graphics';
  diagnostics?.discontinuity();
  if (!loading.element.isConnected || ['complete', 'error', 'limited'].includes(loading.element.dataset.state ?? '')) {
    loading.element.remove();
    loading = new LoadingScreen(app, seed);
  }
};
const switching = () => {
  clearTimeout(noticeTimer);
  notice.textContent = 'Graphics interrupted · switching to WebGL2';
  notice.hidden = false;
};
const failed = (error: unknown) => {
  stopped();
  const message = error instanceof Error ? error.message : 'Graphics unavailable. Reload to retry.';
  label.textContent = `seed ${seed} · graphics unavailable`;
  fps.textContent = 'renderer unavailable';
  notice.hidden = true;
  loading.fail(message);
  app.setAttribute('aria-busy', 'false');
  console.error('Island startup failed:', error);
};
const progress = async (step: LoadingProgress) => {
  loading.update(step);
  diagnostics?.report.loading.stages.push({ ...step, atMs: performance.now() });
  await paintLoading();
};

try {
  await progress({ stage: 'terrain', message: 'Generating terrain', percent: 1 });
  const worldStarted = performance.now();
  const simDials: Partial<Dials> = {};
  for (const key of ['generationSeconds', 'foodRegrowth', 'mutationRate', 'startingPopulation'] as const) {
    if (params.has(key)) simDials[key] = Number(params.get(key));
  }
  const world = await simulation.initialize(seed, ({ stage, fraction }) => {
    void progress({ stage, message: stage === 'terrain' ? 'Generating terrain' : 'Placing trees',
      percent: stage === 'terrain' ? 2 + fraction * 26 : 28 + fraction * 10 });
  }, simDials);
  diagnostics?.phase('worldGeneration', performance.now() - worldStarted);
  controller = new SceneRecovery((forceWebGL) => createIslandScene(
    app.querySelector('canvas')!, world, forceWebGL, {
      postEnabled, diagnostics, pixelRatio, shadowMapSize, onProgress: progress, onFallback: switching,
      snapshot: simulation.snapshot, onSelect: (id) => inspector.select(id),
    }), forceWebGL2, stopped, switching, (island) => {
      void runScene(island).catch((error) => { void controller.reportFailure(island, error); });
    }, failed);
  await controller.start();
} catch (error) { failed(error); }

async function runScene(island: IslandScene): Promise<void> {
  currentIsland = island;
  if (simulation.snapshot) island.updateSnapshot(simulation.snapshot, performance.now());
  island.selectAgent(inspector.selected);
  if (inspector.following) island.followAgent(inspector.selected);
  const token = generation;
  const active = () => generation === token;
  sceneEvents = new AbortController();
  const quality = new AdaptiveQuality(pixelRatio, postEnabled);
  const readiness = new ReadinessGate();
  let entered = false;
  let playing = false;
  let animationStart: number | undefined;
  let gateStarted: number | undefined;
  let previousTime: number | undefined;
  let smoothedFrameTime: number | undefined;
  let lastHudUpdate = 0;
  const enter = (entry: 'automatic' | 'manual') => {
    if (entered || !active()) return;
    entered = true;
    previousTime = undefined;
    smoothedFrameTime = undefined;
    diagnostics?.phase('readinessCheck', performance.now() - readinessStarted);
    if (diagnostics) {
      diagnostics.report.loading.enteredAtMs = performance.now();
      diagnostics.report.loading.entry = entry;
    }
    app.classList.remove('is-loading');
    app.setAttribute('aria-busy', 'false');
    void loading.finish().then(() => {
      if (!active()) return;
      // Quality windows begin only after the overlay and its fade are gone.
      quality.reset();
      playing = true;
      simulation.running(true);
    });
  };
  const resetSampling = () => {
    previousTime = undefined;
    smoothedFrameTime = undefined;
    quality.reset();
    readiness.reset();
    gateStarted = undefined;
    diagnostics?.discontinuity();
  };
  window.addEventListener('resize', () => {
    if (!active()) return;
    try { island.resize(); resetSampling(); } catch (error) { void controller.reportFailure(island, error); }
  }, { signal: sceneEvents.signal });
  document.addEventListener('visibilitychange', resetSampling, { signal: sceneEvents.signal });
  await progress({ stage: 'settling', message: 'Checking frame rate', percent: 92 });
  const readinessStarted = performance.now();
  if (!active()) return;
  app.classList.add('is-measuring');
  loading.measure();
  const nextFrame = () => { if (active()) frameRequest = requestAnimationFrame((time) => {
    void loop(time).catch((error) => { if (active()) void controller.reportFailure(island, error); });
  }); };
  const loop = async (time: number) => {
    if (!active()) return;
    if (document.hidden) { nextFrame(); return; }
    gateStarted ??= time;
    const frameTime = previousTime === undefined ? undefined : Math.max(0.1, time - previousTime);
    previousTime = time;
    if (frameTime !== undefined) smoothedFrameTime = smoothedFrameTime === undefined
      ? frameTime : smoothedFrameTime * 0.9 + frameTime * 0.1;
    const change = qualityLocked ? undefined : quality.sample(time, playing);
    if (change) {
      island.setQuality(change);
      readiness.reset();
      diagnostics?.qualityChange(time - gateStarted, change);
    }
    if (!entered) {
      const result = readiness.sample(time);
      if (result) {
        diagnostics?.report.loading.windows.push({ atMs: performance.now(), quality: quality.level, ...result });
        if (result.ready) enter('automatic');
        else {
          loading.limited(1000 / result.medianMs, () => enter('manual'));
        }
      }
    }
    animationStart ??= time;
    const visibleFrame = entered;
    const renderStarted = performance.now();
    island.render(animationStart === undefined ? 0 : time - animationStart);
    const submittedAt = performance.now();
    const positions = island.agentPositions();
    const count = String(positions.length);
    if (simulationHUD.element.dataset.renderedAgents !== count) simulationHUD.element.dataset.renderedAgents = count;
    if (debug) window.__ISLAND_AGENTS__ = { positions };
    if (!active()) return;
    label.textContent = `seed ${seed} · ${island.label}`;
    if (!notice.hidden && entered && island.label === 'WebGL2' && notice.textContent?.includes('switching')) {
      notice.textContent = 'Graphics restored · WebGL2';
      noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
    }
    if (visibleFrame) diagnostics?.record(time, submittedAt - renderStarted, quality.level, submittedAt);
    if (time - lastHudUpdate > 100) {
      fps.textContent = smoothedFrameTime === undefined ? `… fps · … ms · ${quality.level}`
        : `${(1000 / smoothedFrameTime).toFixed(0)} fps · ${smoothedFrameTime.toFixed(1)} ms · ${quality.level}`;
      lastHudUpdate = time;
    }
    nextFrame();
  };
  nextFrame();
}

declare global { interface Window { __ISLAND_AGENTS__?: { positions: ReturnType<IslandScene['agentPositions']> } } }
