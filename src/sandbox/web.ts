import { COLOURS, connect, FeedEvent, LiveState } from './stream';

// The web: one node per agent, one strand per pair that has heard each other.
// Strands thicken with every word carried and flash when a new one arrives.
document.title = 'Island Web';
document.body.style.cssText = 'margin:0;background:#0b141c;color:#e8eef2;font:14px system-ui,sans-serif;overflow:hidden';
const canvas = document.createElement('canvas');
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:12px;left:12px;max-width:min(420px,calc(100% - 24px));background:rgba(10,20,28,.85);padding:10px 14px;border-radius:10px';
panel.innerHTML = '<strong>The web</strong> <span style="font-size:11px;opacity:.65;border:1px solid #5a7385;border-radius:4px;padding:0 4px">observer</span><div class="sum" style="opacity:.8;font-size:12px;margin:4px 0"></div><ol class="last" style="margin:0;padding-left:18px;font-size:12px"></ol>';
document.body.append(canvas, panel);
const ctx = canvas.getContext('2d')!;
let names: string[] = [];
let state: LiveState | undefined;
const strands = new Map<string, { a: number; b: number; count: number; last: number; text: string }>();
const flashes: Array<{ from: number; to: number; at: number }> = [];
const discoveries = new Map<number, string[]>();

function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
addEventListener('resize', resize); resize();

function place(i: number) {
  const r = Math.min(innerWidth, innerHeight) * 0.34, cx = innerWidth / 2, cy = innerHeight / 2 + 20;
  const ang = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, names.length);
  return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
}
function onEvent(e: FeedEvent) {
  if (e.type === 'say' && e.agent !== undefined) for (const to of e.to ?? []) {
    const key = [e.agent, to].sort().join('-');
    const s = strands.get(key) ?? { a: Math.min(e.agent, to), b: Math.max(e.agent, to), count: 0, last: 0, text: '' };
    s.count++; s.last = e.t; s.text = `${names[e.agent]} to ${names[to]}: "${e.text}"`; strands.set(key, s);
    flashes.push({ from: e.agent, to, at: performance.now() });
  }
  if (e.type === 'discovery' && e.agent !== undefined) {
    const list = discoveries.get(e.agent) ?? []; list.push(e.text.replace(/^DISCOVERS /, '')); discoveries.set(e.agent, list);
  }
  const words = [...strands.values()].reduce((n, s) => n + s.count, 0);
  panel.querySelector('.sum')!.textContent = `${strands.size} strands · ${words} words carried · ${[...discoveries.values()].flat().length} discoveries`;
  const last = [...strands.values()].sort((x, y) => y.last - x.last).slice(0, 5);
  const ol = panel.querySelector('.last')!; ol.innerHTML = '';
  for (const s of last) { const li = document.createElement('li'); li.textContent = s.text; ol.append(li); }
}

function draw(now: number) {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const s of strands.values()) {
    const p = place(s.a), q = place(s.b);
    const age = (Date.now() - s.last) / 1000;
    ctx.strokeStyle = `rgba(200,225,240,${Math.max(0.25, 0.9 - age / 120)})`;
    ctx.lineWidth = Math.min(10, 1 + Math.log2(1 + s.count) * 1.6);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo((p.x + q.x) / 2 + (innerWidth / 2 - (p.x + q.x) / 2) * 0.35, (p.y + q.y) / 2 + (innerHeight / 2 - (p.y + q.y) / 2) * 0.35, q.x, q.y);
    ctx.stroke();
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], t = (now - f.at) / 1200;
    if (t > 1) { flashes.splice(i, 1); continue; }
    const p = place(f.from), q = place(f.to);
    ctx.fillStyle = COLOURS[f.from];
    ctx.beginPath(); ctx.arc(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, 6, 0, Math.PI * 2); ctx.fill();
  }
  names.forEach((name, i) => {
    const p = place(i), a = state?.agents[i];
    ctx.fillStyle = COLOURS[i];
    ctx.beginPath(); ctx.arc(p.x, p.y, a?.thinking ? 20 : 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8eef2'; ctx.textAlign = 'center'; ctx.font = '600 14px system-ui';
    ctx.fillText(name, p.x, p.y - 28);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#ffe27a';
    const made = discoveries.get(i);
    if (made) ctx.fillText(made.slice(-3).join(', '), p.x, p.y + 36);
    if (a?.said) { ctx.fillStyle = '#ffffff'; ctx.font = 'italic 12px system-ui'; ctx.fillText(`"${a.said.slice(0, 50)}"`, p.x, p.y + 52); }
  });
  requestAnimationFrame(draw);
}
connect({
  hello(h) { names = h.names; h.history.forEach(onEvent); },
  state(s) { state = s; },
  event: onEvent,
  down() { panel.querySelector('.sum')!.textContent = 'Lost the island server.'; },
});
requestAnimationFrame(draw);
