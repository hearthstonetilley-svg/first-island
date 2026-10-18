import './sandbox.css';
import { generateWorldAsync } from '../world/generate';
import { createIslandScene, IslandScene } from '../render/scene';
import { Agent, DEFAULT_DIALS, Snapshot, Activity } from '../sim/types';
import { COLOURS, connect, control, FeedEvent, GOLD, LEARN, LiveState, MIND_COLOURS, MIND_LABELS, MIND_PLAN, usage } from './stream';

// The island page: an observation station. Left, the eight minds, each with its
// current action, its last outcome and its latest thought, which flies in from
// the agent. Centre, the island framed on the agents. Right, real usage meters,
// the live council and the discoveries so far.
const LEFT = 316, RIGHT = 312;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas></canvas>
  <canvas class="overlay"></canvas>
  <div class="tags"></div>
  <header class="top">
    <strong class="title">First Island</strong>
    <button class="run">Pause</button>
    <div class="mixer" title="Drag the dividers to share the eight minds between the models your plans connect"><div class="mix-bar"></div><div class="mix-legend"></div></div>
    <span class="sep"></span>
    <button class="frame" title="Frame the agents (Esc)">Agents</button><button class="overview">Island</button>
    <label class="history" title="Show every connection so far, not just live ones"><input type="checkbox"> History</label>
    <span class="sep"></span>
    <div class="progress" title="Things made and structures built"></div>
    <a class="web-link" href="/web.html" target="_blank">The web ↗</a>
  </header>
  <aside class="rail left"><div class="cards"></div><section class="inspector" hidden></section></aside>
  <aside class="rail right">
    <section class="panel meters"><h3>Usage</h3><div class="meter-list"></div></section>
    <section class="panel council"><h3>Council</h3><div class="council-body"><p class="muted">No council yet. Agents call one when a problem needs several minds.</p></div></section>
    <section class="panel finds"><h3>Discoveries</h3><ol class="find-list"></ol></section>
  </aside>
  <div class="mode" title="W A S D move · Q E turn · R F zoom · drag to orbit · Esc frames the agents"></div>
  <div class="status">Connecting to the island…</div>`;
const $ = <T extends Element = HTMLElement>(q: string) => app.querySelector(q) as unknown as T;
const canvas = $<HTMLCanvasElement>('canvas'), overlay = $<HTMLCanvasElement>('canvas.overlay'), ctx = overlay.getContext('2d')!;
const tags = $('.tags'), cards = $('.cards'), inspector = $('.inspector'), status = $('.status'), modeLine = $('.mode');
const run = $<HTMLButtonElement>('.run'), history = $<HTMLInputElement>('.history input');
let names: string[] = [];
let island: IslandScene | undefined;
let state: LiveState | undefined;
let trees: Snapshot['trees'] = [];
let selected: number | undefined, following = false, mode: 'agents' | 'island' | 'free' | 'follow' = 'agents';
const debug = new URLSearchParams(location.search).get('debug') === '1';
declare global { interface Window { __SANDBOX__?: { camera: { y: number; ground: number; tx: number; tz: number }; tags: number; mode: string } } }

const activity = (a: string): Activity => (['wandering', 'seeking food', 'eating', 'resting', 'seeking cover', 'socialising'].includes(a) ? a : 'wandering') as Activity;
function snapshot(s: LiveState): Snapshot {
  const agents: Agent[] = s.agents.map(a => ({ id: a.id, family: a.id, parents: [], generation: 0, bornTick: 0, age: 1, biologicalAge: 1,
    x: a.x, y: a.y, z: a.z, energy: 1, warmth: 1, rest: 1, health: 1, activity: activity(a.activity),
    traits: { speed: 1, strength: 1, perception: 1, curiosity: 1, sociability: 1, fertility: 0, lifespan: 1 } }));
  return { tick: s.tick, seconds: s.tick / 4, generation: 0, speed: 4 as Snapshot['speed'], dials: { ...DEFAULT_DIALS }, eventCount: 0,
    agents, plants: [], trees, environment: { daylight: 1, rain: 0, temperature: 20 },
    stats: { population: agents.length, births: 0, deaths: 0, deathsByCause: { starvation: 0, exposure: 0, 'old age': 0, exhaustion: 0 } } };
}

// ---------- camera modes ----------
function setMode(next: typeof mode) {
  mode = next;
  modeLine.textContent = next === 'follow' && selected !== undefined ? `Following ${names[selected]} · Esc to frame everyone`
    : next === 'free' ? 'Free camera · W A S D · Q E · R F · Esc to frame everyone' : next === 'island' ? 'Whole island' : 'Framing the agents';
}
function frame() { following = false; island?.frameAgents(); setMode('agents'); }
function select(id: number | undefined) {
  selected = id; island?.selectAgent(id);
  cardEls.forEach((c, i) => c.classList.toggle('selected', i === id));
  renderInspector();
}
function follow(id: number) { select(id); following = true; island?.followAgent(id); setMode('follow'); }
$<HTMLButtonElement>('.frame').onclick = frame;
$<HTMLButtonElement>('.overview').onclick = () => { following = false; island?.islandView(); setMode('island'); };
run.onclick = () => control({ cmd: state?.running ? 'pause' : 'start' });
history.onchange = () => history.blur();
app.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur()));

// ---------- keyboard camera ----------
const held = new Set<string>();
const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (key === 'escape') { frame(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || !CAMERA_KEYS.has(key)) return;
  if (e.target instanceof HTMLSelectElement) { if (key.startsWith('arrow')) return; e.target.blur(); }
  e.preventDefault();
  if (!held.size) lastApply = performance.now();
  held.add(key);
});
addEventListener('keyup', e => { applyKeys(performance.now()); held.delete(e.key.toLowerCase()); });
addEventListener('blur', () => { applyKeys(performance.now()); held.clear(); });
// Movement follows how long a key is held, not how many frames were drawn,
// so the camera moves the same distance on a slow machine as on a fast one.
let lastApply = 0;
function applyKeys(now: number) {
  const dt = Math.min(1, (now - (lastApply || now)) / 1000); lastApply = now;
  if (!island || !held.size) return;
  const k = (c: string) => (held.has(c) ? 1 : 0);
  const forward = k('w') + k('arrowup') - k('s') - k('arrowdown'), right = k('d') + k('arrowright') - k('a') - k('arrowleft');
  if (forward || right || k('q') || k('e') || k('r') || k('f')) { if (mode !== 'free') { following = false; setMode('free'); } }
  if (forward || right) island.move(forward * dt * 60, right * dt * 60);
  if (k('q') || k('e')) island.turn((k('q') - k('e')) * dt * 1.4);
  if (k('r') || k('f')) island.zoom(Math.exp((k('f') - k('r')) * dt * 1.6));
}

// ---------- the eight minds ----------
const cardEls: HTMLDivElement[] = [];
const recent = new Map<number, FeedEvent[]>();
const latest = new Map<number, { thought: string; said: string; saidAt: number }>();
function ensureCards() {
  names.forEach((name, i) => {
    if (cardEls[i]) return;
    const c = document.createElement('div');
    c.className = 'card'; c.style.setProperty('--c', COLOURS[i]);
    c.innerHTML = `<div class="head"><span class="dot"></span><b></b><span class="model"></span><span class="doing"></span></div><div class="outcome"></div><div class="thought"></div><div class="said"></div>`;
    c.querySelector('b')!.textContent = name;
    c.onclick = () => select(selected === i ? undefined : i);
    c.ondblclick = () => follow(i);
    cards.append(c); cardEls[i] = c;
  });
}
function land(agent: number, kind: 'thought' | 'say', text: string, t: number) {
  const l = latest.get(agent) ?? { thought: '', said: '', saidAt: 0 };
  if (kind === 'thought') l.thought = text; else { l.said = text; l.saidAt = t; }
  latest.set(agent, l);
  const c = cardEls[agent]; if (!c) return;
  c.querySelector('.thought')!.textContent = l.thought;
  c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
  if (agent === selected) renderInspector();
}
function updateCards(s: LiveState) {
  for (const a of s.agents) {
    const c = cardEls[a.id]; if (!c) continue;
    c.querySelector('.doing')!.textContent = a.thinking && a.council === null ? 'thinking…' : a.doing;
    c.querySelector('.outcome')!.textContent = a.outcome;
    const l = latest.get(a.id);
    const said = l && Date.now() - l.saidAt < 10000 ? `"${l.said}"` : '';
    c.querySelector('.said')!.textContent = said;
    c.classList.toggle('in-council', a.council !== null);
    const m = s.mix[a.id] ?? 'scripted', chip = c.querySelector<HTMLElement>('.model')!;
    if (chip.textContent !== MIND_LABELS[m]) { chip.textContent = MIND_LABELS[m] ?? m; chip.style.background = MIND_COLOURS[m] ?? '#555'; }
  }
}

// ---------- the minds mixer: drag to share the eight minds between models ----------
const mixBar = $('.mix-bar'), mixLegend = $('.mix-legend');
let mixDraft: number[] | undefined, mixOptions: string[] = [], dragging: { divider: number } | undefined;
const countsOf = (mix: string[], options: string[]) => options.map(o => mix.filter(m => m === o).length);
function drawMixer(counts: number[]) {
  const total = counts.reduce((n, c) => n + c, 0) || 1;
  mixBar.innerHTML = '';
  let acc = 0;
  counts.forEach((c, i) => {
    const seg = document.createElement('div'); seg.className = 'seg';
    seg.style.left = `${(acc / total) * 100}%`; seg.style.width = `${(c / total) * 100}%`; seg.style.background = MIND_COLOURS[mixOptions[i]] ?? '#555';
    seg.textContent = c ? `${MIND_LABELS[mixOptions[i]] ?? mixOptions[i]} ${c}` : '';
    mixBar.append(seg); acc += c;
    if (i < counts.length - 1) {
      const h = document.createElement('div'); h.className = 'handle'; h.style.left = `${(acc / total) * 100}%`; h.dataset.divider = String(i);
      mixBar.append(h);
    }
  });
  mixLegend.innerHTML = mixOptions.map((o, i) => `<span><i style="background:${MIND_COLOURS[o]}"></i>${MIND_LABELS[o] ?? o} ${counts[i]} <small>${MIND_PLAN[o] ?? ''}</small></span>`).join('');
}
mixBar.addEventListener('pointerdown', e => {
  const t = e.target as HTMLElement; if (!t.classList.contains('handle') || !state) return;
  dragging = { divider: Number(t.dataset.divider) }; mixDraft = countsOf(state.mix, mixOptions);
  mixBar.setPointerCapture(e.pointerId); e.preventDefault();
});
mixBar.addEventListener('pointermove', e => {
  if (!dragging || !mixDraft) return;
  const r = mixBar.getBoundingClientRect(), total = 8;
  const pos = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total);
  // Cumulative divider positions stay ordered; when handles stack, the drag direction picks which moves.
  const cum = mixDraft.reduce<number[]>((xs, c) => [...xs, (xs.at(-1) ?? 0) + c], []).slice(0, -1);
  let j = dragging.divider;
  while (pos > cum[j] && j + 1 < cum.length && cum[j + 1] === cum[j]) j++;
  while (pos < cum[j] && j > 0 && cum[j - 1] === cum[j]) j--;
  dragging.divider = j;
  cum[j] = Math.max(j > 0 ? cum[j - 1] : 0, Math.min(j + 1 < cum.length ? cum[j + 1] : total, pos));
  mixDraft = [...cum, total].map((v, i) => v - (i ? cum[i - 1] : 0));
  drawMixer(mixDraft);
});
mixBar.addEventListener('pointerup', () => {
  if (!dragging || !mixDraft) return;
  const mix: string[] = []; mixDraft.forEach((c, i) => { for (let k = 0; k < c; k++) mix.push(mixOptions[i]); });
  dragging = undefined; void control({ mix }).then(() => { mixDraft = undefined; });
});
const grouped = (items: string[]) => Object.entries(items.reduce<Record<string, number>>((m, i) => ({ ...m, [i]: (m[i] ?? 0) + 1 }), {}))
  .map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ') || 'nothing';
// The inspector is built once per selection; afterwards only its text changes,
// so its buttons stay still under the pointer.
let inspectorFor: number | undefined;
function renderInspector() {
  if (selected === undefined || !state) { inspector.hidden = true; inspectorFor = undefined; return; }
  if (inspectorFor !== selected) {
    inspectorFor = selected;
    inspector.style.setProperty('--c', COLOURS[selected]);
    inspector.innerHTML = `<div class="ins-head"><b></b><button class="follow">Follow</button><button class="ask">Ask to call a council</button></div>
      <dl><dt>Thinks</dt><dd class="t"></dd><dt>Said</dt><dd class="s"></dd><dt>Carries</dt><dd class="c"></dd><dt>Has made</dt><dd class="m"></dd><dt>Knows</dt><dd class="k"></dd></dl>
      <h4>Recently</h4><ol class="ev"></ol>`;
    const id = selected;
    inspector.querySelector<HTMLButtonElement>('.follow')!.onclick = () => follow(id);
    inspector.querySelector<HTMLButtonElement>('.ask')!.onclick = () => control({ cmd: 'council', agent: String(id) });
  }
  inspector.hidden = false;
  const a = state.agents[selected], l = latest.get(selected);
  const put = (q: string, text: string) => { const el = inspector.querySelector(q)!; if (el.textContent !== text) el.textContent = text; };
  put('b', a.name); put('.t', l?.thought || '…'); put('.s', l?.said ? `"${l.said}"` : '…');
  put('.c', grouped(a.inventory)); put('.m', a.known.join(', ') || 'nothing yet'); put('.k', `${a.facts} facts`);
  const lines = (recent.get(selected) ?? []).slice(-6).reverse().map(e => e.text);
  const ol = inspector.querySelector('.ev')!;
  if (ol.textContent !== lines.join('')) { ol.innerHTML = ''; for (const t of lines) { const li = document.createElement('li'); li.textContent = t; ol.append(li); } }
}

// ---------- right rail: usage, council, discoveries ----------
const fmtAgo = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const fmtTime = (ms: number) => { const d = new Date(ms); return d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }); };
const bar = (label: string, pct: number | undefined, note: string) => `<div class="meter"><div class="m-row"><span>${label}</span><span>${pct === undefined ? '' : `${pct.toFixed(0)}%`}</span></div>
  ${pct === undefined ? '' : `<div class="m-bar"><i style="width:${Math.min(100, pct)}%"></i></div>`}<div class="m-note">${note}</div></div>`;
async function refreshMeters() {
  try {
    const u = await usage();
    $('.meter-list').innerHTML = [
      u.codex ? bar(`Codex weekly${u.codex.plan ? ` (${u.codex.plan})` : ''}`, u.codex.usedPercent, `resets ${fmtTime(u.codex.resetsAt)}`) : bar('Codex', undefined, 'no meter found'),
      ...(u.claude ? [
        bar('Claude 5-hour', u.claude.fiveHourPercent, `${u.claude.fiveHourResetsAt ? `resets ${fmtTime(u.claude.fiveHourResetsAt)} · ` : ''}as of ${fmtAgo(u.claude.asOf)}`),
        bar('Claude weekly', u.claude.sevenDayPercent, `${u.claude.sevenDayResetsAt ? `resets ${fmtTime(u.claude.sevenDayResetsAt)} · ` : ''}as of ${fmtAgo(u.claude.asOf)}`),
      ] : [bar('Claude plan', undefined, 'not connected: needs the status line hook')]),
      bar('This island', (u.island.perMinute / u.island.cap) * 100, `${u.island.calls} calls · $${u.island.costUsd.toFixed(3)} · ${(u.island.inputTokens / 1000).toFixed(0)}k in / ${(u.island.outputTokens / 1000).toFixed(1)}k out · ${u.island.perMinute}/${u.island.cap} per min`),
    ].join('');
  } catch { /* server down */ }
}
setInterval(refreshMeters, 10000);
interface CouncilView { id: number; chair: number; problem: string; mode: string; parts: Array<{ agent: number; task: string; result?: string; made?: string | null }>; merge?: string; open: boolean }
let council: CouncilView | undefined;
function renderCouncil() {
  const body = $('.council-body'); if (!council) return;
  const c = council;
  body.innerHTML = `<p class="c-q"></p><p class="c-mode">${c.open ? 'in session' : 'closed'}${c.mode ? ` · ${c.mode}` : ''} · chaired by <b style="color:${COLOURS[c.chair]}">${names[c.chair]}</b></p><ol class="c-parts"></ol><p class="c-merge"></p>`;
  body.querySelector('.c-q')!.textContent = c.problem;
  const ol = body.querySelector('.c-parts')!;
  for (const p of c.parts) {
    const li = document.createElement('li'); li.className = p.result === undefined ? 'pending' : p.made ? 'made' : 'done';
    li.innerHTML = `<b style="color:${COLOURS[p.agent]}"></b> <span class="task"></span><span class="res"></span>`;
    li.querySelector('b')!.textContent = names[p.agent]; li.querySelector('.task')!.textContent = p.task;
    li.querySelector('.res')!.textContent = p.result === undefined ? 'working…' : p.result; ol.append(li);
  }
  body.querySelector('.c-merge')!.textContent = c.merge ?? '';
}
function addFind(e: FeedEvent) {
  const li = document.createElement('li');
  li.innerHTML = `<b style="color:${COLOURS[e.agent ?? 0]}"></b> <span></span>`;
  li.querySelector('b')!.textContent = names[e.agent ?? 0]; li.querySelector('span')!.textContent = e.text.replace(/^DISCOVERS /, 'found ').replace(/^BUILDS /, 'built ');
  $('.find-list').prepend(li);
  while ($('.find-list').children.length > 10) $('.find-list').lastChild!.remove();
}

// ---------- events into packets, strands, council and finds ----------
const strands = new Map<string, { a: number; b: number; count: number; last: number; kind: 'chat' | 'learn' }>();
type Packet = { from: number; to: number | 'card'; at: number; colour: string; size: number; ms: number; land?: () => void };
const packets: Packet[] = [];
const queueEnd = new Map<number, number>();
function onEvent(e: FeedEvent, live = true) {
  if (e.agent === undefined) return;
  const agent = e.agent;
  const list = recent.get(agent) ?? []; if (!['thought', 'say'].includes(e.type)) { list.push(e); if (list.length > 12) list.shift(); recent.set(agent, list); }
  const kind = e.type === 'say' ? 'chat' : e.type === 'learn' ? 'learn' : undefined;
  if (kind) for (const to of e.to ?? []) {
    const key = `${kind}:${[agent, to].sort().join('-')}`;
    const s = strands.get(key) ?? { a: agent, b: to, count: 0, last: 0, kind }; s.count++; s.last = e.t; strands.set(key, s);
  }
  if (e.type === 'council_open') { council = { id: Number(e.data?.council), chair: agent, problem: e.text.replace(/^.*?council: /, '').replace(/^"|"$/g, ''), mode: '', parts: [], open: true }; }
  if (council && Number(e.data?.council) === council.id) {
    if (e.type === 'council_split') { council.mode = String(e.data?.mode ?? ''); council.parts = ((e.data?.parts as Array<{ agent: number; task: string }>) ?? []).map(p => ({ ...p })); }
    if (e.type === 'council_part') { const p = council.parts[Number(e.data?.part)]; if (p) { p.result = e.text.replace(/^[^:]+: /, ''); p.made = e.data?.made as string | null; } }
    if (e.type === 'council_merge') { council.merge = e.text; council.open = false; }
    renderCouncil();
  }
  if (e.type === 'discovery' || e.type === 'built') addFind(e);
  if (e.type === 'built' && live) island?.addStructure(e.data?.structure as never);
  if (!live) { if (e.type === 'thought' || e.type === 'say') land(agent, e.type, e.text, e.t); return; }
  const now = performance.now();
  if (e.type === 'thought' || e.type === 'say') {
    // Thoughts leave the agent in order and land in its box; the text appears on arrival.
    const start = Math.max(now, queueEnd.get(agent) ?? 0); queueEnd.set(agent, start + 700);
    const k = e.type;
    packets.push({ from: agent, to: 'card', at: start, colour: k === 'say' ? '#ffffff' : COLOURS[agent], size: 5, ms: 700, land: () => land(agent, k, e.text, e.t) });
  }
  if (e.type === 'say') for (const to of e.to ?? []) packets.push({ from: agent, to, at: now, colour: COLOURS[agent], size: 3, ms: 1200 });
  if (e.type === 'learn') for (const to of e.to ?? []) packets.push({ from: agent, to, at: now, colour: LEARN, size: 5, ms: 1600 });
  if (e.type === 'council_split') ((e.data?.parts as Array<{ agent: number }>) ?? []).forEach((p, i) => { if (p.agent !== agent) packets.push({ from: agent, to: p.agent, at: now + i * 120, colour: GOLD, size: 7, ms: 1800 }); });
  if (e.type === 'council_part' && e.to?.[0] !== undefined && e.to[0] !== agent) packets.push({ from: agent, to: e.to[0], at: now, colour: e.data?.made ? GOLD : '#9aa8b2', size: e.data?.made ? 9 : 6, ms: 1600 });
  if (e.type === 'council_open') { const members = (e.data?.members as number[]) ?? []; if (!following && mode !== 'free') island?.frameAgents(members); }
}

// ---------- drawing: tags with leader lines, packets, rings ----------
const tagEls = new Map<number, HTMLDivElement>();
function curve(p: { x: number; y: number }, q: { x: number; y: number }, t: number) {
  const cx = (p.x + q.x) / 2, cy = Math.min(p.y, q.y) - 50, u = 1 - t;
  return { x: u * u * p.x + 2 * u * t * cx + t * t * q.x, y: u * u * p.y + 2 * u * t * cy + t * t * q.y };
}
function draw(positions: Map<number, { x: number; y: number; visible: boolean }>, now: number) {
  const ratio = devicePixelRatio;
  if (overlay.width !== innerWidth * ratio || overlay.height !== innerHeight * ratio) { overlay.width = innerWidth * ratio; overlay.height = innerHeight * ratio; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.lineCap = 'round';
  // Name tags: stack so none hides another, with a thin leader line to the head.
  const boxes: Array<{ l: number; r: number; t: number; b: number }> = [];
  const order = [...(state?.agents ?? [])].sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || (positions.get(b.id)?.y ?? 0) - (positions.get(a.id)?.y ?? 0));
  for (const a of order) {
    let t = tagEls.get(a.id);
    if (!t) { t = document.createElement('div'); t.className = 'tag'; t.style.setProperty('--c', COLOURS[a.id]); t.onclick = () => select(a.id); t.ondblclick = () => follow(a.id); tags.append(t); tagEls.set(a.id, t); }
    const p = positions.get(a.id);
    t.hidden = !p?.visible || p.x < LEFT || p.x > innerWidth - RIGHT; if (t.hidden || !p) continue;
    t.textContent = a.name; t.classList.toggle('selected', selected === a.id); t.classList.toggle('thinking', a.thinking);
    const w = t.offsetWidth || 50, h = t.offsetHeight || 18;
    let top = p.y - h - 14, left = p.x - w / 2;
    for (let guard = 0; guard < 10; guard++) {
      const hit = boxes.find(o => left < o.r + 2 && left + w > o.l - 2 && top < o.b + 2 && top + h > o.t - 2);
      if (!hit) break; top = hit.t - h - 3;
    }
    boxes.push({ l: left, r: left + w, t: top, b: top + h });
    t.style.transform = `translate(${left}px, ${top}px)`;
    ctx.strokeStyle = COLOURS[a.id]; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.x, top + h); ctx.lineTo(p.x, p.y - 4); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (history.checked) for (const s of strands.values()) {
    const p = positions.get(s.a), q = positions.get(s.b); if (!p?.visible || !q?.visible) continue;
    ctx.strokeStyle = s.kind === 'learn' ? 'rgba(92,255,193,.35)' : 'rgba(230,238,242,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo((p.x + q.x) / 2, Math.min(p.y, q.y) - 50, q.x, q.y); ctx.stroke();
  }
  for (const c of state?.councils ?? []) {
    for (const m of c.members) {
      const p = positions.get(m); if (!p?.visible) continue;
      ctx.strokeStyle = c.open ? 'rgba(255,211,77,.9)' : 'rgba(255,211,77,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 16, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  for (let i = packets.length - 1; i >= 0; i--) {
    const f = packets[i], t = (now - f.at) / f.ms; if (t < 0) continue;
    const p = positions.get(f.from);
    let q: { x: number; y: number } | undefined;
    if (f.to === 'card') { const r = cardEls[f.from]?.getBoundingClientRect(); q = r && { x: r.right - 8, y: r.top + 16 }; }
    else { const v = positions.get(f.to); q = v?.visible ? v : undefined; }
    if (t >= 1 || !p || !q) { packets.splice(i, 1); f.land?.(); continue; }
    if (f.to === 'card' && !p.visible) { packets.splice(i, 1); f.land?.(); continue; }
    const at = curve(p, q, t);
    ctx.fillStyle = f.colour; ctx.shadowColor = f.colour; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(at.x, at.y, f.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  return boxes.length;
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
      { onSelect: id => select(id), snapshot: state ? snapshot(state) : undefined, figureScale: 2.2, agentColours: COLOURS });
    island.setInsets(LEFT, RIGHT);
    if (state) island.updateSnapshot(snapshot(state), performance.now());
    ((h as unknown as { structures?: never[] }).structures ?? []).forEach(b => island!.addStructure(b));
    setTimeout(frame, 300);
    status.hidden = true; refreshMeters();
    addEventListener('resize', () => island?.resize());
    let startTime: number | undefined;
    const tick = (time: number) => {
      startTime ??= time;
      applyKeys(performance.now());
      island!.render(time - startTime);
      const positions = new Map(island!.agentPositions().map(p => [p.id, p]));
      const shown = draw(positions, performance.now());
      if (debug) window.__SANDBOX__ = { get camera() { return island!.cameraInfo(); }, tags: shown, mode };
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  state(s) {
    state = s;
    island?.updateSnapshot(snapshot(s), performance.now());
    updateCards(s);
    if (selected !== undefined) renderInspector();
    run.textContent = s.running ? 'Pause' : 'Run';
    mixOptions = s.backends;
    if (!dragging && !mixDraft) drawMixer(countsOf(s.mix, mixOptions));
    const p = s.progress;
    $('.progress').innerHTML = `<span class="slots">${Array.from({ length: p.makeable }, (_, i) => `<i class="${i < p.found ? 'on' : ''}"></i>`).join('')}</span>
      <span class="slots big">${Array.from({ length: p.structures }, (_, i) => `<i class="${i < p.built ? 'on' : ''}"></i>`).join('')}</span>
      <span class="count">${p.found}/${p.makeable} made · ${p.built}/${p.structures} built · ${p.councils} councils</span>`;
  },
  event: e => onEvent(e),
  down() { status.hidden = false; status.textContent = 'Lost the island server. Is it running?'; },
});
setMode('agents');
