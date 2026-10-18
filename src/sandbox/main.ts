import './sandbox.css';
import { generateWorldAsync } from '../world/generate';
import { createIslandScene, IslandScene } from '../render/scene';
import { Agent, DEFAULT_DIALS, Snapshot, Activity } from '../sim/types';
import { COLOURS, connect, control, FeedEvent, GOLD, LEARN, LiveState } from './stream';

// The island page. Each agent wears a name tag; its thoughts and words fly from
// the agent into its own named box in the column on the left. Councils show as a
// ring with pieces flying out and back; knowledge passing draws green strands.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas></canvas>
  <canvas class="web"></canvas>
  <div class="tags"></div>
  <aside class="minds-column"><h2>Minds <small>observer</small></h2><div class="cards"></div></aside>
  <div class="bar">
    <strong>Island Sandbox</strong>
    <button data-cmd="start">Start</button><button data-cmd="pause">Pause</button>
    <label>Minds <select class="minds"><option value="scripted">scripted</option><option value="haiku">Haiku</option><option value="luna">Luna</option></select></label>
    <button class="overview">Island view</button>
    <button class="call-council" disabled>Call a council</button>
    <label><input type="checkbox" class="show-web" checked> Web</label>
    <a href="/web.html" target="_blank">Open the web</a>
    <span class="usage"></span>
    <div class="now"></div>
    <div class="keys">Move: W A S D · turn: Q E · zoom: R F or scroll · drag to orbit · click a name to follow</div>
  </div>
  <div class="toasts"></div>
  <div class="status">Connecting to the island…</div>`;
const canvas = app.querySelector('canvas')!;
const webCanvas = app.querySelector<HTMLCanvasElement>('canvas.web')!;
const ctx = webCanvas.getContext('2d')!;
const tags = app.querySelector<HTMLDivElement>('.tags')!;
const cards = app.querySelector<HTMLDivElement>('.cards')!;
const toasts = app.querySelector<HTMLDivElement>('.toasts')!;
const usage = app.querySelector('.usage')!;
const nowLine = app.querySelector('.now')!;
const status = app.querySelector<HTMLDivElement>('.status')!;
const minds = app.querySelector<HTMLSelectElement>('.minds')!;
const showWeb = app.querySelector<HTMLInputElement>('.show-web')!;
const callCouncil = app.querySelector<HTMLButtonElement>('.call-council')!;
let names: string[] = [];
let island: IslandScene | undefined;
let state: LiveState | undefined;
let trees: Snapshot['trees'] = [];
let followed: number | undefined;
const debug = new URLSearchParams(location.search).get('debug') === '1';
declare global { interface Window { __SANDBOX__?: { camera: { y: number; ground: number; tx: number; tz: number }; tags: number } } }
const builtLabels: Array<{ name: string; x: number; y: number; z: number }> = [];

const activity = (a: string): Activity => (['wandering', 'seeking food', 'eating', 'resting', 'seeking cover', 'socialising'].includes(a) ? a : 'wandering') as Activity;
const ACTIVITY_WORDS: Record<string, string> = { wandering: 'walking', 'seeking food': 'gathering', eating: 'working', resting: 'resting', 'seeking cover': 'building', socialising: 'talking' };
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
  callCouncil.disabled = id === undefined;
  callCouncil.textContent = id === undefined ? 'Call a council' : `Ask ${names[id]} to call a council`;
  cardEls.forEach((c, i) => c.classList.toggle('followed', i === id));
}
callCouncil.onclick = () => { if (followed !== undefined) control({ cmd: 'council', agent: String(followed) }); };
app.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => b.onclick = () => control({ cmd: b.dataset.cmd! }));
minds.onchange = () => { control({ minds: minds.value }); minds.blur(); };
app.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur()));
app.querySelector<HTMLButtonElement>('.overview')!.onclick = () => { follow(undefined); island?.islandView(); };

// ---------- keyboard camera ----------
const held = new Set<string>();
const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey || e.altKey || !CAMERA_KEYS.has(key)) return;
  if (e.target instanceof HTMLSelectElement) { if (key.startsWith('arrow')) return; e.target.blur(); }
  e.preventDefault(); held.add(key);
});
addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());

// ---------- the left column: one named box per agent ----------
const cardEls: HTMLDivElement[] = [];
function ensureCards() {
  names.forEach((name, i) => {
    if (cardEls[i]) return;
    const c = document.createElement('div');
    c.className = 'card'; c.style.setProperty('--c', COLOURS[i]);
    c.innerHTML = `<div class="head"><span class="dot"></span><b></b><span class="doing"></span></div><div class="line"></div><div class="said"></div><div class="carry"></div>`;
    c.querySelector('b')!.textContent = name;
    c.onclick = () => follow(i);
    cards.append(c); cardEls[i] = c;
  });
}
function landOnCard(agent: number, kind: 'thought' | 'say', text: string) {
  const c = cardEls[agent]; if (!c) return;
  const el = c.querySelector<HTMLElement>(kind === 'thought' ? '.line' : '.said')!;
  el.textContent = kind === 'say' ? `"${text}"` : text;
  c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
}
function updateCards(s: LiveState) {
  for (const a of s.agents) {
    const c = cardEls[a.id]; if (!c) continue;
    c.querySelector('.doing')!.textContent = a.council !== null ? 'in council' : a.thinking ? 'thinking…' : ACTIVITY_WORDS[a.activity] ?? a.activity;
    c.classList.toggle('in-council', a.council !== null);
    c.querySelector('.carry')!.textContent = a.inventory.length ? `carries ${a.inventory.join(', ')}` : 'carries nothing';
    if (!c.querySelector('.line')!.textContent && a.thought) c.querySelector('.line')!.textContent = a.thought;
  }
}

// ---------- name tags over the agents ----------
const tagEls = new Map<number, HTMLDivElement>();
function drawTags(positions: Map<number, { x: number; y: number; visible: boolean }>) {
  for (const a of state?.agents ?? []) {
    let t = tagEls.get(a.id);
    if (!t) { t = document.createElement('div'); t.className = 'tag'; t.style.setProperty('--c', COLOURS[a.id]); t.onclick = () => follow(a.id); tags.append(t); tagEls.set(a.id, t); }
    const p = positions.get(a.id);
    t.hidden = !p?.visible; if (!p?.visible) continue;
    t.textContent = a.name + (a.thinking ? ' …' : '');
    t.classList.toggle('followed', followed === a.id);
    t.style.transform = `translate(${p.x}px, ${p.y - 10}px) translate(-50%, -100%)`;
  }
}

// ---------- toasts for discoveries and buildings ----------
function toast(text: string, colour: string) {
  const t = document.createElement('div'); t.className = 'toast'; t.style.borderColor = colour; t.textContent = text;
  toasts.prepend(t); setTimeout(() => t.remove(), 7000);
  while (toasts.children.length > 4) toasts.lastChild!.remove();
}

// ---------- the web, councils and flights on the overlay ----------
const strands = new Map<string, { a: number; b: number; count: number; last: number; kind: 'chat' | 'learn' }>();
type Flight = { from: number; to: number | 'card'; at: number; colour: string; label?: string; size: number; ms: number; land?: () => void };
const flights: Flight[] = [];
function onEvent(e: FeedEvent, live = true) {
  if (e.agent === undefined) return;
  const kind = e.type === 'say' ? 'chat' : e.type === 'learn' || e.type === 'council_merge' ? 'learn' : undefined;
  if (kind) for (const to of e.to ?? []) {
    const key = `${kind}:${[e.agent, to].sort().join('-')}`;
    const s = strands.get(key) ?? { a: e.agent, b: to, count: 0, last: 0, kind };
    s.count++; s.last = e.t; strands.set(key, s);
  }
  const who = names[e.agent];
  if (!live) { if (e.type === 'thought' || e.type === 'say') landOnCard(e.agent, e.type, e.text); return; }
  const now = performance.now(), agent = e.agent;
  if (e.type === 'thought' || e.type === 'say') {
    const kindOf = e.type;
    flights.push({ from: agent, to: 'card', at: now, colour: kindOf === 'say' ? '#ffffff' : COLOURS[agent], size: 6, ms: 900,
      label: `${who}: ${e.text.slice(0, 26)}${e.text.length > 26 ? '…' : ''}`, land: () => landOnCard(agent, kindOf, e.text) });
  }
  if (e.type === 'say') for (const to of e.to ?? []) flights.push({ from: agent, to, at: now, colour: COLOURS[agent], size: 4, ms: 1400 });
  if (e.type === 'learn') for (const to of e.to ?? []) flights.push({ from: agent, to, at: now, colour: LEARN, size: 6, ms: 1800 });
  if (e.type === 'council_split') ((e.data?.parts as Array<{ agent: number; task: string }>) ?? []).forEach((p, i) => {
    if (p.agent !== agent) flights.push({ from: agent, to: p.agent, at: now + i * 120, colour: GOLD, size: 8, ms: 2200, label: p.task.slice(0, 30) });
  });
  if (e.type === 'council_part' && e.to?.[0] !== undefined && e.to[0] !== agent)
    flights.push({ from: agent, to: e.to[0], at: now, colour: e.data?.made ? GOLD : '#c9d3dc', size: e.data?.made ? 10 : 7, ms: 2000, label: e.data?.made ? String(e.data.made) : 'result' });
  if (e.type === 'council_open') toast(`${who} calls a council: ${e.text.replace(/^.*?council: /, '')}`, GOLD);
  if (e.type === 'council_merge') toast(`Council of ${who}: ${e.text}`, GOLD);
  if (e.type === 'discovery') toast(`${who} ${e.text}`, '#ffe27a');
  if (e.type === 'built') { toast(`${who} ${e.text}`, LEARN); addBuilt(e.data?.structure as BuiltData); }
}
type BuiltData = { id: number; kind: string; name: string; x: number; y: number; z: number; colour: string };
function addBuilt(b: BuiltData | undefined) { if (!b || !island) return; island.addStructure(b); builtLabels.push(b); }

function drawOverlay(positions: Map<number, { x: number; y: number; visible: boolean }>, now: number) {
  const ratio = devicePixelRatio;
  if (webCanvas.width !== innerWidth * ratio || webCanvas.height !== innerHeight * ratio) { webCanvas.width = innerWidth * ratio; webCanvas.height = innerHeight * ratio; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.lineCap = 'round';
  if (showWeb.checked) for (const s of strands.values()) {
    const p = positions.get(s.a), q = positions.get(s.b);
    if (!p?.visible || !q?.visible) continue;
    const alpha = Math.max(0.12, 0.8 - (Date.now() - s.last) / 120000);
    ctx.strokeStyle = s.kind === 'learn' ? `rgba(92,255,193,${alpha})` : `rgba(235,245,255,${alpha * 0.7})`;
    ctx.lineWidth = Math.min(7, 1 + Math.log2(1 + s.count) * 1.2);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo((p.x + q.x) / 2, Math.min(p.y, q.y) - 40, q.x, q.y); ctx.stroke();
  }
  for (const c of state?.councils ?? []) {
    const pts = c.members.map(m => positions.get(m)).filter(p => p?.visible) as Array<{ x: number; y: number }>;
    if (pts.length < 2) continue;
    const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length, cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const r = Math.max(60, ...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) + 30;
    ctx.strokeStyle = c.open ? 'rgba(255,211,77,.85)' : 'rgba(255,211,77,.35)';
    ctx.setLineDash(c.open ? [10, 8] : []); ctx.lineDashOffset = -now / 40; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = GOLD; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`COUNCIL ${c.mode ? c.mode.toUpperCase() : 'GATHERING'}: ${c.problem.slice(0, 60)}`, cx, cy - r * 0.6 - 10);
  }
  for (const b of builtLabels) {
    const p = island?.project(b.x, b.y + 1.8, b.z); if (!p?.visible) continue;
    ctx.fillStyle = '#e8fff6'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(b.name, p.x, p.y);
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i], t = (now - f.at) / f.ms;
    if (t < 0) continue;
    const p = positions.get(f.from);
    let q: { x: number; y: number } | undefined;
    if (f.to === 'card') { const r = cardEls[f.from]?.getBoundingClientRect(); q = r && { x: r.right - 6, y: r.top + r.height / 2 }; }
    else { const v = positions.get(f.to); q = v?.visible ? v : undefined; }
    if (t > 1 || !p?.visible || !q) { flights.splice(i, 1); f.land?.(); continue; }
    if (f.to !== 'card' && !showWeb.checked) continue;
    const cx = (p.x + q.x) / 2, cy = Math.min(p.y, q.y) - 50, u = 1 - t;
    const fx = u * u * p.x + 2 * u * t * cx + t * t * q.x, fy = u * u * p.y + 2 * u * t * cy + t * t * q.y;
    ctx.fillStyle = f.colour; ctx.beginPath(); ctx.arc(fx, fy, f.size, 0, Math.PI * 2); ctx.fill();
    if (f.label) {
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
      const w = ctx.measureText(f.label).width + 10;
      ctx.fillStyle = 'rgba(10,20,28,.8)'; ctx.fillRect(fx - w / 2, fy - f.size - 20, w, 16);
      ctx.fillStyle = f.colour; ctx.fillText(f.label, fx, fy - f.size - 8);
    }
  }
}

connect({
  async hello(h) {
    names = h.names; ensureCards();
    h.history.forEach(e => onEvent(e, false));
    if (island) return;
    status.textContent = 'Building the island…';
    const world = await generateWorldAsync(h.seed);
    trees = world.trees.map((t, id) => ({ ...t, id, foodId: null }));
    island = await createIslandScene(canvas, world, new URLSearchParams(location.search).get('renderer') === 'webgl2',
      { onSelect: id => follow(id), snapshot: state ? snapshot(state) : undefined, figureScale: 2.6, agentColours: COLOURS });
    if (state) island.updateSnapshot(snapshot(state), performance.now());
    ((h as unknown as { structures?: BuiltData[] }).structures ?? []).forEach(addBuilt);
    follow(undefined); island.islandView();
    status.hidden = true;
    addEventListener('resize', () => island?.resize());
    let startTime: number | undefined;
    let lastFrame = 0;
    const frame = (time: number) => {
      startTime ??= time;
      const dt = Math.min(0.05, (time - (lastFrame || time)) / 1000); lastFrame = time;
      const k = (c: string) => (held.has(c) ? 1 : 0);
      const forward = k('w') + k('arrowup') - k('s') - k('arrowdown'), right = k('d') + k('arrowright') - k('a') - k('arrowleft');
      if (forward || right) { if (followed !== undefined) follow(undefined); island!.move(forward * dt * 60, right * dt * 60); }
      if (k('q') || k('e')) island!.turn((k('q') - k('e')) * dt * 1.4);
      if (k('r') || k('f')) island!.zoom(Math.exp((k('f') - k('r')) * dt * 1.6));
      island!.render(time - startTime);
      if (debug) window.__SANDBOX__ = { camera: island!.cameraInfo(), tags: [...tagEls.values()].filter(t => !t.hidden).length };
      const positions = new Map(island!.agentPositions().map(p => [p.id, p]));
      drawTags(positions); drawOverlay(positions, performance.now());
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },
  state(s) {
    state = s;
    island?.updateSnapshot(snapshot(s), performance.now());
    updateCards(s);
    minds.value = s.mindMode;
    const p = s.progress;
    const inCouncil = s.agents.filter(a => a.council !== null).length;
    nowLine.textContent = `What they are doing: ${s.agents.length} agents woke on an island of ${p.elements} unknown materials and are working out what they do: gathering them, combining pairs, striking them, telling each other what works${inCouncil ? `, and ${inCouncil} are in a council right now` : ''}. Found ${p.found} of ${p.makeable} things that can be made · built ${p.built} of ${p.structures} structures · ${p.councils} councils held.`;
    usage.textContent = `${s.running ? 'running' : 'paused'} · calls ${s.calls} (${s.councilCalls} in councils, ${s.perMin}/${s.cap} per min) · ${s.facts} facts known${s.failed ? ` · ${s.failed} fell back` : ''}`;
  },
  event: e => onEvent(e),
  down() { status.hidden = false; status.textContent = 'Lost the island server. Is it running?'; },
});
