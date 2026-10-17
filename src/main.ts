import './style.css';
import { generateWorld } from './world/generate';
import { createIslandScene } from './render/scene';

const params = new URLSearchParams(window.location.search);
const parsedSeed = Number(params.get('seed'));
const seed = Number.isFinite(parsedSeed) ? Math.trunc(parsedSeed) : 1;
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root is missing');

const canvas = document.createElement('canvas');
const label = document.createElement('div');
label.className = 'label';
label.textContent = `seed ${seed} · starting renderer…`;
app.append(canvas, label);

const world = generateWorld(seed);
const island = await createIslandScene(canvas, world);
label.textContent = `seed ${seed} · ${island.label}`;

const resize = () => island.renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', resize);

const loop = (time: number) => {
  island.render(time);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
