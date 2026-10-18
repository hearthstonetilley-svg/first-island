import './sandbox.css';
import { generateWorldAsync } from '../world/generate';
import { createIslandScene, IslandScene } from '../render/scene';
import { Agent, DEFAULT_DIALS, Snapshot, Activity } from '../sim/types';
import { COLOURS, connect, control, FeedEvent, GOLD, LEARN, LiveState } from './stream';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas></canvas>
  <canvas class="web"></canvas>
  <div class="bubbles"></div>
  <div class="bar">
    <strong>Island Sandbox</strong>
    <button data-cmd="start">Start</button><button data-cmd="pause">Pause</button>
    <label>Minds <select class="minds"><option value="scripted">scripted</option><option value="haiku">Haiku</option><option value="luna">Luna</option></select></label>
    <button class="overview">Island view</button>
    <button class="call-council" disabled title="Select an agent first">Call a council</button>
    <label><input type="checkbox" class="show-web" checked> Web</label>
    <a href="/web.html" target="_blank">Open the web</a>
    <span class="usage"></span>
  </div>
  <aside class="feed"><h2>Feed <small>observer</small></h2><div class="legend"><span class="k chat"></span>talk <span class="k learn"></span>knowledge passed <span class="k gold"></span>council piece</div><ol></ol></aside>
  <div class="status">Connecting to the island…</div>`;
const canvas = app.querySelector('canvas')!;
const webCanvas = app.querySelector<HTMLCanvasElement>('canvas.web')!;
const webCtx = webCanvas.getContext('2d')!;
const showWeb = app.querySelector<HTMLInputElement>('.show-web')!;
// The web drawn on the island: a strand between every pair that has spoken,
// thicker with each word carried, with a dot travelling for each new word.
const strands = new Map<string, { a: number; b: number; count: number; last: number; kind: 'chat' | 'learn' }>();
const flashes: Array<{ from: number; to: number; at: number; colour: string; label?: string; size: number; ms: number }> = [];
function recordWeb(e: FeedEvent, live = true) {
  if (e.agent === undefined) return;
  const kind = e.type === 'say' ? 'chat' : e.type === 'learn' || e.type === 'council_merge' ? 'learn' : undefined;
  if (kind) for (const to of e.to ?? []) {
    const key = `${kind}:${[e.agent, to].sort().join('-')}`;
    const s = strands.get(key) ?? { a: e.agent, b: to, count: 0, last: 0, kind };
    s.count++; s.last = e.t; strands.set(key, s);
  }
  if (!live) return;
  const now = performance.now();
  if (e.type === 'say') for (const to of e.to ?? []) flashes.push({ from: e.agent, to, at: now, colour: COLOURS[e.agent], size: 5, ms: 1400 });
  if (e.type === 'learn') for (const to of e.to ?? []) flashes.push({ from: e.agent, to, at: now, colour: LEARN, size: 6, ms: 1800, label: e.text.slice(0, 28) });
  if (e.type === 'council_split') {
    const parts = (e.data?.parts as Array<{ agent: number; task: string }>) ?? [];
    parts.forEach((p, i) => { if (p.agent !== e.agent) flashes.push({ from: e.agent!, to: p.agent, at: now + i * 120, colour: GOLD, size: 8, ms: 2200, label: p.task.slice(0, 30) }); });
  }
  if (e.type === 'council_part' && e.to?.[0] !== undefined && e.to[0] !== e.agent)
    flashes.push({ from: e.agent, to: e.to[0], at: now, colour: e.data?.made ? GOLD : '#c9d3dc', size: e.data?.made ? 10 : 7, ms: 2000, label: e.data?.made ? String(e.data.made) : 'result' });
}
function drawWeb(positions: Map<number, { x: number; y: number; visible: boolean }>, now: number) {
  const ratio = devicePixelRatio;
  if (webCanvas.width !== innerWidth * ratio || webCanvas.height !== innerHeight * ratio) {
    webCanvas.width = innerWidth * ratio; webCanvas.height = innerHeight * ratio;
  }
  webCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  webCtx.clearRect(0, 0, innerWidth, innerHeight);
  if (!showWeb.checked) { flashes.length = 0; return; }
  webCtx.lineCap = 'round';
  for (const s of strands.values()) {
    const p = positions.get(s.a), q = positions.get(s.b);
    if (!p?.visible || !q?.visible) continue;
    const age = (Date.now() - s.last) / 1000;
    const alpha = Math.max(0.12, 0.8 - age / 120);
    webCtx.strokeStyle = s.kind === 'learn' ? `rgba(92,255,193,${alpha})` : `rgba(235,245,255,${alpha * 0.8})`;
    webCtx.lineWidth = Math.min(7, 1 + Math.log2(1 + s.count) * 1.2);
    webCtx.beginPath(); webCtx.moveTo(p.x, p.y);
    webCtx.quadraticCurveTo((p.x + q.x) / 2, Math.min(p.y, q.y) - 40, q.x, q.y); webCtx.stroke();
  }
  // Councils: a ring around the members while they work, gold when merged.
  for (const c of state?.councils ?? []) {
    const pts = c.members.map(m => positions.get(m)).filter(p => p?.visible) as Array<{ x: number; y: number }>;
    if (pts.length < 2) continue;
    const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length, cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const r = Math.max(60, ...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) + 30;
    webCtx.strokeStyle = c.open ? 'rgba(255,211,77,.85)' : 'rgba(255,211,77,.35)';
    webCtx.setLineDash(c.open ? [10, 8] : []); webCtx.lineDashOffset = -now / 40; webCtx.lineWidth = 3;
    webCtx.beginPath(); webCtx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2); webCtx.stroke(); webCtx.setLineDash([]);
    webCtx.fillStyle = GOLD; webCtx.font = '600 13px system-ui'; webCtx.textAlign = 'center';
    webCtx.fillText(`COUNCIL ${c.mode ? c.mode.toUpperCase() : 'GATHERING'}: ${c.problem.slice(0, 60)}`, cx, cy - r * 0.6 - 10);
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], t = (now - f.at) / f.ms;
    if (t < 0) continue;
    const p = positions.get(f.from), q = positions.get(f.to);
    if (t > 1 || !p?.visible || !q?.visible) { flashes.splice(i, 1); continue; }
    const cx = (p.x + q.x) / 2, cy = Math.min(p.y, q.y) - 40, u = 1 - t;
    const fx = u * u * p.x + 2 * u * t * cx + t * t * q.x, fy = u * u * p.y + 2 * u * t * cy + t * t * q.y;
    webCtx.fillStyle = f.colour;
    webCtx.beginPath(); webCtx.arc(fx, fy, f.size, 0, Math.PI * 2); webCtx.fill();
    if (f.label) { webCtx.font = '600 11px system-ui'; webCtx.textAlign = 'center'; webCtx.fillText(f.label, fx, fy - f.size - 4); }
  }
}
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

const callCouncil = app.querySelector<HTMLButtonElement>('.call-council')!;
function follow(id: number | undefined) {
  followed = id; island?.selectAgent(id); island?.followAgent(id);
  callCouncil.disabled = id === undefined;
  callCouncil.textContent = id === undefined ? 'Call a council' : `Ask ${names[id]} to call a council`;
}
callCouncil.onclick = () => { if (followed !== undefined) control({ cmd: 'council', agent: String(followed) }); };
app.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => b.onclick = () => control({ cmd: b.dataset.cmd! }));
minds.onchange = () => control({ minds: minds.value });
app.querySelector<HTMLButtonElement>('.overview')!.onclick = () => { followed = undefined; island?.selectAgent(undefined); island?.islandView(); };

function addFeed(e: FeedEvent) {
  const li = document.createElement('li');
  li.className = `ev-${e.type}`;
  const who = e.agent === undefined ? '' : names[e.agent];
  const heard = e.to?.length ? ` <span class="to">to ${e.to.map(i => names[i]).join(', ')}</span>` : e.type === 'say' ? ' <span class="to">(nobody heard)</span>' : '';
  const verb = e.type === 'thought' ? 'thinks' : e.type === 'say' ? 'says' : e.type === 'learn' ? 'teaches' : e.type.startsWith('council') ? '<span class="tag">COUNCIL</span>' : '';
  li.innerHTML = `<b style="color:${COLOURS[e.agent ?? 6]}">${who}</b> ${verb} <span class="text"></span>${heard}`;
  li.querySelector('.text')!.textContent = e.type === 'say' ? `"${e.text}"` : e.type === 'learn' ? `${e.to?.map(i => names[i]).join(', ')}: ${e.text}` : e.text;
  if (e.type === 'learn') li.querySelector('.to')?.remove();
  if (e.agent !== undefined) li.onclick = () => follow(e.agent);
  feed.prepend(li);
  while (feed.children.length > 120) feed.lastChild!.remove();
}

const bubbleEls = new Map<number, HTMLDivElement>();
let placed: Array<{ el: HTMLDivElement; x: number; y: number; full: boolean }> = [];
function drawBubbles() {
  if (!island || !state) return;
  placed = [];
  const positions = new Map(island.agentPositions().map(p => [p.id, p]));
  drawWeb(positions, performance.now());
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
    // Compact unless followed; stack bubbles upward so none hides another.
    const full = followed === a.id;
    el.classList.toggle('compact', !full);
    placed.push({ el, x: p.x, y: p.y, full });
    el.style.setProperty('--c', COLOURS[a.id]);
    el.classList.toggle('speaking', !!a.said);
    el.classList.toggle('followed', followed === a.id);
    el.classList.toggle('in-council', a.council !== null);
    (el.querySelector('.name') as HTMLElement).textContent = a.name + (a.council !== null ? ' · in council' : a.thinking ? ' …' : '');
    const line = a.said ? `"${a.said}"` : a.thought;
    (el.querySelector('.line') as HTMLElement).textContent = el.classList.contains('compact') && line.length > 46 ? line.slice(0, 44) + '…' : line;
  }
  const boxes: Array<{ l: number; r: number; t: number; b: number }> = [];
  for (const b of placed.sort((m, n) => Number(n.full) - Number(m.full) || n.y - m.y)) {
    const w = b.el.offsetWidth, h = b.el.offsetHeight;
    let top = b.y - h - 8;
    for (let guard = 0; guard < 12; guard++) {
      const hit = boxes.find(o => b.x - w / 2 < o.r && b.x + w / 2 > o.l && top < o.b && top + h > o.t);
      if (!hit) break;
      top = hit.t - h - 4;
    }
    boxes.push({ l: b.x - w / 2, r: b.x + w / 2, t: top, b: top + h });
    b.el.style.transform = `translate(${b.x - w / 2}px, ${top}px)`;
    b.el.classList.toggle('lifted', top < b.y - h - 10);
  }
}

connect({
  async hello(h) {
    names = h.names;
    h.history.forEach(e => { addFeed(e); recordWeb(e, false); });
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
    usage.textContent = `${s.running ? 'running' : 'paused'} · calls ${s.calls} (${s.councilCalls} in councils, ${s.perMin}/${s.cap} per min) · ${s.facts} facts known${s.failed ? ` · ${s.failed} fell back` : ''}`;
  },
  event(e) { addFeed(e); recordWeb(e); },
  down() { status.hidden = false; status.textContent = 'Lost the island server. Is it running?'; },
});
