import './style.css';
import { generateWorldAsync, parseSeed } from './world/generate';
import { createIslandScene } from './render/scene';
import { FrameDiagnostics } from './render/diagnostics';
import { AdaptiveQuality } from './render/quality';
import { ReadinessGate } from './render/readiness';
import { warmRenderer } from './render/warmup';
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
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root is missing');
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
const loading = new LoadingScreen(app, seed);
const progress = async (step: LoadingProgress) => {
  loading.update(step);
  diagnostics?.report.loading.stages.push({ ...step, atMs: performance.now() });
  await paintLoading();
};

try {
  await progress({ stage: 'terrain', message: 'Generating terrain', percent: 1 });
  const worldStarted = performance.now();
  const world = await generateWorldAsync(seed, 256, 64, async ({ stage, fraction }) => {
    await progress({ stage, message: stage === 'terrain' ? 'Generating terrain' : 'Placing trees',
      percent: stage === 'terrain' ? 2 + fraction * 26 : 28 + fraction * 10 });
  });
  diagnostics?.phase('worldGeneration', performance.now() - worldStarted);
  const island = await createIslandScene(canvas, world, forceWebGL2, {
    postEnabled, diagnostics, pixelRatio, shadowMapSize, onProgress: progress,
  });
  label.textContent = `seed ${seed} · ${island.label}`;
  const quality = new AdaptiveQuality(pixelRatio, postEnabled);
  const readiness = new ReadinessGate();
  let entered = false;
  let animationStart: number | undefined;
  let gateStarted: number | undefined;
  let previousTime: number | undefined;
  let smoothedFrameTime: number | undefined;
  let lastHudUpdate = 0;
  const enter = (entry: 'automatic' | 'manual') => {
    if (entered) return;
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
    loading.finish();
  };
  const resetSampling = () => {
    previousTime = undefined;
    smoothedFrameTime = undefined;
    quality.reset();
    readiness.reset();
    gateStarted = undefined;
    diagnostics?.discontinuity();
  };
  window.addEventListener('resize', () => { island.resize(); resetSampling(); });
  document.addEventListener('visibilitychange', resetSampling);
  await progress({ stage: 'settling', message: 'Checking frame rate', percent: 92 });
  const readinessStarted = performance.now();
  const loop = async (time: number) => {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    gateStarted ??= time;
    const frameTime = previousTime === undefined ? undefined : Math.max(0.1, time - previousTime);
    previousTime = time;
    if (frameTime !== undefined) smoothedFrameTime = smoothedFrameTime === undefined
      ? frameTime : smoothedFrameTime * 0.9 + frameTime * 0.1;
    const change = qualityLocked ? undefined : quality.sample(time);
    if (change) {
      island.setQuality(change);
      readiness.reset();
      diagnostics?.qualityChange(time - gateStarted, change);
      if (!entered) loading.update({ stage: 'settling', message: 'Adjusting quality for your device', percent: 94 + (quality.atMinimum ? 3 : 0) });
    }
    if (!entered) {
      const result = readiness.sample(time);
      if (result) {
        diagnostics?.report.loading.windows.push({ atMs: performance.now(), quality: quality.level, ...result });
        if (result.ready) enter('automatic');
        else if (quality.atMinimum || qualityLocked || time - gateStarted > 15000) {
          loading.limited(1000 / result.medianMs, () => enter('manual'));
        }
      }
    }
    if (entered) animationStart ??= time;
    const visibleFrame = entered;
    const renderStarted = performance.now();
    island.render(animationStart === undefined ? 0 : time - animationStart);
    const submittedAt = performance.now();
    if (!visibleFrame) {
      try {
        // A covered canvas can report fast RAF callbacks with GPU work queued.
        // Fence each probe frame so cadence includes completed rendering.
        await warmRenderer({ compile: async () => {}, draws: [() => {}],
          waitForGPU: () => island.renderer.waitForGPU(), dispose: () => island.renderer.dispose() }, 10000);
      } catch (error) {
        loading.fail(error instanceof Error ? error.message : 'Rendering stopped. Reload to retry.');
        fps.textContent = 'renderer unavailable';
        app.setAttribute('aria-busy', 'false');
        return;
      }
    }
    if (visibleFrame) diagnostics?.record(time, submittedAt - renderStarted, quality.level, submittedAt);
    if (time - lastHudUpdate > 100) {
      fps.textContent = smoothedFrameTime === undefined ? `… fps · … ms · ${quality.level}`
        : `${(1000 / smoothedFrameTime).toFixed(0)} fps · ${smoothedFrameTime.toFixed(1)} ms · ${quality.level}`;
      lastHudUpdate = time;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Renderer initialization failed. Reload to retry.';
  label.textContent = `seed ${seed} · ${message}`;
  fps.textContent = 'renderer unavailable';
  loading.fail(message);
  app.setAttribute('aria-busy', 'false');
  console.error('Island startup failed:', error);
}
