import './style.css';
import { generateWorld, parseSeed } from './world/generate';
import { createIslandScene } from './render/scene';

const params = new URLSearchParams(window.location.search);
const seed = parseSeed(params.get('seed'));
const forceWebGL2 = params.get('renderer') === 'webgl2';
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

const world = generateWorld(seed);
const island = await createIslandScene(canvas, world, forceWebGL2);
label.textContent = `seed ${seed} · ${island.label}`;

const resize = () => island.resize();
window.addEventListener('resize', resize);

let previousTime = performance.now();
let smoothedFrameTime = 16.67;
let lastHudUpdate = 0;
const loop = (time: number) => {
  const frameTime = Math.max(0.1, time - previousTime);
  previousTime = time;
  smoothedFrameTime = smoothedFrameTime * 0.9 + frameTime * 0.1;
  island.render(time);
  if (time - lastHudUpdate > 100) {
    fps.textContent = `${(1000 / smoothedFrameTime).toFixed(0)} fps · ${smoothedFrameTime.toFixed(1)} ms`;
    lastHudUpdate = time;
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
