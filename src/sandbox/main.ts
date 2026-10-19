import '../style.css';
import './sandbox.css';
import { generateWorldAsync } from '../world/generate';
import { createIslandScene, IslandScene } from '../render/scene';
import { SceneRecovery } from '../render/recovery';
import { AdaptiveQuality } from '../render/quality';
import { ReadinessGate } from '../render/readiness';
import { FrameDiagnostics } from '../render/diagnostics';
import { LoadingProgress, LoadingScreen, paintLoading } from '../ui/loading';
import { Agent, DEFAULT_DIALS, Snapshot, Activity } from '../sim/types';
import { isletWorld } from './islet';
import { COLOURS, connect, control, FeedEvent, GOLD, LEARN, LiveState, MIND_COLOURS, MIND_LABELS, MIND_PLAN, Places, places, SKILL, usage, factTexts } from './stream';

// The island page: an observation station. Left, the eight minds, each with its
// current action, its last outcome and its latest thought, which flies in from
// the agent. Centre, the island framed on the agents. Right, real usage meters,
// the live council and the discoveries so far.
const app = document.querySelector<HTMLDivElement>('#app')!;
// Hidden chrome until the island is ready: the toolbar must not appear, vanish, then reappear.
app.classList.add('is-loading');
app.innerHTML = `
  <canvas></canvas>
  <canvas class="overlay"></canvas>
  <div class="tags"></div>
  <header class="top">
    <strong class="title">First&nbsp;Island</strong>
    <button class="run">Pause</button>
    <div class="mixer" title="Drag the dividers to share the eight minds between the models your plans connect"><div class="mix-bar"></div><div class="mix-legend"></div></div>
    <span class="sep"></span>
    <div class="cam" role="group" title="Camera. W A S D move, Q E turn, R F zoom, drag to orbit, Esc returns to the island">
      <button data-cam="island" class="on">Island</button><button data-cam="agents">Follow</button><button data-cam="free">Free</button></div>
    <button class="toggle-left" title="Show or hide the minds">Minds</button><button class="toggle-right" title="Show or hide usage, council and discoveries">Panels</button>
    <label class="history" title="Show every connection so far, not just live ones"><input type="checkbox"> History</label>
    <span class="grow"></span>
    <span class="fps" title="Frame rate, frame time and the quality the island has settled on">… fps</span>
    <a class="web-link" href="/web.html" target="_blank">The web ↗</a>
  </header>
  <section class="skycard" title="The island now: time of day, weather and the night boar">
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><circle class="track" cx="22" cy="22" r="17"/><path class="nightarc"/><circle class="mark" r="4.5"/></svg>
    <div class="lines"><div class="now"></div><div class="when"></div><div class="storm"></div><div class="threat"></div><div class="progress" title="Things made and structures built"></div></div>
  </section>
  <aside class="rail left"><div class="cards"></div><section class="inspector" hidden></section></aside>
  <aside class="rail right">
    <section class="panel meters"><h3>Usage</h3><div class="meter-list"></div></section>
    <section class="panel council"><h3>Council</h3><div class="council-body"><p class="muted">No council yet. Agents call one when a problem needs several minds.</p></div></section>
    <section class="panel map"><h3>The island, as they know it <span class="map-score"></span></h3><canvas class="map-canvas" width="276" height="160"></canvas></section>
    <section class="panel hyps"><h3>Hypotheses <span class="hyp-score"></span></h3><ol class="hyp-list"><li class="muted">Each try carries a prediction; the world marks it.</li></ol></section>
    <section class="panel finds"><h3>Discoveries</h3><ol class="find-list"></ol></section>
  </aside>
  <div class="mode" title="W A S D move · Q E turn · R F zoom · drag to orbit · Esc frames the agents"></div>
  <div class="status">Connecting to the island…</div>
  <div class="graphics-notice" role="status" hidden></div>`;
