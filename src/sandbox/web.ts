import './sandbox.css';
import './web.css';
import { COLOURS, connect, factTexts, FeedEvent, GOLD, LEARN, LiveState } from './stream';

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
    <div class="legend"><span><i style="background:${LEARN}"></i>knowledge passed</span><span><i style="background:${GOLD}"></i>something made</span><span><i style="background:#7c8a94"></i>found to do nothing</span><span><i style="background:#5cd6ff"></i>where things are</span></div>
    <a class="web-link" href="/sandbox.html">The island ↗</a>
  </header>
  <aside class="rail right web-inspector"><section class="panel"><h3>The web</h3><div class="summary"></div></section>
    <section class="panel"><h3 class="sel-title">Recent teaching</h3><div class="sel-body"></div></section></aside>`;
const canvas = app.querySelector<HTMLCanvasElement>('canvas.nucleus')!, ctx = canvas.getContext('2d')!;
const links = document.createElement('canvas'), lctx = links.getContext('2d')!;
let linkSignature = '', linkDrawnAt = 0;
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
const RIGHT = 312;
const skip = new URLSearchParams(location.search).get('skip') ?? '';
const centre = () => ({ x: (innerWidth - RIGHT) / 2, y: innerHeight / 2 + 26 });
const coreRadius = () => Math.min(innerWidth - RIGHT, innerHeight - 60) * 0.2;
const orbitRadius = () => Math.min(innerWidth - RIGHT, innerHeight - 60) * 0.4;
function factPos(i: number) {
  // Golden-angle packing keeps the core even however many facts there are.
  const c = centre(), n = Math.max(1, facts.length), r = coreRadius() * Math.sqrt((i + 0.5) / n);
  const a = i * 2.39996323;
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
}
function agentPos(i: number, now: number) {
  const c = centre(), drift = now / 60000;
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
  const now = performance.now();
  for (let i = 0; i < names.length; i++) { const p = agentPos(i, now); if (Math.hypot(p.x - e.clientX, p.y - e.clientY) < 22) { selected = { agent: i }; renderInspector(); return; } }
  for (let i = 0; i < facts.length; i++) { const p = factPos(i); if (Math.hypot(p.x - e.clientX, p.y - e.clientY) < 8) { selected = { fact: i }; renderInspector(); return; } }
  selected = undefined; renderInspector();
});

// ---------- drawing ----------
function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
addEventListener('resize', resize); resize();
function curve(p: { x: number; y: number }, q: { x: number; y: number }, t: number) {
  const c = centre(), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const cx = mx + (c.x - mx) * 0.45, cy = my + (c.y - my) * 0.45, u = 1 - t;
  return { x: u * u * p.x + 2 * u * t * cx + t * t * q.x, y: u * u * p.y + 2 * u * t * cy + t * t * q.y, cx, cy };
}
function draw(now: number) {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const c = centre(), W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  if (openCouncil && Date.now() > openCouncil.until) openCouncil = undefined;
  const sel = selected;
  const focusAgent = sel && 'agent' in sel ? sel.agent : undefined, focusFact = sel && 'fact' in sel ? sel.fact : undefined;
  // Orbit and progress arc.
  ctx.strokeStyle = 'rgba(120,170,200,.10)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c.x, c.y, orbitRadius(), 0, Math.PI * 2); ctx.stroke();
  const p = state?.progress;
  if (p) {
    ctx.strokeStyle = 'rgba(255,211,77,.18)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c.x, c.y, coreRadius() + 18, -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(c.x, c.y, coreRadius() + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.found / Math.max(1, p.makeable))); ctx.stroke();
    ctx.fillStyle = 'rgba(255,211,77,.8)'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${p.found} of ${p.makeable} things made`, c.x, c.y + coreRadius() + 38);
  }
  // Faint history of who has spoken to whom.
  for (const [k, n] of skip.includes('speech') ? [] : speech) {
    const [a, b] = k.split('-').map(Number), pa = agentPos(a, now), pb = agentPos(b, now);
    const dim = focusAgent !== undefined && a !== focusAgent && b !== focusAgent;
    ctx.strokeStyle = `rgba(200,220,235,${dim ? 0.015 : Math.min(0.08, 0.02 + n * 0.002)})`; ctx.lineWidth = 1;
    const m = curve(pa, pb, 0); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo(m.cx, m.cy, pb.x, pb.y); ctx.stroke();
  }
  // Each mind's links to what it knows: hundreds of lines, so they live on their
  // own layer, redrawn about once a second or when knowledge or focus changes.
  const signature = `${facts.length}|${(state?.agents ?? []).map(a => a.knownIds.length).join(',')}|${focusAgent}|${focusFact}|${W}x${H}`;
  if (!skip.includes('links') && (signature !== linkSignature || now - linkDrawnAt > 1000)) {
    linkSignature = signature; linkDrawnAt = now;
    if (links.width !== canvas.width || links.height !== canvas.height) { links.width = canvas.width; links.height = canvas.height; }
    lctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); lctx.clearRect(0, 0, W, H); lctx.lineWidth = 1;
    for (const a of state?.agents ?? []) {
      const pa = agentPos(a.id, now);
      const dim = (focusAgent !== undefined && a.id !== focusAgent) || (focusFact !== undefined && !a.knownIds.includes(focusFact));
      lctx.strokeStyle = COLOURS[a.id]; lctx.globalAlpha = dim ? 0.03 : focusAgent === a.id || focusFact !== undefined ? 0.4 : 0.1;
      for (const f of a.knownIds) { if (f >= facts.length) continue; const q = factPos(f); lctx.beginPath(); lctx.moveTo(pa.x, pa.y); lctx.lineTo(q.x, q.y); lctx.stroke(); }
    }
  }
  if (!skip.includes('links')) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(links, 0, 0); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // The core: facts, sized and lit by how many minds hold them.
  const counts = new Map<number, number>();
  for (const a of state?.agents ?? []) for (const f of a.knownIds) counts.set(f, (counts.get(f) ?? 0) + 1);
  (skip.includes('facts') ? [] : facts).forEach((text, i) => {
    const q = factPos(i), n = counts.get(i) ?? 0, col = KIND_COLOUR[kindOf(text)];
    const dim = focusAgent !== undefined && !state?.agents[focusAgent]?.knownIds.includes(i);
    const kind = kindOf(text);
    ctx.globalAlpha = dim ? 0.12 : kind === 'inert' ? 0.45 : 0.4 + 0.6 * (n / Math.max(1, names.length));
    ctx.fillStyle = col;
    if (kind === 'made') { const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * 0.3; ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = a0; }
    ctx.beginPath(); ctx.arc(q.x, q.y, (kind === 'inert' ? 1.5 : 2.5) + n * (kind === 'inert' ? 0.25 : 0.6) + (i === focusFact ? 3 : 0), 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pu = pulses[i], t = (now - pu.at) / 1200; if (t < 0) continue; if (t > 1) { pulses.splice(i, 1); continue; }
    const q = pu.core ? c : pu.fact !== undefined && pu.fact < facts.length ? factPos(pu.fact) : c;
    ctx.strokeStyle = pu.colour; ctx.globalAlpha = 1 - t; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(q.x, q.y, (pu.core ? coreRadius() * 1.2 : 14) * t + 2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let i = packets.length - 1; i >= 0; i--) {
    const pk = packets[i], t = (now - pk.at) / pk.ms; if (t < 0) continue; if (t > 1) { packets.splice(i, 1); continue; }
    const from = agentPos(pk.from, now), to = typeof pk.to === 'number' ? agentPos(pk.to, now) : pk.to.fact < facts.length ? factPos(pk.to.fact) : c;
    const at = curve(from, to, t);
    // A soft halo and a bright centre: cheap enough for a burst of hundreds.
    ctx.fillStyle = pk.colour; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(at.x, at.y, pk.size * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(at.x, at.y, pk.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // The minds.
  names.forEach((name, i) => {
    const q = agentPos(i, now), a = state?.agents[i];
    const dim = focusAgent !== undefined && focusAgent !== i || focusFact !== undefined && !a?.knownIds.includes(focusFact);
    ctx.globalAlpha = dim ? 0.35 : 1;
    if (openCouncil?.members.includes(i)) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 24, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = COLOURS[i]; ctx.globalAlpha *= 0.18; ctx.beginPath(); ctx.arc(q.x, q.y, 18, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = dim ? 0.35 : 1;
    ctx.fillStyle = COLOURS[i]; ctx.beginPath(); ctx.arc(q.x, q.y, a?.thinking ? 9 : 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6eef2'; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(name, q.x, q.y - 26);
    ctx.fillStyle = '#a5b4be'; ctx.font = '11px system-ui'; ctx.fillText(`${a?.knownIds.length ?? 0} facts`, q.x, q.y + 32);
    ctx.globalAlpha = 1;
  });
  requestAnimationFrame(draw);
}

connect({
  hello(h) { names = h.names; void refreshFacts().then(() => { h.history.forEach(e => onEvent(e, false)); renderInspector(); }); },
  state(s) { state = s; if (s.facts > facts.length) void refreshFacts(); },
  event: e => onEvent(e),
  down() { summary.textContent = 'Lost the island server.'; },
});
requestAnimationFrame(draw);
