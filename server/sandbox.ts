// Sandbox server: a fixed cast of agents on the seeded island. Minds think
// through the mind router; the world applies the island's laws; knowledge
// passes between agents as facts; councils split, branch and merge a problem
// as parallel model calls (the torrent). Every event streams to the browser.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateWorld } from '../src/world/generate';
import { Ground } from '../src/sim/navigation';
import { makeScrubber } from '../src/sandbox/scrub';
import { LAWS, ITEMS, combine, Item } from './laws';
import { Backend, callModel, describe, perMinute, stats } from './router';

const PORT = Number(process.env.SANDBOX_PORT ?? 8787);
const SEED = Number(process.env.SANDBOX_SEED ?? 1);
const MIND_CAP = Number(process.env.MAX_CALLS_PER_MIN ?? 30);
const COUNCIL_CAP = Number(process.env.COUNCIL_CALLS_PER_MIN ?? 40);
const CONCURRENCY = Number(process.env.MIND_CONCURRENCY ?? 2);
const HEAR_RANGE = 9;
const WALK_SPEED = 1.6;
const STATE_DIR = process.env.SANDBOX_STATE_DIR ?? join(homedir(), '.local', 'share', 'first-island');
const STATE_FILE = join(STATE_DIR, `sandbox-seed-${SEED}.json`);

let denyTerms: string[] = [];
try { denyTerms = readFileSync(process.env.ISLAND_DENY_LIST ?? '', 'utf8').split('\n'); } catch { /* no list */ }
const scrub = makeScrubber(denyTerms);

const world = generateWorld(SEED);
const ground = new Ground(world);
const nodes = ground.nodes;
const habitable = ground.habitable;
type GNode = typeof nodes[number];

const byKey = (score: (n: GNode) => number) => habitable.reduce((best, id) => (score(nodes[id]) > score(nodes[best]) ? id : best), habitable[0]);
const treeCount = (n: GNode) => world.trees.filter(t => Math.hypot(t.x - n.x, t.z - n.z) < 4).length;
const PLACES: Record<string, number> = {
  'the peak': byKey(n => n.y), 'north shore': byKey(n => -n.z - n.y * 3), 'south shore': byKey(n => n.z - n.y * 3),
  'east shore': byKey(n => n.x - n.y * 3), 'west shore': byKey(n => -n.x - n.y * 3), 'the forest': byKey(treeCount),
};
const nearestPlace = (x: number, z: number) => Object.entries(PLACES)
  .sort((a, b) => Math.hypot(nodes[a[1]].x - x, nodes[a[1]].z - z) - Math.hypot(nodes[b[1]].x - x, nodes[b[1]].z - z))[0][0];
function gatherable(n: GNode): Item[] {
  const out: Item[] = [];
  if (n.y < 1.2) out.push('stone', 'shell');
  if (world.trees.some(t => Math.hypot(t.x - n.x, t.z - n.z) < 2.5)) out.push('wood', 'fibre', 'fruit');
  if (n.y > 4) out.push('flint');
  return out;
}

// ---------- knowledge: facts are the unit that passes between minds ----------
const facts: string[] = [];
function factId(text: string): number { let i = facts.indexOf(text); if (i < 0) { i = facts.length; facts.push(text); } return i; }

type Activity = 'wandering' | 'seeking food' | 'eating' | 'resting' | 'seeking cover' | 'socialising';
interface SandboxAgent {
  id: number; name: string; node: number; x: number; y: number; z: number; path: number[]; activity: Activity;
  thought: string; said: string; saidAt: number; inventory: Item[]; made: string[]; known: number[]; heard: string[];
  lastResult: string; busyUntil: number; thinking: boolean; nextThink: number; council: number | null;
}
const NAMES = ['Avo', 'Brill', 'Cassa', 'Dun', 'Esk', 'Fenn', 'Ilo', 'Maru'];
const start = PLACES['south shore'];
const cluster: number[] = [start];
for (let i = 0; i < cluster.length && cluster.length < 40; i++) for (const n of nodes[cluster[i]].neighbours) if (!cluster.includes(n)) cluster.push(n);
let agents: SandboxAgent[] = NAMES.map((name, id) => {
  const node = cluster[(id * 4) % cluster.length];
  return { id, name, node, x: nodes[node].x, y: nodes[node].y, z: nodes[node].z, path: [], activity: 'wandering', thought: '', said: '',
    saidAt: 0, inventory: [], made: [], known: [], heard: [], lastResult: 'You have just woken on the shore.', busyUntil: 0,
    thinking: false, nextThink: 1000 + id * 700, council: null };
});
const byName = (n: string) => agents.find(o => o.name.toLowerCase() === String(n).trim().toLowerCase());
const near = (a: SandboxAgent) => agents.filter(o => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < HEAR_RANGE);

