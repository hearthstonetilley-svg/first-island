import './style.css';
import { generateWorld, parseSeed } from './world/generate';
import { createIslandScene } from './render/scene';
import { FrameDiagnostics } from './render/diagnostics';

const params = new URLSearchParams(window.location.search);
const seed = parseSeed(params.get('seed'));
const forceWebGL2 = params.get('renderer') === 'webgl2';
const postEnabled = params.get('post') !== '0';
const diagnostics = params.get('debug') === '1' ? new FrameDiagnostics({ seed, forceWebGL2, postEnabled }) : undefined;
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root is missing');

const canvas = document.createElement('canvas');
const label = document.createElement('div');
const fps = document.createElement('div');
label.className = 'label';
fps.className = 'fps';
label.textContent = `seed ${seed} · starting renderer…`;
fps.textContent = '… fps · … ms';
app.append(canvas, label, fps);

try {
  const worldStarted = performance.now();
  const world = generateWorld(seed);
  diagnostics?.phase('worldGeneration', performance.now() - worldStarted);
  const island = await createIslandScene(canvas, world, forceWebGL2, { postEnabled, diagnostics });
  label.textContent = `seed ${seed} · ${island.label}`;

  const resize = () => island.resize();
  window.addEventListener('resize', resize);

  let previousTime: number | undefined;
  let smoothedFrameTime = 16.67;
  let lastHudUpdate = 0;
  const loop = (time: number) => {
    const frameTime = previousTime === undefined ? 16.67 : Math.max(0.1, time - previousTime);
    previousTime = time;
    smoothedFrameTime = smoothedFrameTime * 0.9 + frameTime * 0.1;
    const renderStarted = performance.now();
    island.render(time);
    const submittedAt = performance.now();
    diagnostics?.record(time, submittedAt - renderStarted, 'high', submittedAt);
    if (time - lastHudUpdate > 100) {
      fps.textContent = `${(1000 / smoothedFrameTime).toFixed(0)} fps · ${smoothedFrameTime.toFixed(1)} ms`;
      lastHudUpdate = time;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

} catch (error) {
  const message = error instanceof Error ? error.message : 'Renderer initialization failed. Reload to retry.';
  label.textContent = `seed ${seed} · ${message}`;
  fps.textContent = 'renderer unavailable';
  console.error('Island startup failed:', error);
}
