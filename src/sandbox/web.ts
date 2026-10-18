import './sandbox.css';
import './web.css';
import { COLOURS, connect, factTexts, FeedEvent, GOLD, LEARN, LiveState, SKILL } from './stream';

// The web as a knowledge nucleus. At the core, every fact the island's minds hold,
// brighter the more of them know it; gold where something was made. Around it, the
// eight minds in orbit, each linked to what it knows. Live teaching sends a mint
// packet from teacher to learner and lights the fact; councils pull their members in.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas class="nucleus"></canvas>
  <header class="top">
    <strong class="title">First Island · the web</strong>
    <span class="sep"></span>
    <div class="legend"><span><i style="background:${LEARN}"></i>knowledge passed</span><span><i style="background:${GOLD}"></i>something made</span><span><i style="background:#7c8a94"></i>found to do nothing</span><span><i style="background:#5cd6ff"></i>where things are</span><span><i style="background:${SKILL}"></i>skill taught</span></div>
    <span class="fps" title="Frame rate while something is moving; the web draws nothing when nothing changes">idle</span>
    <a class="web-link" href="/sandbox.html">The island ↗</a>
  </header>
  <aside class="rail right web-inspector"><section class="panel"><h3>The web</h3><div class="summary"></div></section>
    <section class="panel"><h3 class="sel-title">Recent teaching</h3><div class="sel-body"></div></section></aside>`;
const canvas = app.querySelector<HTMLCanvasElement>('canvas.nucleus')!, ctx = canvas.getContext('2d')!;
// Everything that only changes when the data changes is drawn once into this layer.
// A frame then costs one image copy, plus whatever is actually moving.
const layer = document.createElement('canvas'), lctx = layer.getContext('2d')!;
let dirty = true, layerSignature = '';
const DPR = Math.min(devicePixelRatio, 1.5);
let draws = 0, litLinks = 0;
const summary = app.querySelector('.summary')!, selTitle = app.querySelector('.sel-title')!, selBody = app.querySelector('.sel-body')!;
let names: string[] = [];
let state: LiveState | undefined;
let facts: string[] = [];
let fetching = false;
type Transfer = { teacher: number; learners: number[]; fact: number; text: string; t: number; via: string };
const transfers: Transfer[] = [];
const speech = new Map<string, number>();
let discoveries = 0, councils = 0;
type Packet = { from: number; to: number | { fact: number }; at: number; ms: number; colour: string; size: number };
const packets: Packet[] = [];
const MAX_PACKETS = 240;
const pulses: Array<{ fact?: number; at: number; colour: string; core?: boolean }> = [];
let selected: { agent: number } | { fact: number } | undefined;
let openCouncil: { members: number[]; until: number } | undefined;

const kindOf = (text: string) => / makes nothing$| does nothing$/.test(text) ? 'inert' : / makes | can be built$/.test(text) ? 'made' : / is found at /.test(text) ? 'place' : 'other';
const KIND_COLOUR: Record<string, string> = { inert: '#7c8a94', made: GOLD, place: '#5cd6ff', other: '#c9d3dc' };

async function refreshFacts() { if (fetching) return; fetching = true; try { facts = await factTexts(); } finally { fetching = false; } }

// ---------- layout ----------
// Reserve room for the inspector only while it is on screen.
const inspectorWidth = () => { const el = document.querySelector('.web-inspector'); return el && getComputedStyle(el).display !== 'none' ? 312 : 0; };
const centre = () => ({ x: (innerWidth - inspectorWidth()) / 2, y: innerHeight / 2 + 26 });
const coreRadius = () => Math.min(innerWidth - inspectorWidth(), innerHeight - 60) * 0.2;
const orbitRadius = () => Math.min(innerWidth - inspectorWidth(), innerHeight - 60) * 0.4;
function factPos(i: number) {
  // Golden-angle packing keeps the core even however many facts there are.
  // A fixed capacity keeps every fact where it is as new ones arrive.
  // Fixed spacing: a fact's place depends only on its own number, never on how many there are,
  // so nothing moves when new facts arrive (past 160 the core simply grows outward).
  const c = centre(), r = coreRadius() * Math.sqrt((i + 0.5) / 160);
  const a = i * 2.39996323;
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
}
function agentPos(i: number, now: number) {
  void now; const c = centre(), drift = 0;
  const pull = openCouncil && openCouncil.members.includes(i) ? 0.72 : 1;
  const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, names.length) + drift;
  return { x: c.x + Math.cos(a) * orbitRadius() * pull, y: c.y + Math.sin(a) * orbitRadius() * pull };
}
const knowers = (f: number) => (state?.agents ?? []).filter(a => a.knownIds.includes(f)).map(a => a.id);

// ---------- events ----------
function onEvent(e: FeedEvent, live = true) {
  if (e.agent === undefined) return;
  const now = performance.now();
  if (e.type === 'learn') {
    const fact = Number(e.data?.fact);
    transfers.push({ teacher: e.agent, learners: e.to ?? [], fact, text: e.text, t: e.t, via: String(e.data?.via ?? 'told') });
    if (transfers.length > 400) transfers.shift();
    if (live) for (const to of e.to ?? []) { packets.push({ from: e.agent, to, at: now, ms: 1600, colour: LEARN, size: 4 }); packets.push({ from: e.agent, to: { fact }, at: now, ms: 900, colour: LEARN, size: 3 }); }
    if (live) pulses.push({ fact, at: now + 900, colour: LEARN });
    if (fact >= facts.length) void refreshFacts();
  }
  if (e.type === 'say') for (const to of e.to ?? []) { const k = [e.agent, to].sort().join('-'); speech.set(k, (speech.get(k) ?? 0) + 1); if (live) packets.push({ from: e.agent, to, at: now, ms: 1200, colour: 'rgba(230,238,242,.5)', size: 2 }); }
  if (e.type === 'learn_skill' && live) for (const to of e.to ?? []) packets.push({ from: e.agent, to, at: now, ms: 1800, colour: SKILL, size: 6 });
  if (e.type === 'skill_written' && live) pulses.push({ at: now, colour: SKILL, core: true });
  if (e.type === 'discovery') { discoveries++; if (live) pulses.push({ at: now, colour: GOLD, core: true }); }
  if (e.type === 'council_open') { councils++; if (live) openCouncil = { members: (e.data?.members as number[]) ?? [], until: Date.now() + 60000 }; }
  if (e.type === 'council_split' && live) ((e.data?.parts as Array<{ agent: number }>) ?? []).forEach((p, i) => { if (p.agent !== e.agent) packets.push({ from: e.agent!, to: p.agent, at: now + i * 120, ms: 1600, colour: GOLD, size: 6 }); });
  if (e.type === 'council_part' && live && e.to?.[0] !== undefined && e.to[0] !== e.agent) packets.push({ from: e.agent, to: e.to[0], at: now, ms: 1400, colour: e.data?.made ? GOLD : '#9aa8b2', size: 5 });
  if (e.type === 'council_merge' && openCouncil) openCouncil.until = Date.now() + 4000;
  if (packets.length > MAX_PACKETS) packets.splice(0, packets.length - MAX_PACKETS);
  if (live) renderInspector();
}

// ---------- inspector ----------
function renderInspector() {
  const totalTransfers = transfers.reduce((n, t) => n + t.learners.length, 0);
  const pr = state?.progress;
  summary.innerHTML = `<div class="stats"><b>${facts.length}</b> facts held · <b>${pr?.found ?? 0}</b> of ${pr?.makeable ?? 0} things made · <b>${pr?.councils ?? 0}</b> councils
    <br><b>${totalTransfers}</b> times knowledge passed recently · <b>${discoveries}</b> recent discoveries</div>
    <p class="muted">Click a mind or a fact to trace it. Click empty space to clear.</p>`;
  const list = (items: Transfer[]) => items.slice(-10).reverse().map(t => `<li><b style="color:${COLOURS[t.teacher]}">${names[t.teacher]}</b> → ${t.learners.map(l => `<b style="color:${COLOURS[l]}">${names[l]}</b>`).join(', ')}<span class="fact-line"> ${escapeHtml(t.text)}${t.via === 'council' ? ' (council)' : ''}</span></li>`).join('');
  if (!selected) { selTitle.textContent = 'Recent teaching'; selBody.innerHTML = `<ol class="tlist">${list(transfers) || '<li class="muted">Nothing taught yet.</li>'}</ol>`; return; }
  if ('agent' in selected) {
    const a = state?.agents[selected.agent], id = selected.agent;
    selTitle.textContent = names[id];
    const taught = transfers.filter(t => t.teacher === id), learned = transfers.filter(t => t.learners.includes(id));
    selBody.innerHTML = `<p>Knows <b>${a?.knownIds.length ?? 0}</b> facts · taught <b>${taught.reduce((n, t) => n + t.learners.length, 0)}</b> times · learned <b>${learned.length}</b> from others</p>
      <h4>Taught</h4><ol class="tlist">${list(taught) || '<li class="muted">nothing yet</li>'}</ol><h4>Learned</h4><ol class="tlist">${list(learned) || '<li class="muted">nothing yet</li>'}</ol>`;
  } else {
    const f = selected.fact, chain = transfers.filter(t => t.fact === f);
    selTitle.textContent = 'A fact';
    selBody.innerHTML = `<p class="fact-big">${escapeHtml(facts[f] ?? '')}</p><p>Known by ${knowers(f).map(i => `<b style="color:${COLOURS[i]}">${names[i]}</b>`).join(', ') || 'nobody now'}</p>
      <h4>How it spread</h4><ol class="tlist">${list(chain) || '<li class="muted">found first-hand, not yet taught</li>'}</ol>`;
  }
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
canvas.addEventListener('click', e => {
  dirty = true;
  const now = performance.now();
  for (let i = 0; i < names.length; i++) { const p = agentPos(i, now); if (Math.hypot(p.x - e.clientX, p.y - e.clientY) < 22) { selected = { agent: i }; renderInspector(); return; } }
  for (let i = 0; i < facts.length; i++) { const p = factPos(i); if (Math.hypot(p.x - e.clientX, p.y - e.clientY) < 8) { selected = { fact: i }; renderInspector(); return; } }
  selected = undefined; renderInspector();
});

// ---------- drawing ----------
function resize() { canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR; layer.width = canvas.width; layer.height = canvas.height; dirty = true; }
addEventListener('resize', resize); resize();
function curve(p: { x: number; y: number }, q: { x: number; y: number }, t: number) {
  const c = centre(), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const cx = mx + (c.x - mx) * 0.45, cy = my + (c.y - my) * 0.45, u = 1 - t;
  return { x: u * u * p.x + 2 * u * t * cx + t * t * q.x, y: u * u * p.y + 2 * u * t * cy + t * t * q.y, cx, cy };
}
function drawLayer(now: number) {
  const g = lctx, c = centre(), W = innerWidth, H = innerHeight;
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = 'round';
  const sel = selected;
  const focusAgent = sel && 'agent' in sel ? sel.agent : undefined, focusFact = sel && 'fact' in sel ? sel.fact : undefined;
  g.strokeStyle = 'rgba(120,170,200,.10)'; g.lineWidth = 1;
  g.beginPath(); g.arc(c.x, c.y, orbitRadius(), 0, Math.PI * 2); g.stroke();
  const p = state?.progress;
  if (p) {
    g.strokeStyle = 'rgba(255,211,77,.18)'; g.lineWidth = 4; g.beginPath(); g.arc(c.x, c.y, coreRadius() + 18, -Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.strokeStyle = GOLD; g.beginPath(); g.arc(c.x, c.y, coreRadius() + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.found / Math.max(1, p.makeable))); g.stroke();
    g.fillStyle = 'rgba(255,211,77,.8)'; g.font = '600 11px system-ui'; g.textAlign = 'center';
    g.fillText(`${p.found} of ${p.makeable} things made`, c.x, c.y + coreRadius() + 38);
  }
  for (const [k, n] of speech) {
    const [a, b] = k.split('-').map(Number), pa = agentPos(a, now), pb = agentPos(b, now);
    const dim = focusAgent !== undefined && a !== focusAgent && b !== focusAgent;
    g.strokeStyle = `rgba(200,220,235,${dim ? 0.015 : Math.min(0.08, 0.02 + n * 0.002)})`; g.lineWidth = 1;
    const m = curve(pa, pb, 0); g.beginPath(); g.moveTo(pa.x, pa.y); g.quadraticCurveTo(m.cx, m.cy, pb.x, pb.y); g.stroke();
  }
  // Each mind's links to what it knows. Selecting a fact shows only that fact's links.
  litLinks = 0;
  for (const a of state?.agents ?? []) {
    const pa = agentPos(a.id, now);
    if (focusFact !== undefined) {
      if (!a.knownIds.includes(focusFact) || focusFact >= facts.length) continue;
      const q = factPos(focusFact); g.strokeStyle = COLOURS[a.id]; g.globalAlpha = 0.9; g.lineWidth = 2;
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(q.x, q.y); g.stroke(); litLinks++; continue;
    }
    g.strokeStyle = COLOURS[a.id]; g.lineWidth = 1;
    g.globalAlpha = focusAgent === undefined ? 0.1 : a.id === focusAgent ? 0.4 : 0.03;
    for (const f of a.knownIds) { if (f >= facts.length) continue; const q = factPos(f); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(q.x, q.y); g.stroke(); }
  }
  g.globalAlpha = 1;
  const counts = new Map<number, number>();
  for (const a of state?.agents ?? []) for (const f of a.knownIds) counts.set(f, (counts.get(f) ?? 0) + 1);
  facts.forEach((text, i) => {
    const q = factPos(i), n = counts.get(i) ?? 0, kind = kindOf(text), col = KIND_COLOUR[kind];
    const dim = (focusAgent !== undefined && !state?.agents[focusAgent]?.knownIds.includes(i)) || (focusFact !== undefined && i !== focusFact);
    g.globalAlpha = dim ? 0.12 : kind === 'inert' ? 0.45 : 0.4 + 0.6 * (n / Math.max(1, names.length));
    g.fillStyle = col;
    if (kind === 'made') { const a0 = g.globalAlpha; g.globalAlpha = a0 * 0.3; g.beginPath(); g.arc(q.x, q.y, 9, 0, Math.PI * 2); g.fill(); g.globalAlpha = a0; }
    g.beginPath(); g.arc(q.x, q.y, (kind === 'inert' ? 1.5 : 2.5) + n * (kind === 'inert' ? 0.25 : 0.6) + (i === focusFact ? 3 : 0), 0, Math.PI * 2); g.fill();
  });
  g.globalAlpha = 1;
  names.forEach((name, i) => {
    const q = agentPos(i, now), a = state?.agents[i];
    const dim = (focusAgent !== undefined && focusAgent !== i) || (focusFact !== undefined && !a?.knownIds.includes(focusFact));
    g.globalAlpha = dim ? 0.35 : 1;
    if (openCouncil?.members.includes(i)) { g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, 24, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = COLOURS[i]; g.globalAlpha *= 0.18; g.beginPath(); g.arc(q.x, q.y, 18, 0, Math.PI * 2); g.fill(); g.globalAlpha = dim ? 0.35 : 1;
    g.fillStyle = COLOURS[i]; g.beginPath(); g.arc(q.x, q.y, a?.thinking ? 9 : 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e6eef2'; g.font = '600 13px system-ui'; g.textAlign = 'center'; g.fillText(name, q.x, q.y - 26);
    g.fillStyle = '#a5b4be'; g.font = '11px system-ui'; g.fillText(`${a?.knownIds.length ?? 0} facts${a?.skills.length ? ` · ${a.skills.length} skills` : ''}`, q.x, q.y + 32);
    g.globalAlpha = 1;
  });
}

let lastFrame: number | undefined, smoothed: number | undefined, lastHud = 0;
const fpsLine = app.querySelector('.fps')!;
function draw(now: number) {
  requestAnimationFrame(draw);
  if (openCouncil && Date.now() > openCouncil.until) { openCouncil = undefined; dirty = true; }
  // The static layer is redrawn only when what it shows has changed.
  const signature = `${facts.length}|${(state?.agents ?? []).map(a => `${a.knownIds.length}${a.thinking ? 't' : ''}${a.skills.length}`).join(',')}|${state?.progress.found}|${speech.size}|${openCouncil?.members.join('.') ?? ''}`;
  if (signature !== layerSignature) { layerSignature = signature; dirty = true; }
  const animating = packets.length > 0 || pulses.length > 0;
  if (!dirty && !animating) {
    lastFrame = undefined;
    if (now - lastHud > 500) { fpsLine.textContent = 'idle · nothing to redraw'; lastHud = now; }
    return;
  }
  if (dirty) { drawLayer(now); dirty = false; }
  draws++;
  if (lastFrame !== undefined) { const dt = now - lastFrame; smoothed = smoothed === undefined ? dt : smoothed * 0.9 + dt * 0.1; }
  lastFrame = now;
  if (now - lastHud > 250 && smoothed !== undefined) { fpsLine.textContent = `${(1000 / smoothed).toFixed(0)} fps · ${smoothed.toFixed(1)} ms`; fpsLine.classList.toggle('slow', smoothed > 33); lastHud = now; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(layer, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const c = centre();
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pu = pulses[i], t = (now - pu.at) / 1200; if (t < 0) continue; if (t > 1) { pulses.splice(i, 1); continue; }
    const q = pu.core ? c : pu.fact !== undefined && pu.fact < facts.length ? factPos(pu.fact) : c;
    ctx.strokeStyle = pu.colour; ctx.globalAlpha = 1 - t; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(q.x, q.y, (pu.core ? coreRadius() * 1.2 : 14) * t + 2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = packets.length - 1; i >= 0; i--) {
    const pk = packets[i], t = (now - pk.at) / pk.ms; if (t < 0) continue; if (t > 1) { packets.splice(i, 1); continue; }
    const from = agentPos(pk.from, now), to = typeof pk.to === 'number' ? agentPos(pk.to, now) : pk.to.fact < facts.length ? factPos(pk.to.fact) : c;
    const at = curve(from, to, t);
    ctx.fillStyle = pk.colour; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(at.x, at.y, pk.size * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(at.x, at.y, pk.size, 0, Math.PI * 2); ctx.fill();
  }
}

connect({
  hello(h) { names = h.names; void refreshFacts().then(() => { h.history.forEach(e => onEvent(e, false)); renderInspector(); }); },
  state(s) { state = s; if (s.facts > facts.length) void refreshFacts(); },
  event: e => onEvent(e),
  down() { summary.textContent = 'Lost the island server.'; },
});
requestAnimationFrame(draw);

// ?debug=1: one stable object, created once, read through getters. Nothing runs per frame.
if (new URLSearchParams(location.search).get('debug') === '1') {
  (window as unknown as { __WEB__: unknown }).__WEB__ = {
    get draws() { return draws; }, get packets() { return packets.length; }, get fps() { return smoothed ? 1000 / smoothed : 0; },
    get litLinks() { return litLinks; }, get knowers() { return selected && 'fact' in selected ? knowers(selected.fact).length : -1; },
    selectFact: (f: number) => { selected = { fact: f }; dirty = true; renderInspector(); },
  };
}
