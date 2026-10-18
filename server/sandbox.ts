// Sandbox v1 server: a fixed cast of agents on the seeded island. Minds are
// scripted or cheap model calls; the world applies the island's laws and
// streams every thought, word and action to the browser over SSE.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateWorld } from '../src/world/generate';
import { Ground } from '../src/sim/navigation';
import { makeScrubber } from '../src/sandbox/scrub';
import { LAWS, RECIPES, ITEMS, combine, Item } from './laws';

const PORT = Number(process.env.SANDBOX_PORT ?? 8787);
const SEED = Number(process.env.SANDBOX_SEED ?? 1);
const MAX_CALLS_PER_MIN = Number(process.env.MAX_CALLS_PER_MIN ?? 30);
const CONCURRENCY = Number(process.env.MIND_CONCURRENCY ?? 2);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? (() => {
  try { return execSync('command -v claude', { shell: '/bin/bash', encoding: 'utf8' }).trim() || 'claude'; } catch { return 'claude'; }
})();
const HEAR_RANGE = 9;
const WALK_SPEED = 1.6;

let denyTerms: string[] = [];
try { denyTerms = readFileSync(process.env.ISLAND_DENY_LIST ?? '', 'utf8').split('\n'); } catch { /* no list */ }
const scrub = makeScrubber(denyTerms);

const world = generateWorld(SEED);
const ground = new Ground(world);
const nodes = ground.nodes;
const habitable = ground.habitable;

// Named places, so minds can speak about the island.
const byKey = (score: (n: typeof nodes[number]) => number) =>
  habitable.reduce((best, id) => (score(nodes[id]) > score(nodes[best]) ? id : best), habitable[0]);
const treeCount = (n: typeof nodes[number]) => world.trees.filter(t => Math.hypot(t.x - n.x, t.z - n.z) < 4).length;
const PLACES: Record<string, number> = {
  'the peak': byKey(n => n.y),
  'north shore': byKey(n => -n.z - n.y * 3),
  'south shore': byKey(n => n.z - n.y * 3),
  'east shore': byKey(n => n.x - n.y * 3),
  'west shore': byKey(n => -n.x - n.y * 3),
  'the forest': byKey(treeCount),
};
const nearestPlace = (x: number, z: number) => Object.entries(PLACES)
  .sort((a, b) => Math.hypot(nodes[a[1]].x - x, nodes[a[1]].z - z) - Math.hypot(nodes[b[1]].x - x, nodes[b[1]].z - z))[0][0];

// What can be gathered where: the beach gives stone and shells, trees give wood,
// fibre and fruit. Gathering is a law, not a choice the world makes for them.
function gatherable(n: typeof nodes[number]): Item[] {
  const out: Item[] = [];
  if (n.y < 1.2) out.push('stone', 'shell');
  if (world.trees.some(t => Math.hypot(t.x - n.x, t.z - n.z) < 2.5)) out.push('wood', 'fibre', 'fruit');
  if (n.y > 4) out.push('flint');
  return out;
}

type Activity = 'wandering' | 'seeking food' | 'eating' | 'resting' | 'seeking cover' | 'socialising';
interface SandboxAgent {
  id: number; name: string; node: number; x: number; y: number; z: number;
  path: number[]; activity: Activity; thought: string; said: string; saidAt: number;
  inventory: Item[]; known: string[]; heard: string[]; lastResult: string;
  busyUntil: number; thinking: boolean; nextThink: number;
}
const NAMES = ['Avo', 'Brill', 'Cassa', 'Dun', 'Esk', 'Fenn', 'Ilo', 'Maru'];
const start = PLACES['south shore'];
const cluster: number[] = [start];
for (let i = 0; i < cluster.length && cluster.length < 40; i++) for (const n of nodes[cluster[i]].neighbours) if (!cluster.includes(n)) cluster.push(n);
const agents: SandboxAgent[] = NAMES.map((name, id) => {
  const node = cluster[(id * 4) % cluster.length];
  return { id, name, node, x: nodes[node].x, y: nodes[node].y, z: nodes[node].z, path: [], activity: 'wandering',
    thought: '', said: '', saidAt: 0, inventory: [], known: [], heard: [], lastResult: 'You have just woken on the shore.',
    busyUntil: 0, thinking: false, nextThink: 1000 + id * 700 };
});