const $ = <T extends Element = HTMLElement>(q: string) => app.querySelector(q) as unknown as T;
const overlay = $<HTMLCanvasElement>('canvas.overlay'), ctx = overlay.getContext('2d')!;
const tags = $('.tags'), cards = $('.cards'), inspector = $('.inspector'), status = $('.status'), modeLine = $('.mode');
const run = $<HTMLButtonElement>('.run'), history = $<HTMLInputElement>('.history input');
let names: string[] = [];
let island: IslandScene | undefined;
let state: LiveState | undefined;
let trees: Snapshot['trees'] = [];
let selected: number | undefined, mode: 'agents' | 'island' | 'free' | 'follow' = 'island';
let showLeft = true, showRight = true;
const debug = new URLSearchParams(location.search).get('debug') === '1';
declare global { interface Window { __SANDBOX__?: { camera: { y: number; ground: number; tx: number; tz: number; yaw: number; pitch: number; distance: number; gliding: boolean }; tags: number; mode: string; fps: number; quality: string; requested: string; entered: boolean; qualitySamples: number; sun?: { phase: number; elevation: number; azimuth: number }; sunAtEntry?: { phase: number; elevation: number; azimuth: number }; programs?: number; islet?: boolean; drawnKinds?: string[] } } }

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
  app.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === next || (next === 'follow' && b.dataset.cam === 'agents' && false)));
  modeLine.textContent = next === 'follow' && selected !== undefined ? `Following ${names[selected]} · Esc to frame everyone`
    : next === 'free' ? 'Free camera · W A S D move · Q E turn · R F zoom · Esc for the whole island' : next === 'island' ? 'Whole island · W A S D to fly' : 'Following the agents as they move';
}
// The camera only moves on its own in "Follow agents" or when following one agent.
// The camera keeps clear of whatever panels are actually on screen, measured, not assumed:
// a panel hidden by the toggle or by a narrow window reserves no space.
// Measured on resize and panel toggles, never per frame (measuring forces a layout).
let frameInsets = { left: 0, right: 0 };
const insets = () => {
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && r.width > 0 ? r : undefined; };
  const l = visible($('.rail.left')), r = visible($('.rail.right'));
  const sideBySide = (rect?: DOMRect) => rect && rect.height > innerHeight * 0.5;
  frameInsets = { left: sideBySide(l) ? Math.round(l!.right + 8) : 0, right: sideBySide(r) ? Math.round(innerWidth - r!.left + 8) : 0 };
  return frameInsets;
};
function wholeIsland() {
 
  const { left, right } = insets(), free = Math.max(0.35, (innerWidth - left - right) / innerWidth);
  island?.setInsets(left, right);
  island?.islandView(0.5, 0.62 / free);
  setMode('island');
}
let lastGroupFrame = 0;
function frame() { island?.frameAgents(); lastGroupFrame = performance.now(); setMode('agents'); }
function select(id: number | undefined) {
  selected = id; island?.selectAgent(id);
  cardEls.forEach((c, i) => c.classList.toggle('selected', i === id));
  renderInspector();
}
function follow(id: number) { select(id); island?.followAgent(id); setMode('follow'); }
app.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach(b => b.onclick = () => {
  if (b.dataset.cam === 'island') wholeIsland(); else if (b.dataset.cam === 'agents') frame(); else { island?.cancelAutomaticCamera(); setMode('free'); }
});
function applyPanels() {
  $('.rail.left').classList.toggle('hidden', !showLeft); $('.rail.right').classList.toggle('hidden', !showRight);
  $('.toggle-left').classList.toggle('on', showLeft); $('.toggle-right').classList.toggle('on', showRight);
  const { left, right } = insets(); island?.setInsets(left, right);
  if (mode === 'island') wholeIsland();
}
$<HTMLButtonElement>('.toggle-left').onclick = () => { showLeft = !showLeft; applyPanels(); };
$<HTMLButtonElement>('.toggle-right').onclick = () => { showRight = !showRight; applyPanels(); };
run.onclick = () => control({ cmd: state?.running ? 'pause' : 'start' });
history.onchange = () => history.blur();
app.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur()));

// ---------- keyboard camera ----------
const held = new Set<string>();
const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (key === 'escape') { wholeIsland(); return; }
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
  if (forward || right || k('q') || k('e') || k('r') || k('f')) { if (mode !== 'free') { setMode('free'); } }
  if (forward || right) island.move(forward * dt * 60, right * dt * 60);
  if (k('q') || k('e')) island.turn((k('q') - k('e')) * dt * 1.4);
  if (k('r') || k('f')) island.zoom(Math.exp((k('f') - k('r')) * dt * 1.6));
}

// ---------- the eight minds ----------
const cardEls: HTMLDivElement[] = [];
const recent = new Map<number, FeedEvent[]>();
const latest = new Map<number, { thought: string; said: string; saidAt: number; seq: number }>();
function ensureCards() {
  names.forEach((name, i) => {
    if (cardEls[i]) return;
    const c = document.createElement('div');
    c.className = 'card'; c.style.setProperty('--c', COLOURS[i]);
    c.innerHTML = `<div class="head"><span class="dot"></span><b></b><span class="str" title="Strength"></span><span class="model"></span><span class="hit" title="Predictions that agreed with the island, out of those scored; +N? are tries made without a prediction"></span><span class="doing"></span></div><div class="energy"><i></i></div><div class="outcome"></div><div class="thought"></div><div class="said"></div>`;
    c.querySelector('b')!.textContent = name;
    c.onclick = () => select(selected === i ? undefined : i);
    c.ondblclick = () => follow(i);
    cards.append(c); cardEls[i] = c;
  });
}
function land(agent: number, kind: 'thought' | 'say', text: string, t: number, seq = 0) {
  const l = latest.get(agent) ?? { thought: '', said: '', saidAt: 0, seq: 0 };
  // Never let an older thought overwrite a newer one, however frames fall.
  if (seq && seq < l.seq) return;
  if (seq) l.seq = seq;
  if (kind === 'thought') l.thought = text; else { l.said = text; l.saidAt = t; }
  latest.set(agent, l);
  const c = cardEls[agent]; if (!c) return;
  c.querySelector('.thought')!.textContent = l.thought;
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
    c.classList.toggle('collapsed', a.collapsed); c.classList.toggle('sheltered', a.sheltered);
    const bar = c.querySelector<HTMLElement>('.energy i')!, width = `${Math.round(a.energy * 100)}%`;
    if (bar.style.width !== width) { bar.style.width = width; bar.style.background = a.energy < 0.25 ? '#ff6b5c' : a.energy < 0.5 ? '#ffb347' : '#5cffc1'; c.querySelector<HTMLElement>('.energy')!.title = `strength ${width}${a.sheltered ? ', sheltered' : ''}`; }
    const str = c.querySelector<HTMLElement>('.str')!;
    if (str.textContent !== width) { str.textContent = width; str.classList.toggle('low', a.energy < 0.25); }
    const hit = c.querySelector<HTMLElement>('.hit')!, hitText = a.hyp.tried || a.hyp.missing ? `${a.hyp.right}/${a.hyp.tried}${a.hyp.missing ? ` +${a.hyp.missing}?` : ''}` : '';
    if (hit.textContent !== hitText) hit.textContent = hitText;
    const m = s.mix[a.id] ?? 'scripted', chip = c.querySelector<HTMLElement>('.model')!;
    if (chip.textContent !== MIND_LABELS[m]) { chip.textContent = MIND_LABELS[m] ?? m; chip.style.background = MIND_COLOURS[m] ?? '#555'; }
  }
}

