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
label.className = 'label';
label.textContent = `seed ${seed} · starting renderer…`;
app.append(canvas, label);

const world = generateWorld(seed);
const island = await createIslandScene(canvas, world, forceWebGL2);
label.textContent = `seed ${seed} · ${island.label}`;

const resize = () => island.renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', resize);

const loop = (time: number) => {
  island.render(time);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
