import './style.css';
import { generateWorld, parseSeed } from './world/generate';
import { createIslandScene } from './render/scene';
import { FrameDiagnostics } from './render/diagnostics';
import { AdaptiveQuality } from './render/quality';

const params = new URLSearchParams(window.location.search);
const seed = parseSeed(params.get('seed'));
const forceWebGL2 = params.get('renderer') === 'webgl2';
const postEnabled = params.get('post') !== '0';
const debug = params.get('debug') === '1';
// Debug-only controls isolate pixel/shadow cost without the adaptive controller.
const qualityLocked = debug && params.get('quality') === 'high';
const requestedRatio = Number(params.get('pixelRatio'));
const pixelRatio = debug && requestedRatio >= 0.5 && requestedRatio <= 1.5
  ? requestedRatio : Math.min(devicePixelRatio, 1.5);
const shadowMapSize = debug && params.get('shadow') === '1024' ? 1024 : 2048;
const diagnostics = debug ? new FrameDiagnostics({ seed, forceWebGL2, postEnabled, qualityLocked }) : undefined;
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root is missing');

const canvas = document.createElement('canvas');
const label = document.createElement('div');
const fps = document.createElement('div');
label.className = 'label';
fps.className = 'fps';
label.textContent = `seed ${seed} · starting renderer…`;
fps.textContent = '… fps · … ms · warming up';
app.append(canvas, label, fps);

try {
  const worldStarted = performance.now();
  const world = generateWorld(seed);
  diagnostics?.phase('worldGeneration', performance.now() - worldStarted);
  const island = await createIslandScene(canvas, world, forceWebGL2, {
    postEnabled, diagnostics, pixelRatio, shadowMapSize,
    onProgress: (message) => { label.textContent = `seed ${seed} · ${message}`; },
  });
  label.textContent = `seed ${seed} · ${island.label}`;
  const quality = new AdaptiveQuality(pixelRatio, postEnabled);
  window.addEventListener('resize', () => { island.resize(); quality.reset(); });

  let previousTime: number | undefined;
  let animationStart: number | undefined;
  let smoothedFrameTime: number | undefined;
  let lastHudUpdate = 0;
  document.addEventListener('visibilitychange', () => {
    previousTime = undefined;
    smoothedFrameTime = undefined;
    quality.reset();
    diagnostics?.discontinuity();
  });
  const loop = (time: number) => {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    animationStart ??= time;
    const frameTime = previousTime === undefined ? undefined : Math.max(0.1, time - previousTime);
    previousTime = time;
    if (frameTime !== undefined) smoothedFrameTime = smoothedFrameTime === undefined
      ? frameTime : smoothedFrameTime * 0.9 + frameTime * 0.1;
    const change = qualityLocked ? undefined : quality.sample(time);
    if (change) {
      island.setQuality(change);
      diagnostics?.qualityChange(time - animationStart, change);
    }
    const renderStarted = performance.now();
    island.render(time - animationStart);
    const submittedAt = performance.now();
    diagnostics?.record(time, submittedAt - renderStarted, quality.level, submittedAt);
    if (time - lastHudUpdate > 100) {
      fps.textContent = smoothedFrameTime === undefined ? `… fps · … ms · ${quality.level}`
        : `${(1000 / smoothedFrameTime).toFixed(0)} fps · ${smoothedFrameTime.toFixed(1)} ms · ${quality.level}`;
      lastHudUpdate = time;
    }
  };
  requestAnimationFrame(loop);

} catch (error) {
  const message = error instanceof Error ? error.message : 'Renderer initialization failed. Reload to retry.';
  label.textContent = `seed ${seed} · ${message}`;
  fps.textContent = 'renderer unavailable';
  console.error('Island startup failed:', error);
}
