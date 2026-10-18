import './sandbox.css';
import { generateWorldAsync } from '../world/generate';
import { createIslandScene, IslandScene } from '../render/scene';
import { Agent, DEFAULT_DIALS, Snapshot, Activity } from '../sim/types';
import { COLOURS, connect, control, FeedEvent, LiveState } from './stream';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas></canvas>
  <div class="bubbles"></div>
  <div class="bar">
    <strong>Island Sandbox</strong>
    <button data-cmd="start">Start</button><button data-cmd="pause">Pause</button>
    <label>Minds <select class="minds"><option value="scripted">scripted</option><option value="haiku">Haiku</option></select></label>
    <button class="overview">Island view</button>
    <a href="/web.html" target="_blank">Open the web</a>
    <span class="usage"></span>
  </div>
  <aside class="feed"><h2>Feed <small>observer</small></h2><ol></ol></aside>
  <div class="status">Connecting to the island…</div>`;
const canvas = app.querySelector('canvas')!;
const bubbles = app.querySelector<HTMLDivElement>('.bubbles')!;
const feed = app.querySelector('.feed ol')!;
const usage = app.querySelector('.usage')!;
const status = app.querySelector<HTMLDivElement>('.status')!;
const minds = app.querySelector<HTMLSelectElement>('.minds')!;
let names: string[] = [];
let island: IslandScene | undefined;
let state: LiveState | undefined;
let trees: Snapshot['trees'] = [];
let followed: number | undefined;

const activity = (a: string): Activity => (['wandering', 'seeking food', 'eating', 'resting', 'seeking cover', 'socialising'].includes(a) ? a : 'wandering') as Activity;
function snapshot(s: LiveState): Snapshot {
  const agents: Agent[] = s.agents.map(a => ({ id: a.id, family: a.id, parents: [], generation: 0, bornTick: 0, age: 1, biologicalAge: 1,
    x: a.x, y: a.y, z: a.z, energy: 1, warmth: 1, rest: 1, health: 1, activity: activity(a.activity),
    traits: { speed: 1, strength: 1, perception: 1, curiosity: 1, sociability: 1, fertility: 0, lifespan: 1 } }));
  return { tick: s.tick, seconds: s.tick / 4, generation: 0, speed: 4 as Snapshot['speed'], dials: { ...DEFAULT_DIALS }, eventCount: 0,
    agents, plants: [], trees, environment: { daylight: 1, rain: 0, temperature: 20 },
    stats: { population: agents.length, births: 0, deaths: 0, deathsByCause: { starvation: 0, exposure: 0, 'old age': 0, exhaustion: 0 } } };
}

function follow(id: number | undefined) {
  followed = id; island?.selectAgent(id); island?.followAgent(id);
}
app.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => b.onclick = () => control({ cmd: b.dataset.cmd! }));
minds.onchange = () => control({ minds: minds.value });
app.querySelector<HTMLButtonElement>('.overview')!.onclick = () => { followed = undefined; island?.selectAgent(undefined); island?.islandView(); };

function addFeed(e: FeedEvent) {
  const li = document.createElement('li');
  li.className = `ev-${e.type}`;
  const who = e.agent === undefined ? '' : names[e.agent];
  const heard = e.to?.length ? ` <span class="to">to ${e.to.map(i => names[i]).join(', ')}</span>` : e.type === 'say' ? ' <span class="to">(nobody heard)</span>' : '';
  const verb = e.type === 'thought' ? 'thinks' : e.type === 'say' ? 'says' : '';
  li.innerHTML = `<b style="color:${COLOURS[e.agent ?? 6]}">${who}</b> ${verb} <span class="text"></span>${heard}`;
  li.querySelector('.text')!.textContent = e.type === 'say' ? `"${e.text}"` : e.text;
  if (e.agent !== undefined) li.onclick = () => follow(e.agent);
  feed.prepend(li);
  while (feed.children.length > 120) feed.lastChild!.remove();
}

const bubbleEls = new Map<number, HTMLDivElement>();
function drawBubbles() {
  if (!island || !state) return;
  const positions = new Map(island.agentPositions().map(p => [p.id, p]));
  for (const a of state.agents) {
    let el = bubbleEls.get(a.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'bubble';
      el.innerHTML = '<span class="name"></span><span class="line"></span>';
      el.onclick = () => follow(a.id);
      bubbles.append(el); bubbleEls.set(a.id, el);
    }
    const p = positions.get(a.id);
    el.hidden = !p?.visible;
    if (!p?.visible) continue;
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    el.style.setProperty('--c', COLOURS[a.id]);
    el.classList.toggle('speaking', !!a.said);
    el.classList.toggle('followed', followed === a.id);
    (el.querySelector('.name') as HTMLElement).textContent = a.name + (a.thinking ? ' …' : '');
    (el.querySelector('.line') as HTMLElement).textContent = a.said ? `"${a.said}"` : a.thought;
  }
}

connect({
  async hello(h) {
    names = h.names;
    h.history.forEach(addFeed);
    if (island) return;
    status.textContent = 'Building the island…';
    const world = await generateWorldAsync(h.seed);
    trees = world.trees.map((t, id) => ({ ...t, id, foodId: null }));
    island = await createIslandScene(canvas, world, new URLSearchParams(location.search).get('renderer') === 'webgl2',
      { onSelect: id => follow(id), snapshot: state ? snapshot(state) : undefined });
    if (state) island.updateSnapshot(snapshot(state), performance.now());
    follow(0);
    status.hidden = true;
    addEventListener('resize', () => island?.resize());
    let startTime: number | undefined;
    const frame = (time: number) => { startTime ??= time; island!.render(time - startTime); drawBubbles(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  },
  state(s) {
    state = s;
    island?.updateSnapshot(snapshot(s), performance.now());
    minds.value = s.mindMode;
    usage.textContent = `${s.running ? 'running' : 'paused'} · model calls ${s.calls} (${s.perMin}/${s.cap} per min)${s.failed ? ` · ${s.failed} fell back` : ''}`;
  },
  event: addFeed,
  down() { status.hidden = false; status.textContent = 'Lost the island server. Is it running?'; },
});