// ---------- events ----------
interface FeedEvent { seq: number; t: number; type: string; agent?: number; text: string; to?: number[]; data?: Record<string, unknown> }
let events: FeedEvent[] = [];
let seq = 0;
const clients = new Set<ServerResponse>();
function emit(type: string, text: string, agent?: number, to?: number[], data?: Record<string, unknown>) {
  const e: FeedEvent = { seq: ++seq, t: Date.now(), type, agent, text: scrub(text), to, data };
  events.push(e); if (events.length > 800) events.shift();
  send('event', e);
}
function send(kind: string, data: unknown) { const line = `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(line); }

function learn(learner: SandboxAgent, fact: number): boolean {
  if (learner.known.includes(fact)) return false;
  learner.known.push(fact); return true;
}
/** One teaching moment: a fact passes from teacher to every listener who did not know it. */
function teach(teacher: SandboxAgent, fact: number, listeners: SandboxAgent[], via: string) {
  const learners = listeners.filter(o => o !== teacher && learn(o, fact));
  if (learners.length) emit('learn', facts[fact], teacher.id, learners.map(o => o.id), { fact, via });
}

// ---------- movement ----------
function route(from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]); const queue = [from];
  for (let i = 0; i < queue.length; i++) { const cur = queue[i]; if (cur === to) break; for (const n of nodes[cur].neighbours) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); } }
  if (!prev.has(to)) return [];
  const path: number[] = []; for (let c = to; c !== from; c = prev.get(c)!) path.unshift(c);
  return path;
}
function stepAgents(dt: number) {
  for (const a of agents) {
    if (!a.path.length) continue;
    const next = nodes[a.path[0]]; const dx = next.x - a.x, dz = next.z - a.z, d = Math.hypot(dx, dz), move = WALK_SPEED * dt;
    if (d <= move) { a.node = a.path.shift()!; a.x = next.x; a.y = next.y; a.z = next.z; }
    else { a.x += dx / d * move; a.z += dz / d * move; a.y += (next.y - a.y) * Math.min(1, move / d); }
    if (!a.path.length) { a.activity = 'wandering'; a.lastResult = `You arrived at ${nearestPlace(a.x, a.z)}.`; }
  }
}

// ---------- the laws applied to a combine, recording what was learned ----------
function tryCombine(a: SandboxAgent, x: Item, y: Item, inventoryOwner: Pick<SandboxAgent, 'inventory'> = a): { text: string; made?: string; fact?: number } {
  const result = combine(inventoryOwner.inventory, x, y);
  if (!result) return { text: `lacks ${x} and ${y}` };
  if (result === 'nothing') { const f = factId(`${x} + ${y} makes nothing`); learn(a, f); return { text: `${x} + ${y}: nothing happens`, fact: f }; }
  const f = factId(`${x} + ${y} makes ${result}`); learn(a, f);
  const first = !agents.some(o => o.made.includes(result));
  if (!a.made.includes(result)) a.made.push(result);
  emit(first ? 'discovery' : 'action', first ? `DISCOVERS ${result} (${x} + ${y})` : `makes ${result}`, a.id);
  return { text: `${x} + ${y} made ${result}`, made: result, fact: f };
}

interface Decision { thought?: string; say?: string; share?: unknown; action?: string; target?: string; with?: string; problem?: string }
function act(a: SandboxAgent, d: Decision) {
  if (d.thought) { a.thought = scrub(String(d.thought)).slice(0, 180); emit('thought', a.thought, a.id); }
  const listeners = near(a);
  if (d.say) {
    a.said = scrub(String(d.say)).slice(0, 180); a.saidAt = Date.now(); a.activity = 'socialising';
    for (const o of listeners) { o.heard.push(`${a.name}: ${a.said}`); if (o.heard.length > 6) o.heard.shift(); }
    emit('say', a.said, a.id, listeners.map(o => o.id));
  }
  const shared = (Array.isArray(d.share) ? d.share : []).map(Number).filter(f => a.known.includes(f)).slice(0, 4);
  for (const f of shared) teach(a, f, listeners, 'told');
  const action = String(d.action ?? 'wait').toLowerCase(), target = String(d.target ?? '').toLowerCase();
  const here = nodes[a.node];
  if (action === 'walk') {
    const friend = byName(target);
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
    else {
      a.inventory.push(want); a.activity = want === 'fruit' ? 'seeking food' : 'seeking cover'; a.lastResult = `You gathered ${want}.`;
      learn(a, factId(`${want} is found at ${nearestPlace(a.x, a.z)}`)); emit('action', `gathers ${want}`, a.id);
    }
  } else if (action === 'combine') {
    const r = tryCombine(a, target, String(d.with ?? '').toLowerCase());
    a.lastResult = r.made ? `You made ${r.made}!` : `Combining: ${r.text}.`;
    if (!r.made) emit('result', `combines: ${r.text}`, a.id);
  } else if (action === 'eat') {
    const i = a.inventory.indexOf('fruit');
    if (i < 0) a.lastResult = 'You have no fruit.';
    else { a.inventory.splice(i, 1); a.activity = 'eating'; a.busyUntil = Date.now() + 3000; a.lastResult = 'You ate fruit.'; emit('action', 'eats fruit', a.id); }
  } else if (action === 'rest') {
    a.activity = 'resting'; a.busyUntil = Date.now() + 5000; a.lastResult = 'You rested.'; emit('action', 'rests', a.id);
  } else if (action === 'council') {
    void council(a, String(d.problem || d.target || 'What can we make together that none of us has made?'));
  } else a.lastResult = 'You waited.';
}

// ---------- minds ----------
let mindMode: 'scripted' | Backend = (process.env.MIND_MODE as Backend) ?? 'scripted';
let running = false;
let inFlight = 0;
const mindCalls: number[] = [], councilCalls: number[] = [];
const within = (xs: number[], cap: number) => { const now = Date.now(); while (xs.length && now - xs[0] > 60000) xs.shift(); return xs.length < cap; };
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const SCRIPT_THOUGHTS = ['What is beyond the trees?', 'This one is sharp.', 'I should find the others.', 'The peak looks far.',
  'Maybe these two fit together.', 'Others may know what I do not.'];
function scriptedMind(a: SandboxAgent): Decision {
  const r = Math.random(), d: Decision = { thought: pick(SCRIPT_THOUGHTS) };
  if (a.known.length) d.share = [pick(a.known)];
  if (r < 0.08 && near(a).length >= 2) { d.action = 'council'; d.problem = 'What can we make that none of us has made?'; }
  else if (r < 0.38) { d.action = 'walk'; d.target = pick([...Object.keys(PLACES), ...agents.filter(o => o !== a).map(o => o.name)]); }
  else if (r < 0.65) d.action = 'gather';
  else if (r < 0.8 && a.inventory.length >= 2) { d.action = 'combine'; d.target = a.inventory[0]; d.with = a.inventory[1]; }
  else if (r < 0.92) { d.action = 'wait'; d.say = pick(['Over here!', 'I found something.', 'Listen to this.']); }
  else d.action = 'rest';
  return d;
}

const SYSTEM = `You are one inhabitant of a small island. You and seven others woke here with no memories.
Island laws: ${LAWS.join(' ')} Facts pass between minds only when spoken: share the numbers of facts you want nearby listeners to learn.
A council: when a problem is too big for one mind, you may call the people near you into a council. The council may split the problem into parts, try competing plans side by side, and merge what worked.
You control only yourself. Each turn reply with ONE JSON object and nothing else:
{"thought": "<one short private thought>", "say": "<words spoken aloud, or empty>", "share": [<fact numbers to teach listeners>], "action": "walk|gather|combine|eat|rest|wait|council", "target": "<place, person or item>", "with": "<second item for combine>", "problem": "<for council: the problem>"}
Places: ${Object.keys(PLACES).join(', ')}. Items: ${ITEMS.join(', ')}.
Be curious, share what you learn, and call a council when working together would help. Keep words short.`;

const factList = (ids: number[]) => ids.slice(-24).map(f => `[${f}] ${facts[f]}`).join('; ') || 'none';
function prompt(a: SandboxAgent): string {
  return [`You are ${a.name}. You are near ${nearestPlace(a.x, a.z)}.`, `Last result: ${a.lastResult}`,
    `Here you could gather: ${gatherable(nodes[a.node]).join(', ') || 'nothing'}.`, `You carry: ${a.inventory.join(', ') || 'nothing'}.`,
    `Facts you know: ${factList(a.known)}.`, `Nearby: ${near(a).map(o => o.name).join(', ') || 'nobody'}.`,
    `Recently heard: ${a.heard.join(' | ') || 'nothing'}.`, `Your last thought: ${a.thought || 'none'}.`, 'Reply with the JSON object only.'].join('\n');
}

async function think(a: SandboxAgent) {
  a.thinking = true;
  try {
    let d: Decision;
    if (mindMode !== 'scripted' && within(mindCalls, MIND_CAP)) {
      mindCalls.push(Date.now()); inFlight++;
      try { d = await callModel(mindMode, SYSTEM, prompt(a), 'mind') as Decision; } catch { d = scriptedMind(a); } finally { inFlight--; }
    } else d = scriptedMind(a);
    if (running && a.council === null) act(a, d);
  } finally { a.thinking = false; a.nextThink = Date.now() + (mindMode === 'scripted' ? 3000 + Math.random() * 3000 : 1500); }
}
function scheduleMinds() {
  if (!running || clients.size === 0) return;
  const now = Date.now();
  const ready = agents.filter(a => !a.thinking && a.council === null && !a.path.length && now >= a.busyUntil && now >= a.nextThink)
    .sort((x, y) => x.nextThink - y.nextThink);
  for (const a of ready) { if (mindMode !== 'scripted' && inFlight >= CONCURRENCY) break; void think(a); }
}

// ---------- councils: the torrent ----------
interface CouncilRecord { id: number; chair: number; members: number[]; problem: string; mode: string; parts: Array<{ agent: number; task: string; finding?: string; result?: string; made?: string }>;
  winner: number | null; summary: string; calls: number; openedAt: number; closedAt?: number; observer: boolean }
let councils: CouncilRecord[] = [];
async function councilCall(system: string, user: string, rec: CouncilRecord, fallback: () => Record<string, unknown>): Promise<Record<string, unknown>> {
  if (mindMode === 'scripted' || !within(councilCalls, COUNCIL_CAP)) return fallback();
  councilCalls.push(Date.now()); rec.calls++;
  try { return await callModel(mindMode, system, user, 'council'); } catch { return fallback(); }
}
const COUNCIL_SYSTEM = `You are inhabitants of a small island holding a council. Island laws: ${LAWS.join(' ')}
Items: ${ITEMS.join(', ')}. Reply with ONE JSON object and nothing else.`;

async function council(chair: SandboxAgent, problem: string, observer = false) {
  const members = [chair, ...near(chair).filter(o => o.council === null)].slice(0, 6);
  if (members.length < 2) { chair.lastResult = 'Nobody is near enough to hold a council.'; emit('result', 'calls a council but nobody is near', chair.id); return; }
  const rec: CouncilRecord = { id: councils.length + 1, chair: chair.id, members: members.map(m => m.id), problem: scrub(problem).slice(0, 160), mode: '',
    parts: [], winner: null, summary: '', calls: 0, openedAt: Date.now(), observer };
  councils.push(rec);
  for (const m of members) { m.council = rec.id; m.path = []; m.activity = 'socialising'; }
  emit('council_open', `${observer ? '[observer asked] ' : ''}calls a council: "${rec.problem}"`, chair.id, rec.members.filter(i => i !== chair.id), { council: rec.id, members: rec.members });
  try {
    const pool = members.map(m => `${m.name} carries ${m.inventory.join(', ') || 'nothing'}`).join('; ');
    const pooled = [...new Set(members.flatMap(m => m.known))];
    // 1. The chair chooses the pattern: split, branch, or none.
    const plan = await councilCall(COUNCIL_SYSTEM, [`Chair: ${chair.name}. Problem: ${rec.problem}`, `Members: ${members.map(m => m.name).join(', ')}.`,
      `What the council carries: ${pool}.`, `Facts the council knows: ${factList(pooled)}.`,
      'Decide how to work: "split" the problem into different parts for different members, "branch" into competing plans tried side by side, or "none" if one person can do it.',
      'Reply: {"mode": "split|branch|none", "parts": [{"agent": "<member name>", "task": "<short task>"}]}'].join('\n'), rec,
      () => ({ mode: 'branch', parts: members.map(m => ({ agent: m.name, task: 'try a pair nobody has tried' })) }));
    rec.mode = ['split', 'branch', 'none'].includes(String(plan.mode)) ? String(plan.mode) : 'branch';
    const parts = (Array.isArray(plan.parts) ? plan.parts as Array<Record<string, string>> : [])
      .map(p => ({ agent: byName(p.agent), task: scrub(String(p.task ?? '')).slice(0, 120) }))
      .filter(p => p.agent && rec.members.includes(p.agent.id)).slice(0, 6) as Array<{ agent: SandboxAgent; task: string }>;
    if (rec.mode === 'none' || parts.length === 0) parts.splice(0, parts.length, { agent: chair, task: rec.problem });
    rec.parts = parts.map(p => ({ agent: p.agent.id, task: p.task }));
    emit('council_split', `${rec.mode.toUpperCase()}: ${parts.map(p => `${p.agent.name}: ${p.task}`).join(' | ')}`, chair.id, parts.map(p => p.agent.id),
      { council: rec.id, mode: rec.mode, parts: rec.parts });
    // 2. Fan out. The council pools what it carries and deals it out, so each part
    // works with its own items; every part runs as its own parallel model call.
    const pot = members.flatMap(m => m.inventory.splice(0));
    const hands: Item[][] = parts.map(() => []);
    pot.forEach((item, i) => hands[i % parts.length].push(item));
    const results = await Promise.all(parts.map(async (p, i) => {
      const mine = hands[i];
      const answer = await councilCall(COUNCIL_SYSTEM, [`You are ${p.agent.name} in a council chaired by ${chair.name}. Problem: ${rec.problem}`,
        `Your part (${rec.mode}): ${p.task}`, `Items dealt to you for this part: ${mine.join(', ') || 'none'}.`, `Facts the council knows: ${factList(pooled)}.`,
        mine.length >= 2 ? 'Pick one pair from your items to combine for your part, avoiding pairs already known to make nothing.' : 'You have too few items to combine; report what the council should do next.',
        'Reply: {"finding": "<one short line>", "try": {"a": "<item>", "b": "<item>"}}'].join('\n'), rec,
        () => ({ finding: 'trying a pair', try: { a: mine[0] ?? '', b: mine[1] ?? '' } }));
      const t = (answer.try ?? {}) as Record<string, string>;
      const x = String(t.a ?? '').toLowerCase(), y = String(t.b ?? '').toLowerCase();
      let r: { text: string; made?: string; fact?: number } = { text: mine.length >= 2 ? `has no ${x} and ${y} in hand` : 'too few items to try' };
      if (mine.length >= 2) r = tryCombine(p.agent, x, y, { inventory: mine } as SandboxAgent);
      p.agent.inventory.push(...mine.splice(0));
      rec.parts[i] = { ...rec.parts[i], finding: scrub(String(answer.finding ?? '')).slice(0, 120), result: r.text, made: r.made };
      emit('council_part', `${p.agent.name}: ${rec.parts[i].finding} (${r.text})`, p.agent.id, [chair.id], { council: rec.id, part: i, made: r.made ?? null });
      return { agent: p.agent, ...r };
    }));
    // 3. Merge: the chair keeps what worked and every member learns it.
    const merged = await councilCall(COUNCIL_SYSTEM, [`You chair the council (${chair.name}). Problem: ${rec.problem}. Mode: ${rec.mode}.`,
      `Results: ${results.map(r => `${r.agent.name}: ${r.text}`).join('; ')}.`,
      'Merge: say which member\'s result best answers the problem (or none) and summarise what the council learned in one line.',
      'Reply: {"winner": "<member name or none>", "summary": "<one line>"}'].join('\n'), rec,
      () => { const w = results.find(r => r.made); return { winner: w ? w.agent.name : 'none', summary: w ? `${w.agent.name} made ${w.made}.` : 'Nothing new this time.' }; });
    const winner = byName(String(merged.winner ?? ''));
    rec.winner = winner && rec.members.includes(winner.id) ? winner.id : null;
    rec.summary = scrub(String(merged.summary ?? '')).slice(0, 180);
    for (const r of results) if (r.fact !== undefined) teach(r.agent, r.fact, members, 'council');
    rec.closedAt = Date.now();
    emit('council_merge', `MERGE: ${rec.summary}${rec.winner !== null ? ` (best: ${agents[rec.winner].name})` : ''} · ${rec.calls} calls`, chair.id, rec.members.filter(i => i !== chair.id),
      { council: rec.id, winner: rec.winner, calls: rec.calls });
    for (const m of members) m.lastResult = `Council: ${rec.summary}`;
  } finally {
    rec.closedAt ??= Date.now();
    for (const m of members) { m.council = null; m.nextThink = Date.now() + 1000; }
  }
}

// ---------- persistence: the island resumes after a restart ----------
function save() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const data = { version: 1, seed: SEED, facts, seq, events: events.slice(-400), councils: councils.slice(-100),
      agents: agents.map(a => ({ ...a, path: [], thinking: false, council: null })) };
    writeFileSync(STATE_FILE + '.tmp', JSON.stringify(data)); renameSync(STATE_FILE + '.tmp', STATE_FILE);
  } catch (err) { console.error('save failed', (err as Error).message); }
}
function load() {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    if (data.version !== 1 || data.seed !== SEED) return;
    facts.push(...data.facts); seq = data.seq; events = data.events; councils = data.councils ?? [];
    agents = data.agents.map((a: SandboxAgent) => ({ ...a, nextThink: Date.now() + 1000 + a.id * 500, busyUntil: 0 }));
    console.log(`resumed ${agents.length} agents, ${facts.length} facts, ${councils.length} councils`);
  } catch { /* fresh island */ }
}
if (process.env.SANDBOX_FRESH !== '1') load();
setInterval(save, 15000);
process.on('SIGTERM', () => { save(); process.exit(0); });
process.on('SIGINT', () => { save(); process.exit(0); });

// ---------- the loop ----------
let tick = 0, last = Date.now();
setInterval(() => { const now = Date.now(), dt = (now - last) / 1000; last = now; if (running) stepAgents(dt); scheduleMinds(); }, 100);
setInterval(() => {
  tick++;
  send('state', { tick, running, mindMode, calls: stats.total, failed: stats.failed, mindError: stats.lastError, perMin: perMinute(), cap: MIND_CAP + COUNCIL_CAP,
    councilCalls: stats.byPurpose.council ?? 0, facts: facts.length,
    councils: councils.filter(c => !c.closedAt || Date.now() - c.closedAt < 6000).map(c => ({ id: c.id, chair: c.chair, members: c.members, problem: c.problem, mode: c.mode, open: !c.closedAt, winner: c.winner })),
    agents: agents.map(a => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, activity: a.activity, thought: a.thought,
      said: Date.now() - a.saidAt < 8000 ? a.said : '', thinking: a.thinking, inventory: a.inventory, known: a.made, facts: a.known.length, council: a.council })) });
}, 250);

// ---------- http ----------
function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
}
createServer(async (req, res) => {
  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ seed: SEED, names: NAMES, history: events.slice(-200), councils: councils.slice(-30) })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url === '/api/councils') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(councils)); return; }
  if (req.url === '/api/control' && req.method === 'POST') {
    const b = await body(req);
    if (b.cmd === 'start') { running = true; emit('system', 'The island wakes.'); }
    if (b.cmd === 'pause') { running = false; emit('system', 'Paused.'); }
    if (b.cmd === 'council') {
      const a = agents[Number(b.agent)];
      if (a && a.council === null) { emit('intervention', `observer asks ${a.name} to call a council`, a.id); void council(a, String(b.problem || 'What can we make that none of us has made?'), true); }
    }
    if (b.minds === 'haiku' || b.minds === 'luna' || b.minds === 'scripted') { mindMode = b.minds; emit('system', `Minds: ${mindMode}`); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ running, mindMode }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`sandbox server on :${PORT} seed ${SEED} minds ${mindMode} · ${describe()}`));