// ---------- the minds mixer: drag to share the eight minds between models ----------
const mixBar = $('.mix-bar'), mixLegend = $('.mix-legend');
let mixDraft: number[] | undefined, mixOptions: string[] = [], dragging: { divider: number } | undefined;
const countsOf = (mix: string[], options: string[]) => options.map(o => mix.filter(m => m === o).length);
// Rebuilt only when the mix or the options change, so a handle is never replaced under the pointer.
let mixerDrawn = '';
function drawMixer(counts: number[]) {
  const key = `${mixOptions.join(',')}|${counts.join(',')}`;
  if (key === mixerDrawn) return;
  mixerDrawn = key;
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
  mixLegend.innerHTML = mixOptions.map((o, i) => `<span title="${MIND_PLAN[o] ?? ''}"><i style="background:${MIND_COLOURS[o]}"></i>${MIND_LABELS[o] ?? o} ${counts[i]}</span>`).join('');
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
      <dl><dt>Thinks</dt><dd class="t"></dd><dt>Said</dt><dd class="s"></dd><dt>Carries</dt><dd class="c"></dd><dt>Has made</dt><dd class="m"></dd><dt>Skills</dt><dd class="sk"></dd><dt>Knows</dt><dd class="k"></dd><dt>Survival</dt><dd class="sv"></dd><dt>Food</dt><dd class="fd"></dd></dl>
      <h4>Recently</h4><ol class="ev"></ol>
      <p class="rules">${SURVIVAL_RULES}</p>`;
    const id = selected;
    inspector.querySelector<HTMLButtonElement>('.follow')!.onclick = () => follow(id);
    inspector.querySelector<HTMLButtonElement>('.ask')!.onclick = () => control({ cmd: 'council', agent: String(id) });
  }
  inspector.hidden = false;
  const a = state.agents[selected], l = latest.get(selected);
  const put = (q: string, text: string) => { const el = inspector.querySelector(q)!; if (el.textContent !== text) el.textContent = text; };
  put('b', a.name); put('.t', l?.thought || '…'); put('.s', l?.said ? `"${l.said}"` : '…');
  put('.c', grouped(a.inventory)); put('.m', a.known.join(', ') || 'nothing yet'); put('.sk', a.skills.length ? a.skills.join(', ') + (a.runningSkill ? ` · running ${a.runningSkill}` : '') : 'none yet'); put('.k', `${a.facts} facts`);
  put('.sv', a.collapsed ? `collapsed, strength ${Math.round(a.energy * 100)}%` : `strength ${Math.round(a.energy * 100)}% · ${a.sheltered ? 'sheltered' : 'exposed'}`);
  put('.fd', foodLine(a.knownIds));
  const lines = (recent.get(selected) ?? []).slice(-6).reverse().map(e => e.text);
  const ol = inspector.querySelector('.ev')!;
  if (ol.textContent !== lines.join('')) { ol.innerHTML = ''; for (const t of lines) { const li = document.createElement('li'); li.textContent = t; ol.append(li); } }
}

// What the agent has learned about food, read from the facts it holds.
const SURVIVAL_RULES = 'To survive: strength drains over time, faster at night and in storms unless sheltered near a hut or wall they built. Eating the right things restores it; some things sicken. At no strength they collapse, lose what they carry and wake later. At night a wild boar hunts anyone in the open: shelter keeps it off, and a spear drives it away.';
let factList: string[] = [], factsFetching = false;
function foodLine(ids: number[]) {
  if (ids.some(i => i >= factList.length) && !factsFetching) { factsFetching = true; factTexts().then(f => { factList = f; }).finally(() => { factsFetching = false; }); }
  const good: string[] = [], bad: string[] = [], none: string[] = [];
  for (const i of ids) {
    const f = factList[i]; if (!f) continue;
    let m = /^eating (.+) restores strength$/.exec(f); if (m) { good.push(m[1]); continue; }
    m = /^eating (.+) makes you ill$/.exec(f); if (m) { bad.push(m[1]); continue; }
    m = /^(.+) is not food$/.exec(f); if (m) none.push(m[1]);
  }
  const parts = [good.length ? `safe: ${good.join(', ')}` : '', bad.length ? `sickens: ${bad.join(', ')}` : '', none.length ? `not food: ${none.join(', ')}` : ''].filter(Boolean);
  return parts.join(' · ') || 'nothing tried yet';
}

// ---------- the sky panel: time of day, weather, the night boar ----------
// Night is when daylight falls below 0.3: daylight = 0.5 + 0.5 cos(2 pi phase), so phase 0.316 to 0.684.
const NIGHT_FROM = Math.acos(-0.4) / (2 * Math.PI), NIGHT_TO = 1 - NIGHT_FROM;
const fmtIn = (ms: number) => ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60000)} min`;
function updateSky(s: LiveState) {
  const w = s.world, card = $('.skycard');
  const put = (q: string, text: string) => { const el = card.querySelector(q)!; if (el.textContent !== text) el.textContent = text; };
  const dayMs = w.dayMs ?? 480000, t = w.simMs ?? 0, phase = (t % dayMs) / dayMs, day = Math.floor(t / dayMs) + 1;
  const part = w.night ? 'Night' : w.daylight < 0.55 ? (phase < 0.5 ? 'Dusk' : 'Dawn') : 'Day';
  const weak = s.agents.filter(a => a.energy < 0.3).length;
  put('.now', `Day ${day} · ${part}${weak ? ` · ${weak} weak` : ''}`);
  const toNight = ((NIGHT_FROM - phase + 1) % 1) * dayMs, toDawn = ((NIGHT_TO - phase + 1) % 1) * dayMs;
  put('.when', w.night ? `Dawn in ${fmtIn(toDawn)}` : `Night in ${fmtIn(toNight)}`);
  put('.storm', w.storm ? `Storm now, clears in ${fmtIn(w.stormLeft ?? 0)}` : `Storm in about ${fmtIn(w.stormIn ?? 0)}`);
  put('.threat', w.boar ? 'The boar is out: shelter or a spear' : w.night ? 'Night: the boar may stir' : 'Boar asleep');
  card.classList.toggle('night', w.night); card.classList.toggle('storming', w.storm); card.classList.toggle('danger', !!w.boar);
  // Dial: the sun (or moon) goes round once a day; the dark arc is the night.
  const at = (f: number) => { const a = f * 2 * Math.PI - Math.PI / 2; return [22 + 17 * Math.cos(a), 22 + 17 * Math.sin(a)]; };
  const [mx, my] = at(phase), mark = card.querySelector<SVGCircleElement>('.mark')!;
  mark.setAttribute('cx', mx.toFixed(1)); mark.setAttribute('cy', my.toFixed(1));
  const arc = card.querySelector('.nightarc')!;
  if (!arc.getAttribute('d')) { const [ax, ay] = at(NIGHT_FROM), [bx, by] = at(NIGHT_TO); arc.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)} A17 17 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}`); }
  // Centre the panel over the island, between the side panels.
  const left = frameInsets.left + (innerWidth - frameInsets.left - frameInsets.right) / 2;
  const x = `${Math.round(left)}px`; if (card.style.left !== x) card.style.left = x;
}

// ---------- right rail: usage, council, discoveries ----------
const fmtAgo = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const fmtTime = (ms: number) => { const d = new Date(ms); return d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }); };
const bar = (label: string, pct: number | undefined, note: string) => `<div class="meter"><div class="m-row"><span>${label}</span><span>${pct === undefined ? '' : `${pct.toFixed(0)}%`}</span></div>
  ${pct === undefined ? '' : `<div class="m-bar"><i style="width:${Math.min(100, pct)}%"></i></div>`}<div class="m-note">${note}</div></div>`;
async function refreshMeters() {
  try {
    const u = await usage();
    const rc = state?.progress.recall ?? {};
    const recallLine = Object.entries(rc).filter(([, v]) => v.first > 0).map(([m, v]) => `${MIND_LABELS[m] ?? m} ${v.right}/${v.first}`).join(' · ');
    $('.meter-list').innerHTML = [
      u.codex ? bar(`Codex weekly${u.codex.plan ? ` (${u.codex.plan})` : ''}`, u.codex.usedPercent, `resets ${fmtTime(u.codex.resetsAt)}`) : bar('Codex', undefined, 'no meter found'),
      ...(u.claude ? [
        bar('Claude 5-hour', u.claude.fiveHourPercent, `${u.claude.fiveHourResetsAt ? `resets ${fmtTime(u.claude.fiveHourResetsAt)} · ` : ''}as of ${fmtAgo(u.claude.asOf)}`),
        bar('Claude weekly', u.claude.sevenDayPercent, `${u.claude.sevenDayResetsAt ? `resets ${fmtTime(u.claude.sevenDayResetsAt)} · ` : ''}as of ${fmtAgo(u.claude.asOf)}`),
      ] : [bar('Claude plan', undefined, 'not connected: needs the status line hook')]),
      bar(u.island.cap ? 'This island' : 'This island (model calls off)', u.island.cap ? (u.island.perMinute / u.island.cap) * 100 : undefined, `${u.island.calls} calls · Claude $${u.island.costUsd.toFixed(3)}, ${(u.island.inputTokens / 1000).toFixed(0)}k in / ${(u.island.outputTokens / 1000).toFixed(1)}k out${(u.island.byBackend.luna ?? 0) + (u.island.byBackend.sol ?? 0) ? ` · Codex ${(u.island.byBackend.luna ?? 0) + (u.island.byBackend.sol ?? 0)} calls, cost not measured` : ''} · ${u.island.perMinute}/${u.island.cap} per min`),
      recallLine ? `<div class="meter"><div class="m-row"><span>Right on the first try, per model</span></div><div class="m-note" title="Named guesses on a pair nobody on the island had tried before, and how many were right, credited to the mind that made the guess">${recallLine} right on a pair nobody here had tried</div></div>` : '',
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
const findSeen = new Set<number>();
// Everything built so far, kept here so a graphics recovery can rebuild all of it.
const builtMap = new Map<number, never>();
const hypSeen = new Set<number>();
function addHypothesis(e: FeedEvent) {
  if (hypSeen.has(e.seq)) return; hypSeen.add(e.seq);
  const list = $('.hyp-list'); list.querySelector('.muted')?.remove();
  const li = document.createElement('li');
  const right = e.type === 'hypothesis' && e.data?.right === true;
  li.className = e.type === 'idea' ? 'idea' : right ? 'right' : 'wrong';
  li.innerHTML = `<b style="color:${COLOURS[e.agent ?? 0]}"></b> <span></span>`;
  li.querySelector('b')!.textContent = names[e.agent ?? 0];
  li.querySelector('span')!.textContent = e.type === 'idea' ? `idea: ${String(e.data?.idea)} from ${String(e.data?.from)} (untested)`
    : `expected ${String(e.data?.expect)} from ${String(e.data?.tried)}, got ${String(e.data?.actual ?? 'nothing')}`;
  list.prepend(li);
  while (list.children.length > 8) list.lastChild!.remove();
}
function addFind(e: FeedEvent) {
  if (findSeen.has(e.seq)) return; findSeen.add(e.seq);
  const li = document.createElement('li');
  li.innerHTML = `<b style="color:${COLOURS[e.agent ?? 0]}"></b> <span></span>`;
  li.querySelector('b')!.textContent = names[e.agent ?? 0]; li.querySelector('span')!.textContent = e.text.replace(/^names this /, 'named a ').replace(/^DISCOVERS /, 'found ').replace(/^BUILDS /, 'built ').replace(/^writes a skill: /, 'wrote skill ');
  if (e.type === 'skill_written') li.classList.add('skill');
  if (e.type === 'director') { li.classList.add('director'); li.querySelector('b')!.textContent = 'Director'; li.querySelector('span')!.textContent = e.text.replace(/^Director: /, ''); }
  if (e.type === 'disagreement') li.classList.add('disagree');
  $('.find-list').prepend(li);
  while ($('.find-list').children.length > 10) $('.find-list').lastChild!.remove();
}

// ---------- the map the agents are making ----------
let placeData: Places | undefined;
async function refreshPlaces() { try { placeData = await places(); drawMap(); } catch { /* server down */ } }
setInterval(refreshPlaces, 8000);
function drawMap() {
  const cv = $<HTMLCanvasElement>('.map-canvas'), g = cv.getContext('2d')!, d = placeData; if (!d) return;
  g.clearRect(0, 0, cv.width, cv.height);
  const cell = Math.min(cv.width, cv.height) / d.grid, ox = (cv.width - cell * d.grid) / 2;
  const SOIL: Record<string, string> = { shore: '#c9b27a', grove: '#3f7a46', meadow: '#7aa060', 'high rock': '#7d858c' };
  for (const r of d.regions) {
    const cx = ox + (r.id % d.grid) * cell, cy = Math.floor(r.id / d.grid) * cell;
    g.fillStyle = r.explored ? SOIL[r.soil] ?? '#555' : '#1d2a33'; g.globalAlpha = r.explored ? 0.85 : 1;
    g.fillRect(cx + 1, cy + 1, cell - 2, cell - 2); g.globalAlpha = 1;
    if (r.name) { g.fillStyle = '#fff'; g.font = '600 9px system-ui'; g.textAlign = 'center'; g.fillText(r.name.slice(0, 12), cx + cell / 2, cy + cell / 2 + 3, cell - 4); }
  }
  const sc = $('.map-score'), done = d.regions.filter(r => r.explored).length, named = d.regions.filter(r => r.name).length;
  sc.textContent = `${done}/${d.regions.length} explored · ${named} named`;
}

// ---------- events into packets, strands, council and finds ----------
const strands = new Map<string, { a: number; b: number; count: number; last: number; kind: 'chat' | 'learn' }>();
type Packet = { from: number; to: number | 'card'; at: number; colour: string; size: number; ms: number; land?: () => void };
const packets: Packet[] = [];
const MAX_PACKETS = 200;
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
  if (e.type === 'discovery' || e.type === 'built' || e.type === 'skill_written') addFind(e);
  if (e.type === 'hypothesis' || e.type === 'idea') addHypothesis(e);
  if (live && (e.type === 'named' || e.type === 'explored')) void refreshPlaces();
  if (e.type === 'named' || e.type === 'director' || e.type === 'disagreement') addFind(e);
  // Craft moor where they land and leave when launched (decision 59): the page follows both.
  if (e.type === 'unmoored' && typeof e.data?.removed === 'number') { builtMap.delete(e.data.removed); island?.removeStructure(e.data.removed); }
  if ((e.type === 'built' || e.type === 'landfall') && e.data?.structure) { const b = e.data.structure as { id: number }; builtMap.set(b.id, b as never); island?.addStructure(b as never); }
  if (!live) { if (e.type === 'thought' || e.type === 'say') land(agent, e.type, e.text, e.t, e.seq); return; }
  const now = performance.now();
  if (e.type === 'thought' || e.type === 'say') {
    // Thoughts leave the agent in order and land in its box; the text appears on arrival.
    const start = Math.max(now, queueEnd.get(agent) ?? 0); queueEnd.set(agent, start + 700);
    const k = e.type;
    packets.push({ from: agent, to: 'card', at: start, colour: k === 'say' ? '#ffffff' : COLOURS[agent], size: 5, ms: 700, land: () => land(agent, k, e.text, e.t, e.seq) });
  }
  if (e.type === 'say') for (const to of e.to ?? []) packets.push({ from: agent, to, at: now, colour: COLOURS[agent], size: 3, ms: 1200 });
  if (e.type === 'learn') for (const to of e.to ?? []) packets.push({ from: agent, to, at: now, colour: LEARN, size: 5, ms: 1600 });
  if (e.type === 'learn_skill') for (const to of e.to ?? []) packets.push({ from: agent, to, at: now, colour: SKILL, size: 7, ms: 1800 });
  if (e.type === 'council_split') ((e.data?.parts as Array<{ agent: number }>) ?? []).forEach((p, i) => { if (p.agent !== agent) packets.push({ from: agent, to: p.agent, at: now + i * 120, colour: GOLD, size: 7, ms: 1800 }); });
  if (e.type === 'council_part' && e.to?.[0] !== undefined && e.to[0] !== agent) packets.push({ from: agent, to: e.to[0], at: now, colour: e.data?.made ? GOLD : '#9aa8b2', size: e.data?.made ? 9 : 6, ms: 1600 });
  // Bound the queue: drop the oldest decorative packets first, never a thought on its way to a box.
  // Bound the queue: drop decorative packets first; if only thoughts remain, land the oldest at once.
  while (packets.length > MAX_PACKETS) {
    const k = packets.findIndex(f => !f.land);
    if (k >= 0) { packets.splice(k, 1); continue; }
    const oldest = packets.reduce((m, f, i) => (f.at < packets[m].at ? i : m), 0);
    const [f] = packets.splice(oldest, 1); f.land?.();
  }

}

// ---------- drawing: tags with leader lines, packets, rings ----------
const tagEls = new Map<number, HTMLDivElement>();
function curve(p: { x: number; y: number }, q: { x: number; y: number }, t: number) {
  const cx = (p.x + q.x) / 2, cy = Math.min(p.y, q.y) - 50, u = 1 - t;
  return { x: u * u * p.x + 2 * u * t * cx + t * t * q.x, y: u * u * p.y + 2 * u * t * cy + t * t * q.y };
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
function draw(positions: Map<number, { x: number; y: number; visible: boolean }>, now: number) {
  // The overlay is lines, dots and text: it never needs more than 1.25x resolution.
  const ratio = Math.min(devicePixelRatio, 1.25);
  if (overlay.width !== innerWidth * ratio || overlay.height !== innerHeight * ratio) { overlay.width = innerWidth * ratio; overlay.height = innerHeight * ratio; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.lineCap = 'round';
  // Name tags: stack so none hides another, with a thin leader line to the head.
  const boxes: Array<{ l: number; r: number; t: number; b: number }> = [];
  const order = [...(state?.agents ?? [])].sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || (positions.get(b.id)?.y ?? 0) - (positions.get(a.id)?.y ?? 0));
  for (const a of order) {
    let t = tagEls.get(a.id);
    if (!t) { t = document.createElement('div'); t.className = 'tag'; t.style.setProperty('--c', COLOURS[a.id]); t.onclick = () => select(a.id); t.ondblclick = () => follow(a.id); tags.append(t); tagEls.set(a.id, t); }
    const p = positions.get(a.id);
    t.hidden = !p?.visible || p.x < frameInsets.left || p.x > innerWidth - frameInsets.right; if (t.hidden || !p) continue;
    // Only touch the DOM when something changed, and measure a tag once: reading sizes
    // every frame forces a layout per tag.
    if (t.textContent !== a.name) { t.textContent = a.name; t.dataset.w = ''; }
    if (t.classList.contains('selected') !== (selected === a.id)) t.classList.toggle('selected', selected === a.id);
    if (t.classList.contains('thinking') !== a.thinking) t.classList.toggle('thinking', a.thinking);
    if (!t.dataset.w) { t.dataset.w = String(t.offsetWidth || 50); t.dataset.h = String(t.offsetHeight || 18); }
    const w = Number(t.dataset.w) + 12, h = Number(t.dataset.h);
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
  // Place names the agents gave, drawn where they belong on the island.
  for (const r of placeData?.regions ?? []) {
    if (!r.name || !island) continue;
    const p = island.project(r.x, r.y + 1.5, r.z); if (!p.visible || p.x < frameInsets.left || p.x > innerWidth - frameInsets.right) continue;
    ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(10,20,28,.55)';
    const w = ctx.measureText(r.name).width + 10; ctx.fillRect(p.x - w / 2, p.y - 13, w, 17);
    ctx.fillStyle = '#f2e7c9'; ctx.fillText(r.name, p.x, p.y);
  }
  // Rain while a storm is on: thin slanted streaks across the island, drawn on the overlay.
  if (state?.world.storm) {
    const l = frameInsets.left, r = innerWidth - frameInsets.right, W = r - l, H = innerHeight;
    ctx.fillStyle = 'rgba(16,26,36,.22)'; ctx.fillRect(l, 0, W, H);
    if (!reducedMotion) {
      ctx.strokeStyle = 'rgba(190,210,230,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 140; i++) {
        const sx = (i * 97.3) % 1, sy = (i * 57.1) % 1, y = (sy * H + now * 0.9) % H, x = l + ((sx * W + now * 0.25) % W);
        ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14);
      }
      ctx.stroke();
    }
  }
  // The night boar, drawn where it is while it is out.
  const boarAt = state?.world.boar;
  if (boarAt && island) {
    const p = island.project(boarAt.x, boarAt.y + 0.6, boarAt.z);
    if (p.visible && p.x > frameInsets.left && p.x < innerWidth - frameInsets.right) {
      ctx.fillStyle = '#3a2418'; ctx.strokeStyle = '#ff6b5c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb3a8'; ctx.fillText('boar', p.x, p.y - 11);
    }
  }
  for (const c of state?.councils ?? []) {
    for (const m of c.members) {
      const p = positions.get(m); if (!p?.visible) continue;
      ctx.strokeStyle = c.open ? 'rgba(255,211,77,.9)' : 'rgba(255,211,77,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 16, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Card positions are read once per frame, not once per packet.
  const cardAt = cardEls.map(c => { const r = c.getBoundingClientRect(); return { x: r.right - 8, y: r.top + 16 }; });
  // Packets that have arrived land oldest first, so a slow frame cannot reorder thoughts.
  const arrived = packets.filter(f => (now - f.at) / f.ms >= 1).sort((x, y) => x.at - y.at);
  for (const f of arrived) { packets.splice(packets.indexOf(f), 1); f.land?.(); }
  for (let i = packets.length - 1; i >= 0; i--) {
    const f = packets[i], t = (now - f.at) / f.ms; if (t < 0) continue;
    const p = positions.get(f.from);
    let q: { x: number; y: number } | undefined;
    if (f.to === 'card') q = cardAt[f.from];
    else { const v = positions.get(f.to); q = v?.visible ? v : undefined; }
    if (t >= 1 || !p || !q) { packets.splice(i, 1); f.land?.(); continue; }
    if (f.to === 'card' && !p.visible) { packets.splice(i, 1); f.land?.(); continue; }
    const at = curve(p, q, t);
    ctx.fillStyle = f.colour; ctx.shadowColor = f.colour; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(at.x, at.y, f.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  return boxes.length;
}

// ---------- the startup and performance contract (rounds 8 to 10) ----------
// Loading screen, the frame-rate gate before entry, adaptive quality while running,
// WebGPU loss falling back to WebGL2, and a live frame-rate readout. Same modules as
// the world page, so both pages keep the same performance behaviour.
const params = new URLSearchParams(location.search);
const forceWebGL2 = params.get('renderer') === 'webgl2';
const postEnabled = params.get('post') !== '0';
const pixelRatio = Math.min(devicePixelRatio, 1.5);
const fpsLine = $('.fps'), notice = $('.graphics-notice');
// ?debug=1 records the same 600-frame report as the world page (window.__ISLAND_DEBUG__).
const diagnostics = params.get('debug') === '1' ? new FrameDiagnostics({ page: 'sandbox', forceWebGL2, postEnabled }) : undefined;
let controller: SceneRecovery<IslandScene> | undefined;
let loading: LoadingScreen | undefined;
let generation = 0, frameRequest = 0;
let everEntered = false, islandSeed = 1, qualitySamples = 0;
let savedPose: ReturnType<IslandScene['getPose']> | undefined;
async function startIsland(seed: number, built: never[], isletAt?: { x: number; z: number; radius: number }) {
  islandSeed = seed;
  for (const b of built) builtMap.set((b as { id: number }).id, b);
  status.hidden = true; void refreshPlaces();
  app.classList.add('is-loading');
  loading = new LoadingScreen(app, seed);
  const progress = async (step: LoadingProgress) => { loading?.update(step); diagnostics?.report.loading.stages.push({ ...step, atMs: performance.now() }); await paintLoading(); };
  const worldStarted = performance.now();
  try {
    await progress({ stage: 'terrain', message: 'Generating terrain', percent: 1 });
    const world = await generateWorldAsync(seed, 256, 64, async ({ stage, fraction }) => {
      await progress({ stage, message: stage === 'terrain' ? 'Generating terrain' : 'Placing trees', percent: stage === 'terrain' ? 2 + fraction * 26 : 28 + fraction * 10 });
    });
    diagnostics?.phase('worldGeneration', performance.now() - worldStarted);
    // The islet offshore (decision 59): the same terrain the server walks, built from the seed at the place it sent.
    const islet = isletAt ? { world: isletWorld(seed), ...isletAt } : undefined;
    trees = [...world.trees, ...(islet?.world.trees.map(t => ({ ...t, x: t.x + islet.x, z: t.z + islet.z })) ?? [])].map((t, id) => ({ ...t, id, foodId: null }));
    controller = new SceneRecovery(force => createIslandScene(app.querySelector('canvas')!, world, force, {
      postEnabled, pixelRatio, diagnostics, onProgress: progress, onFallback: () => { notice.textContent = 'Graphics interrupted · switching to WebGL2'; notice.hidden = false; },
      snapshot: state ? snapshot(state) : undefined, onSelect: id => select(id), figureScale: 2.2, agentColours: COLOURS,
      onManualCamera: () => setMode('free'), islet,
    }), forceWebGL2, () => {
      // A scene is going away (startup or a lost device): remember the view, stop its loop,
      // and make sure there is a live loading screen for the replacement to report to.
      if (island) savedPose = island.getPose();
      diagnostics?.discontinuity();
      island = undefined; generation++; cancelAnimationFrame(frameRequest);
      if (!loading?.element.isConnected || ['complete', 'error', 'limited'].includes(loading.element.dataset.state ?? '')) {
        loading?.element.remove(); loading = new LoadingScreen(app, islandSeed);
        if (everEntered) loading.element.classList.add('is-recovering');
      }
    },
    () => { notice.textContent = 'Graphics interrupted · switching to WebGL2'; notice.hidden = false; },
    scene => { void runIsland(scene).catch(err => { void controller?.reportFailure(scene, err); }); },
    err => { loading?.fail(err instanceof Error ? err.message : 'Graphics unavailable. Reload to retry.'); });
    await controller.start();
  } catch (err) { loading?.fail(err instanceof Error ? err.message : 'Graphics unavailable. Reload to retry.'); }
}
// One clock: the sun stands where the server's day says, from the very first frame.
let sunAtEntry: ReturnType<IslandScene['sunInfo']> | undefined;
function applyTimeOfDay(scene: IslandScene, s: LiveState) {
  const dayMs = s.world.dayMs ?? 480000, phase = ((s.world.simMs ?? 0) % dayMs) / dayMs;
  scene.setTimeOfDay(phase, s.world.daylight, s.world.storm);
}
async function runIsland(scene: IslandScene) {
  island = scene;
  if (state) applyTimeOfDay(scene, state);
  const token = generation, active = () => token === generation;
  if (state) scene.updateSnapshot(snapshot(state), performance.now());
  builtMap.forEach(b => scene.addStructure(b));
  applyPanels();
  if (savedPose) { scene.setPose(savedPose); savedPose = undefined; if (mode === 'follow' && selected !== undefined) scene.followAgent(selected); }
  else wholeIsland();
  const quality = new AdaptiveQuality(pixelRatio, postEnabled, true), readiness = new ReadinessGate();
  let entered = false, playing = false, start: number | undefined, previous: number | undefined, smoothed: number | undefined, lastHud = 0;
  const enter = () => {
    if (entered || !active()) return;
    entered = true; everEntered = true; app.classList.remove('is-loading'); sunAtEntry = scene.sunInfo();
    if (diagnostics) { diagnostics.report.loading.enteredAtMs = performance.now(); diagnostics.report.loading.entry = loading?.element.dataset.state === 'limited' ? 'manual' : 'automatic'; }
    void loading?.finish().then(() => { if (active()) { quality.reset(); playing = true; } });
  };
  addEventListener('resize', () => { if (state) updateSky(state); if (active()) { scene.resize(); const { left, right } = insets(); scene.setInsets(left, right); quality.reset(); readiness.reset(); if (mode === 'island') wholeIsland(); } });
  if (everEntered) {
    // Recovering after the owner was already in: no second gate, quality adapts at once.
    entered = true; playing = true; app.classList.remove('is-loading', 'is-measuring');
    void loading?.finish(); notice.textContent = `Graphics restored · ${scene.label}`; setTimeout(() => { notice.hidden = true; }, 5000);
  } else {
    loading?.update({ stage: 'settling', message: 'Checking frame rate', percent: 92 });
    app.classList.add('is-measuring'); loading?.measure();
  }
  const tick = (time: number) => {
    if (!active()) return;
    const frameTime = previous === undefined ? undefined : Math.max(0.1, time - previous); previous = time;
    if (frameTime !== undefined) smoothed = smoothed === undefined ? frameTime : smoothed * 0.9 + frameTime * 0.1;
    const change = quality.sample(time, playing);
    if (playing) qualitySamples++;
    if (change) { scene.setQuality(change); readiness.reset(); diagnostics?.qualityChange(time - (start ?? time), change); }
    if (!entered) {
      const r = readiness.sample(time);
      if (r) { if (r.ready) enter(); else loading?.limited(1000 / r.medianMs, enter); }
    }
    start ??= time;
    applyKeys(performance.now());
    if (mode === 'agents' && performance.now() - lastGroupFrame > 2500) { scene.frameAgents(); lastGroupFrame = performance.now(); }
    const renderStarted = performance.now();
    scene.render(time - start);
    if (entered) diagnostics?.record(time, performance.now() - renderStarted, quality.level, performance.now());
    const positions = new Map(scene.agentPositions().map(p => [p.id, p]));
    const shown = draw(positions, performance.now());
    if (time - lastHud > 250 && smoothed !== undefined) {
      fpsLine.textContent = `${(1000 / smoothed).toFixed(0)} fps · ${smoothed.toFixed(1)} ms · ${scene.appliedQuality()} · ${scene.label}`;
      fpsLine.classList.toggle('slow', smoothed > 33); lastHud = time;
    }
    // Test only, with ?debug=1: point the camera at a spot so a check can see what is drawn there.
    if (debug) (window as unknown as { __SANDBOX_LOOK__?: (x: number, z: number) => void }).__SANDBOX_LOOK__ = (x, z) => scene.setPose({ tx: x, ty: 0.5, tz: z, yaw: 0.58, pitch: 1.1, distance: 26 });
    if (debug) (window as unknown as { __SANDBOX_DETAIL__?: (v: number) => void }).__SANDBOX_DETAIL__ = v => scene.setDetail(v);
    if (debug) window.__SANDBOX__ = { get camera() { return scene.cameraInfo(); }, tags: shown, mode, fps: smoothed ? 1000 / smoothed : 0, quality: scene.appliedQuality(), requested: quality.level, entered, qualitySamples, sun: scene.sunInfo(), sunAtEntry, programs: scene.programCount(), islet: scene.isletDrawn(), drawnKinds: scene.structureKinds() };
    frameRequest = requestAnimationFrame(t => { try { tick(t); } catch (err) { void controller?.reportFailure(scene, err); } });
  };
  frameRequest = requestAnimationFrame(tick);
}

connect({
  async hello(h) {
    names = h.names; ensureCards();
    h.history.forEach(e => onEvent(e, false));
    if (controller) return;
    startIsland(h.seed, (h as unknown as { structures?: never[] }).structures ?? [], h.islet);
  },
  state(s) {
    state = s;
    island?.updateSnapshot(snapshot(s), performance.now());
    updateCards(s);
    if (selected !== undefined) renderInspector();
    run.textContent = s.running ? 'Pause' : 'Run';
    if (island) applyTimeOfDay(island, s);
    updateSky(s);
    mixOptions = s.backends;
    if (!dragging && !mixDraft) drawMixer(countsOf(s.mix, mixOptions));
    const p = s.progress;
    const hs = $('.hyp-score'), hsText = p.hypotheses || p.hypothesesMissing ? `${p.hypothesesRight}/${p.hypotheses} agree with the island${p.hypothesesMissing ? ` · ${p.hypothesesMissing} without a prediction` : ''}${p.ideas ? ` · ${p.ideas} untested ideas` : ''}` : '';
    if (hs.textContent !== hsText) hs.textContent = hsText;
    $('.progress').innerHTML = `<span class="slots">${Array.from({ length: p.makeable }, (_, i) => `<i class="${i < p.found ? 'on' : ''}"></i>`).join('')}</span>
      <span class="slots big">${Array.from({ length: p.structures }, (_, i) => `<i class="${i < p.built ? 'on' : ''}"></i>`).join('')}</span>
      <span class="count">${p.found}/${p.makeable} made · ${p.built}/${p.structures} built · ${p.skills} skills · ${p.councils} councils</span>`;
  },
  event: e => onEvent(e),
  down() { status.hidden = false; status.textContent = 'Lost the island server. Is it running?'; },
});
setMode('island');