// ---------- events to the browser ----------
interface FeedEvent { seq: number; t: number; type: string; agent?: number; text: string; to?: number[] }
const events: FeedEvent[] = [];
let seq = 0;
const clients = new Set<ServerResponse>();
function emit(type: string, text: string, agent?: number, to?: number[]) {
  const e: FeedEvent = { seq: ++seq, t: Date.now(), type, agent, text: scrub(text), to };
  events.push(e); if (events.length > 500) events.shift();
  send('event', e);
}
function send(kind: string, data: unknown) {
  const line = `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(line);
}

// ---------- movement ----------
function route(from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]; if (cur === to) break;
    for (const n of nodes[cur].neighbours) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(to)) return [];
  const path: number[] = []; for (let c = to; c !== from; c = prev.get(c)!) path.unshift(c);
  return path;
}
function stepAgents(dt: number) {
  for (const a of agents) {
    if (!a.path.length) continue;
    const next = nodes[a.path[0]];
    const dx = next.x - a.x, dz = next.z - a.z, d = Math.hypot(dx, dz);
    const move = WALK_SPEED * dt;
    if (d <= move) { a.node = a.path.shift()!; a.x = next.x; a.y = next.y; a.z = next.z; }
    else { a.x += dx / d * move; a.z += dz / d * move; a.y += (next.y - a.y) * Math.min(1, move / d); }
    if (!a.path.length) { a.activity = 'wandering'; a.lastResult = `You arrived at ${nearestPlace(a.x, a.z)}.`; }
  }
}

// ---------- the laws applied to one action ----------
interface Decision { thought?: string; say?: string; action?: string; target?: string; with?: string }
function act(a: SandboxAgent, d: Decision) {
  if (d.thought) { a.thought = scrub(String(d.thought)).slice(0, 160); emit('thought', a.thought, a.id); }
  if (d.say) {
    a.said = scrub(String(d.say)).slice(0, 160); a.saidAt = Date.now(); a.activity = 'socialising';
    const listeners = agents.filter(o => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < HEAR_RANGE);
    for (const o of listeners) { o.heard.push(`${a.name}: ${a.said}`); if (o.heard.length > 6) o.heard.shift(); }
    emit('say', a.said, a.id, listeners.map(o => o.id));
  }
  const action = String(d.action ?? 'wait').toLowerCase();
  const target = String(d.target ?? '').toLowerCase();
  const here = nodes[a.node];
  if (action === 'walk') {
    const friend = agents.find(o => o.name.toLowerCase() === target);
    let goal = friend ? friend.node : PLACES[Object.keys(PLACES).find(p => target.includes(p.replace('the ', ''))) ?? ''];
    if (goal === undefined) goal = habitable[Math.floor(Math.random() * habitable.length)];
    a.path = route(a.node, goal); a.activity = friend ? 'socialising' : 'wandering';
    const where = friend ? friend.name : (Object.entries(PLACES).find(([, n]) => n === goal)?.[0] ?? 'somewhere new');
    a.lastResult = a.path.length ? `You are walking to ${where}.` : 'You cannot find a way there.';
    emit('action', `walks to ${where}`, a.id);
  } else if (action === 'gather') {
    const options = gatherable(here);
    const want = options.find(i => target.includes(i)) ?? options[Math.floor(Math.random() * options.length)];
    if (!want) { a.lastResult = 'There is nothing to gather here.'; emit('result', 'finds nothing to gather here', a.id); }
    else if (a.inventory.length >= 6) { a.lastResult = 'Your hands are full.'; emit('result', 'has full hands', a.id); }
    else { a.inventory.push(want); a.activity = want === 'fruit' ? 'seeking food' : 'seeking cover'; a.lastResult = `You gathered ${want}.`; emit('action', `gathers ${want}`, a.id); }
  } else if (action === 'combine') {
    const x = target as Item, y = String(d.with ?? '').toLowerCase() as Item;
    const result = combine(a.inventory, x, y);
    if (!result) { a.lastResult = `You do not have ${x} and ${y}.`; emit('result', `tries to combine ${x} and ${y} but lacks them`, a.id); }
    else if (result === 'nothing') { a.lastResult = `Combining ${x} and ${y} does nothing.`; emit('result', `combines ${x} and ${y}: nothing happens`, a.id); }
    else {
      a.lastResult = `You made ${result}!`;
      const first = !agents.some(o => o.known.includes(result));
      if (!a.known.includes(result)) a.known.push(result);
      emit(first ? 'discovery' : 'action', first ? `DISCOVERS ${result} (${x} + ${y})` : `makes ${result}`, a.id);
    }
  } else if (action === 'eat') {
    const i = a.inventory.indexOf('fruit');
    if (i < 0) { a.lastResult = 'You have no fruit.'; } else { a.inventory.splice(i, 1); a.activity = 'eating'; a.busyUntil = Date.now() + 3000; a.lastResult = 'You ate fruit.'; emit('action', 'eats fruit', a.id); }
  } else if (action === 'rest') {
    a.activity = 'resting'; a.busyUntil = Date.now() + 5000; a.lastResult = 'You rested.'; emit('action', 'rests', a.id);
  } else {
    a.lastResult = 'You waited.';
  }
}

// ---------- minds ----------
let mindMode: 'scripted' | 'haiku' = (process.env.MIND_MODE as 'haiku') ?? 'scripted';
let running = false;
let calls: number[] = [];
let totalCalls = 0, failedCalls = 0;
let inFlight = 0;
let lastMindError = '';

const SCRIPT_THOUGHTS = ['What is beyond the trees?', 'This stone is sharp.', 'I should find others.', 'The peak looks far.',
  'Wood floats. Interesting.', 'I am hungry.', 'Maybe these two things fit together.', 'Someone is calling.'];
function scriptedMind(a: SandboxAgent): Decision {
  const r = Math.random(), pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const d: Decision = { thought: pick(SCRIPT_THOUGHTS) };
  if (r < 0.35) { d.action = 'walk'; d.target = pick([...Object.keys(PLACES), ...agents.filter(o => o !== a).map(o => o.name)]); }
  else if (r < 0.65) d.action = 'gather';
  else if (r < 0.8 && a.inventory.length >= 2) { d.action = 'combine'; d.target = a.inventory[0]; d.with = a.inventory[1]; }
  else if (r < 0.9) { d.action = 'wait'; d.say = pick(['Over here!', 'I found something.', 'Has anyone seen fruit?', `Hello ${pick(agents).name}.`]); }
  else d.action = 'rest';
  return d;
}

const emptyMcp = join(mkdtempSync(join(tmpdir(), 'sandbox-')), 'mcp.json');
writeFileSync(emptyMcp, '{"mcpServers":{}}');
const SYSTEM = `You are one inhabitant of a small island. You and seven others woke here with no memories.
Island laws: ${LAWS.join(' ')}
You control only yourself. Each turn reply with ONE JSON object and nothing else:
{"thought": "<one short private thought>", "say": "<optional words spoken aloud, or empty>", "action": "walk|gather|combine|eat|rest|wait", "target": "<place, person, or item>", "with": "<second item for combine>"}
Places: ${Object.keys(PLACES).join(', ')}. Items: ${ITEMS.join(', ')}.
Be curious. Try combining things to discover what the island allows. Talk to the others and share what you learn. Keep words short.`;

function prompt(a: SandboxAgent): string {
  const near = agents.filter(o => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < HEAR_RANGE).map(o => o.name);
  return [`You are ${a.name}. You are near ${nearestPlace(a.x, a.z)}.`,
    `Last result: ${a.lastResult}`,
    `Here you could gather: ${gatherable(nodes[a.node]).join(', ') || 'nothing'}.`,
    `You carry: ${a.inventory.join(', ') || 'nothing'}. You have made: ${a.known.join(', ') || 'nothing yet'}.`,
    `Nearby: ${near.join(', ') || 'nobody'}.`,
    `Recently heard: ${a.heard.join(' | ') || 'nothing'}.`,
    `Your last thought: ${a.thought || 'none'}.`, 'Reply with the JSON object only.'].join('\n');
}

function haikuMind(a: SandboxAgent): Promise<Decision> {
  return new Promise(resolve => {
    const child = spawn(CLAUDE_BIN, ['-p', '--model', 'haiku', '--tools', '', '--setting-sources', '', '--strict-mcp-config',
      '--mcp-config', emptyMcp, '--no-session-persistence', '--system-prompt', SYSTEM, prompt(a)],
      { stdio: ['ignore', 'pipe', 'pipe'], cwd: tmpdir() });
    let out = '';
    const timer = setTimeout(() => child.kill(), 45000);
    // A missing or broken model command must never stop the island.
    let failed = false;
    child.on('error', err => { failed = true; clearTimeout(timer); failedCalls++; lastMindError = String(err.message); resolve(scriptedMind(a)); });
    child.stdout.on('data', c => { out += c; });
    child.on('close', () => {
      clearTimeout(timer);
      if (failed) return;
      const m = out.match(/\{[\s\S]*\}/);
      try { resolve(JSON.parse(m ? m[0] : '')); } catch { failedCalls++; resolve(scriptedMind(a)); }
    });
  });
}

function budgetLeft(): boolean { const now = Date.now(); calls = calls.filter(t => now - t < 60000); return calls.length < MAX_CALLS_PER_MIN; }

async function think(a: SandboxAgent) {
  a.thinking = true;
  try {
    let d: Decision;
    if (mindMode === 'haiku' && budgetLeft()) { calls.push(Date.now()); totalCalls++; inFlight++; try { d = await haikuMind(a); } finally { inFlight--; } }
    else d = scriptedMind(a);
    if (running) act(a, d);
  } finally { a.thinking = false; a.nextThink = Date.now() + (mindMode === 'haiku' ? 1500 : 3000 + Math.random() * 3000); }
}

function scheduleMinds() {
  if (!running || clients.size === 0) return;
  const now = Date.now();
  const ready = agents.filter(a => !a.thinking && !a.path.length && now >= a.busyUntil && now >= a.nextThink)
    .sort((x, y) => x.nextThink - y.nextThink);
  for (const a of ready) {
    if (mindMode === 'haiku' && inFlight >= CONCURRENCY) break;
    void think(a);
  }
}

// ---------- the loop ----------
let tick = 0, last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = (now - last) / 1000; last = now;
  if (running) stepAgents(dt);
  scheduleMinds();
}, 100);
setInterval(() => {
  tick++;
  send('state', { tick, running, mindMode, calls: totalCalls, failed: failedCalls, mindError: lastMindError, perMin: calls.length, cap: MAX_CALLS_PER_MIN,
    agents: agents.map(a => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, activity: a.activity, thought: a.thought,
      said: Date.now() - a.saidAt < 8000 ? a.said : '', thinking: a.thinking, inventory: a.inventory, known: a.known })) });
}, 250);

// ---------- http ----------
function body(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
}
createServer(async (req, res) => {
  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ seed: SEED, names: NAMES, recipes: RECIPES.length, history: events.slice(-80) })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url === '/api/control' && req.method === 'POST') {
    const b = await body(req);
    if (b.cmd === 'start') { running = true; emit('system', 'The island wakes.'); }
    if (b.cmd === 'pause') { running = false; emit('system', 'Paused.'); }
    if (b.minds === 'haiku' || b.minds === 'scripted') { mindMode = b.minds; emit('system', `Minds: ${mindMode}`); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ running, mindMode }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`sandbox server on :${PORT} seed ${SEED} minds ${mindMode} model command ${CLAUDE_BIN}`));
