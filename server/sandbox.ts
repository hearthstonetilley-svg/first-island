// Sandbox server: a fixed cast of agents on the seeded island. Minds think
// through the mind router; the world applies the island's laws; knowledge
// passes between agents as facts; councils split, branch and merge a problem
// as parallel model calls (the torrent). Every event streams to the browser.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateWorld } from '../src/world/generate';
import { Ground } from '../src/sim/navigation';
import { makeScrubber } from '../src/sandbox/scrub';
import { readClaim as parseClaim } from '../src/sandbox/claim';
import { generateChemistry, react, strike, substance, Ground as Soil } from '../src/sandbox/chemistry';
import { realWorldChemistry } from '../src/sandbox/realworld';
import { markPrediction, readPrediction } from '../src/sandbox/hypothesis';
type Item = string;
import { Backend, BACKENDS, available, callModel, CODEX_HOME, describe, perMinute, stats } from './router';

const PORT = Number(process.env.SANDBOX_PORT ?? 8787);
const SEED = Number(process.env.SANDBOX_SEED ?? 1);
const MIND_CAP = Number(process.env.MAX_CALLS_PER_MIN ?? 15);
const COUNCIL_CAP = Number(process.env.COUNCIL_CALLS_PER_MIN ?? 20);
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
  'east shore': byKey(n => n.x - n.y * 3), 'west shore': byKey(n => -n.x - n.y * 3), 'the grove': byKey(treeCount),
};
// ---------- regions: the agents name the island themselves ----------
// The land is cut into a grid of regions. Nobody tells the agents what anything is called:
// they discover regions by walking into them and give each a name of their own. A name is
// known to whoever gave it, whoever hears it given or said, and whoever visits the place.
const GRID = 9;
const cellOf = (x: number, z: number) => { const c = Math.min(GRID - 1, Math.max(0, Math.floor((x / world.size + 0.5) * GRID))), r = Math.min(GRID - 1, Math.max(0, Math.floor((z / world.size + 0.5) * GRID))); return r * GRID + c; };
const regionNodes = new Map<number, number[]>();
for (const id of habitable) { const g = cellOf(nodes[id].x, nodes[id].z); if (!regionNodes.has(g)) regionNodes.set(g, []); regionNodes.get(g)!.push(id); }
const REGIONS = [...regionNodes.keys()].filter(g => regionNodes.get(g)!.length >= 3).sort((a, b) => a - b);
const centres = new Map<number, number>();
const regionCentre = (g: number) => {
  if (centres.has(g)) return centres.get(g)!;
  const ns = regionNodes.get(g)!; const cx = ns.reduce((n, i) => n + nodes[i].x, 0) / ns.length, cz = ns.reduce((n, i) => n + nodes[i].z, 0) / ns.length;
  const best = ns.reduce((b, i) => (Math.hypot(nodes[i].x - cx, nodes[i].z - cz) < Math.hypot(nodes[b].x - cx, nodes[b].z - cz) ? i : b), ns[0]);
  centres.set(g, best); return best;
};
const placeNames: Record<number, { name: string; by: number; at: number }> = {};
const regionAt = (x: number, z: number) => { const g = cellOf(x, z); return REGIONS.includes(g) ? g : REGIONS.reduce((b, r) => (Math.hypot(nodes[regionCentre(r)].x - x, nodes[regionCentre(r)].z - z) < Math.hypot(nodes[regionCentre(b)].x - x, nodes[regionCentre(b)].z - z) ? r : b), REGIONS[0]); };
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function direction(fx: number, fz: number, tx: number, tz: number) { const ang = Math.atan2(tx - fx, -(tz - fz)); return DIRS[(Math.round(ang / (Math.PI / 4)) + 8) % 8]; }
const soilOfRegion = (g: number) => { const counts: Record<string, number> = {}; for (const i of regionNodes.get(g)!) { const k = soilOf(nodes[i]); counts[k] = (counts[k] ?? 0) + 1; } return Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0]; };
/** What an agent calls a place: its name if the agent knows one, else a plain description. */
function placeLabel(a: SandboxAgent | undefined, g: number) {
  const known = placeNames[g] && (!a || (a.places ?? []).includes(g));
  return known ? placeNames[g].name : `an unnamed ${soilOfRegion(g)} place`;
}
function knowPlace(a: SandboxAgent, g: number) { a.places ??= []; if (!a.places.includes(g)) a.places.push(g); }

// The island's own chemistry: six invented elements, each found in one kind of ground.
// Real-world materials by default (decision 49), so every guess can be checked against reality.
// SANDBOX_CHEMISTRY=invented keeps the seeded invented chemistry for comparison runs.
const CHEMISTRY = process.env.SANDBOX_CHEMISTRY === 'invented' ? 'invented' : 'real';
const chem = CHEMISTRY === 'invented' ? generateChemistry(SEED) : realWorldChemistry();
function soilOf(n: GNode): Soil {
  if (n.y < 1.2) return 'shore';
  if (n.y > 4) return 'high rock';
  return world.trees.some(t => Math.hypot(t.x - n.x, t.z - n.z) < 2.5) ? 'grove' : 'meadow';
}
const gatherable = (n: GNode): Item[] => chem.substances.filter(s => s.tier === 0 && s.ground === soilOf(n)).map(s => s.name);
const describeItem = (name: string) => { const s = substance(chem, name); return s ? `${name} (${s.description})` : name; };
const LAWS = [
  'Each kind of ground (shore, grove, meadow, high rock) yields its own material, and only there.',
  'You can carry six things, and set down anything you carry to make room.',
  'Two things you carry may be combined. Some pairs make something new; most do nothing. Some things change when struck alone.',
  'Some things you make can be set down and built where you stand; what is built stays.',
  'Words carry only a short distance; others hear you only if they are near.',
  'Your strength drains over time, faster at night and in storms. Some things can be eaten to restore it; some cannot, and some sicken. Being near a hut or a wall you have built shelters you from night and storm. With no strength left you collapse and lose what you carry.',
];
function combine(inventory: Item[], a: Item, b: Item): Item | 'nothing' | undefined {
  const i = inventory.indexOf(a); if (i < 0) return undefined;
  const rest = [...inventory]; rest.splice(i, 1);
  const j = rest.indexOf(b); if (j < 0) return undefined;
  const r = react(chem, a, b); if (!r) return 'nothing';
  rest.splice(j, 1); rest.push(r.product); inventory.splice(0, inventory.length, ...rest); itemLedger -= 1;
  return r.product;
}
interface Built { id: number; kind: string; name: string; x: number; y: number; z: number; colour: string; by: number; at: number }
let structures: Built[] = [];

// ---------- knowledge: facts are the unit that passes between minds ----------
const facts: string[] = [];
function factId(text: string): number { let i = facts.indexOf(text); if (i < 0) { i = facts.length; facts.push(text); } return i; }

type Activity = 'wandering' | 'seeking food' | 'eating' | 'resting' | 'seeking cover' | 'socialising';
interface SandboxAgent {
  id: number; name: string; node: number; x: number; y: number; z: number; path: number[]; activity: Activity;
  thought: string; said: string; saidAt: number; inventory: Item[]; made: string[]; known: number[]; heard: string[];
  lastResult: string; busyUntil: number; thinking: boolean; nextThink: number; council: number | null; doing?: string; outcome?: string;
  skills?: string[]; running?: { skill: string; step: number; startedAt: number; made: string[] } | null;
  hyp?: { tried: number; right: number; missing?: number; untested?: number };
  energy?: number; sheltered?: boolean; collapsedUntil?: number; mindEpoch?: number;
  visited?: number[]; places?: number[];
  /** Who made the decision being carried out: the model, or the scripted fallback. */
  source?: Mind;
}

// ---------- disagreement: reading a recipe claim from speech or a fact ----------
// "flint + pyrite makes sparks", "flint and pyrite make sparks", "... makes nothing".
const lastDisagreement: Record<string, number> = {};
const readClaim = (text: string) => parseClaim(text, knownNames);

// ---------- item ledger (test mode): items are conserved ----------
// Every gather adds one, every use, meal, build, set-down or collapse removes what it removes.
// Outside councils (which hold items in hand while they work), what the agents carry must
// equal the ledger; any difference is a duplication or a loss, and the eval fails on it.
let itemLedger = 0, ledgerChecks = 0;
function checkLedger() {
  if (councils.some(c => !c.closedAt)) return;
  const held = agents.reduce((n, a) => n + a.inventory.length, 0);
  if (held !== itemLedger) { emit('ledger_mismatch', `items held ${held}, ledger ${itemLedger}`); itemLedger = held; }
  else if (++ledgerChecks % 10 === 0) emit('ledger_check', `ledger matches: ${held} items held`);
}

// ---------- pressure: hunger, day and night, storms, shelter ----------
// Strength drains all the time and faster at night or in a storm, unless the agent is near
// a hut or wall it has built. Real food restores it; red berries sicken. At no strength an
// agent collapses, loses what it carried and wakes on the shore: hard, but the cast stays.
const DAY_MS = Number(process.env.SANDBOX_DAY_MS ?? 480000);
const DRAIN_PER_S = Number(process.env.SANDBOX_DRAIN ?? 1 / 900);
// The island's own clock advances only while it is running and someone is watching, so a
// pause freezes the day, the weather and every recovery deadline.
let simMs = 0;
const simNow = () => simMs;
const daylight = () => 0.5 + 0.5 * Math.cos((simNow() % DAY_MS) / DAY_MS * Math.PI * 2);
const isNight = () => daylight() < 0.3;
let storm: { until: number } | null = null, nextStorm = 300000 + Math.random() * 300000;
const SHELTERING = ['hut', 'tower'];
// ---------- the director: pacing when the island stalls ----------
// If nothing new is found for a while, the director steps in with something the world could do
// on its own: the sea washes a material ashore near a stuck agent. Every intervention is logged
// and shown, so the owner always knows what was the agents and what was the director.
const DIRECTOR_AFTER_MS = Number(process.env.SANDBOX_DIRECTOR_MS ?? 360000);
let lastProgressSim = 0, lastFound = 0;
function direct() {
  const found = new Set(agents.flatMap(a => a.made)).size + structures.length + Object.keys(placeNames).length;
  if (lastFound === -1) lastFound = found; // an older save: adopt the count without resetting the clock
  if (found !== lastFound) { lastFound = found; lastProgressSim = simNow(); return; }
  if (simNow() - lastProgressSim < DIRECTOR_AFTER_MS) return;
  lastProgressSim = simNow();
  const candidates = agents.filter(a => !a.collapsedUntil && a.council === null && a.inventory.length < 6);
  if (!candidates.length) return;
  const a = pick(candidates);
  const untried = chem.substances.filter(x => x.tier === 0 && !a.inventory.includes(x.name));
  const gift = pick(untried.length ? untried : chem.substances.filter(x => x.tier === 0)).name;
  a.inventory.push(gift); itemLedger += 1;
  a.lastResult = `The sea washed ${describeItem(gift)} up at your feet.`;
  emit('director', `Director: the sea washes ${gift} ashore by ${a.name} (nothing new found for a while)`, a.id, undefined, { gift });
}

function updatePressure(dt: number) {
  const now = simNow();
  if (!storm && now > nextStorm) { storm = { until: now + 60000 + Math.random() * 30000 }; emit('weather', 'A storm sweeps across the island.'); }
  if (storm && now > storm.until) { storm = null; nextStorm = now + 360000 + Math.random() * 360000; emit('weather', 'The storm passes.'); }
  for (const a of agents) {
    a.energy ??= 1;
    if (a.collapsedUntil) {
      if (now < a.collapsedUntil) continue;
      a.collapsedUntil = undefined; a.energy = 0.4;
      const home = PLACES['south shore']; a.node = home; a.x = nodes[home].x; a.y = nodes[home].y; a.z = nodes[home].z; a.path = [];
      a.lastResult = 'You collapsed from weakness, lost what you carried, and woke on the south shore. Find food.';
      emit('result', 'wakes on the south shore, weak and empty-handed', a.id); continue;
    }
    a.sheltered = structures.some(b => SHELTERING.includes(b.kind) && Math.hypot(b.x - a.x, b.z - a.z) < 3);
    let rate = DRAIN_PER_S * (a.activity === 'resting' ? 0.5 : 1);
    if (!a.sheltered) rate *= (isNight() ? 1.8 : 1) * (storm ? 3 : 1);
    if (a.council !== null) rate *= 0.5;
    a.energy = Math.max(0, a.energy - rate * dt);
    if (a.energy <= 0 && a.council === null) {
      itemLedger -= a.inventory.length; a.inventory = []; a.running = null; a.path = []; a.collapsedUntil = now + 20000; a.mindEpoch = (a.mindEpoch ?? 0) + 1;
      emit('collapse', 'COLLAPSES from hunger and exposure', a.id);
    }
  }
}

// ---------- skills: named procedures an agent writes, runs as one action, and teaches ----------
// A skill is a short list of steps (walk, gather, combine, strike, build, drop). Running one
// carries the steps out without asking the mind again, so a learned way of doing things is
// cheap to repeat; teaching one passes the whole procedure, not a single fact.
interface Step { action: string; target?: string; with?: string; expect?: string }
interface Skill { name: string; steps: Step[]; author: number; uses: number; successes: number; made: string[]; at: number }
const skills = new Map<string, Skill>();
const STEP_ACTIONS = ['walk', 'gather', 'combine', 'strike', 'build', 'drop'];
function cleanSteps(raw: unknown): Step[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 8).filter(x => x && typeof x === 'object').map(x => x as Record<string, unknown>)
    .map(x => ({ action: txt(x.action, 20).toLowerCase(), target: txt(x.target, 40) ? scrub(txt(x.target, 40)).toLowerCase() : undefined, with: txt(x.with, 40) ? scrub(txt(x.with, 40)).toLowerCase() : undefined, expect: txt(x.expect, 60) ? scrub(txt(x.expect, 60)) : undefined }))
    .filter(x => STEP_ACTIONS.includes(x.action));
}
const skillLine = (k: Skill) => `"${k.name}": ${k.steps.map(st => [st.action, st.target, st.with ? `+ ${st.with}` : ''].filter(Boolean).join(' ')).join(' → ')} (used ${k.uses}, worked ${k.successes})`;
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
// Viewers who wake the minds. A silent connection (screenshots, probes) watches without spending.
const viewers = new Set<ServerResponse>();
function emit(type: string, text: string, agent?: number, to?: number[], data?: Record<string, unknown>) {
  const e: FeedEvent = { seq: ++seq, t: Date.now(), type, agent, text: scrub(text), to, data };
  // Each agent's latest outcome is the plain record of what last happened to it.
  if (agent !== undefined && ['action', 'result', 'discovery', 'built', 'council_part'].includes(type)) agents[agent].outcome = e.text;
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
    // Walking into a region discovers it, and anyone visiting a named place learns its name.
    const g = regionAt(a.x, a.z);
    a.visited ??= [];
    if (!a.visited.includes(g)) { a.visited.push(g); if (!agents.some(o => o !== a && (o.visited ?? []).includes(g))) emit('explored', `is the first to reach ${placeLabel(a, g)}`, a.id, undefined, { region: g }); }
    if (placeNames[g]) knowPlace(a, g);
    if (!a.path.length) { a.activity = 'wandering'; a.lastResult = `You arrived at ${placeLabel(a, g)}.`; }
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

// ---------- hypotheses: each try carries the agent's prediction, and the world marks it ----------
// The mark is agreement with the island's rules (src/sandbox/hypothesis.ts). A try without a
// usable prediction is counted as missing, never left out, so the score cannot be cherry-picked.
const knownNames = chem.substances.map(x => x.name);
const triedPairs = new Set<string>();
const recall: Record<string, { first: number; right: number }> = {};
const ideas: Array<{ agent: number; idea: string; from: string; at: number }> = [];
let hypTotal = 0, hypRight = 0, hypMissing = 0, hypUntested = 0;
function judge(a: SandboxAgent, expect: unknown, tried: string, made: string | undefined, source?: Mind) {
  const prediction = readPrediction(typeof expect === 'string' ? scrub(expect) : expect, knownNames);
  const mark = markPrediction(prediction, made ?? null);
  a.hyp ??= { tried: 0, right: 0, missing: 0, untested: 0 };
  a.hyp.missing ??= 0; a.hyp.untested ??= 0;
  // Recitation: a right guess on a pair nobody on the island had tried before can only come from
  // what the mind already knew. Every executed try counts as tried, scored or not, so a later
  // guess on the same pair is never a first try.
  const pairKey = tried.split(' + ').map(x => x.trim()).sort().join(' + ');
  const firstTry = !triedPairs.has(pairKey); triedPairs.add(pairKey);
  if (mark === 'missing') { a.hyp.missing++; hypMissing++; return; }
  if (mark === 'untested') {
    a.hyp.untested++; hypUntested++;
    const idea = prediction.kind === 'other' ? prediction.text : '';
    ideas.push({ agent: a.id, idea, from: tried, at: Date.now() }); if (ideas.length > 200) ideas.shift();
    emit('idea', `proposes ${idea} from ${tried} (untested: the island has no recipe for it)`, a.id, undefined, { idea, from: tried });
    return;
  }
  a.hyp.tried++; hypTotal++; if (mark === 'correct') { a.hyp.right++; hypRight++; }
  // Only a guess that names a product counts: "nothing" is right most of the time by chance.
  if (firstTry && prediction.kind === 'thing') { const m = source ?? a.source ?? 'scripted'; recall[m] ??= { first: 0, right: 0 }; recall[m].first++; if (mark === 'correct') recall[m].right++; }
  const said = prediction.kind === 'thing' ? prediction.name : prediction.kind === 'not' ? `not ${prediction.name}` : prediction.kind === 'something' ? 'something' : 'nothing';
  emit('hypothesis', `${mark === 'correct' ? 'RIGHT' : 'WRONG'}: expected ${said} from ${tried}, got ${made ?? 'nothing'}`, a.id, undefined, { right: mark === 'correct', expect: said, actual: made ?? null, tried });
}

// Plain text from an untrusted value: strings and numbers only; anything else is empty.
const txt = (v: unknown, n = 200) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

// Model replies are untrusted: every field is coerced to the shape the world expects
// before anything acts on it, so a malformed answer can only fall back, never crash.
function cleanDecision(raw: unknown): Decision {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' ? String(v) : undefined);
  return { thought: str(r.thought), say: str(r.say), share: Array.isArray(r.share) ? r.share.slice(0, 6) : undefined,
    teach_skill: Array.isArray(r.teach_skill) ? r.teach_skill.slice(0, 2) : str(r.teach_skill, 40), action: str(r.action, 20),
    target: str(r.target, 60), with: str(r.with, 60), problem: str(r.problem, 200), skill_name: str(r.skill_name, 40),
    steps: Array.isArray(r.steps) ? r.steps : undefined, expect: r.expect };
}

interface Decision { thought?: string; say?: string; share?: unknown; teach_skill?: unknown; action?: string; target?: string; with?: string; problem?: string; skill_name?: string; steps?: unknown; expect?: unknown }
function act(a: SandboxAgent, d: Decision) {
  if (d.thought) { a.thought = scrub(String(d.thought)).slice(0, 180); emit('thought', a.thought, a.id); }
  const listeners = near(a);
  if (d.say) {
    a.said = scrub(String(d.say)).slice(0, 180); a.saidAt = Date.now(); a.activity = 'socialising';
    for (const o of listeners) { o.heard.push(`${a.name}: ${a.said}`); if (o.heard.length > 6) o.heard.shift(); }
    emit('say', a.said, a.id, listeners.map(o => o.id));
    // A spoken recipe claim that contradicts what a listener knows starts a council to test it.
    const claim = readClaim(a.said);
    if (claim) for (const o of listeners) {
      const knownFact = o.known.map(f => facts[f]).find(t => readClaim(t)?.pair === claim.pair);
      const theirs = knownFact ? readClaim(knownFact) : undefined;
      if (theirs && theirs.product !== claim.product && o.council === null && a.council === null && !o.collapsedUntil && Date.now() - (lastDisagreement[claim.pair] ?? 0) > 60000) {
        lastDisagreement[claim.pair] = Date.now();
        emit('disagreement', `disagrees with ${a.name}: ${a.name} says ${claim.pair} makes ${claim.product}, ${o.name} knows it makes ${theirs.product}`, o.id, [a.id], { pair: claim.pair });
        void council(o, `${a.name} says ${claim.pair} makes ${claim.product}; I know it makes ${theirs.product}. Test it together and settle it.`);
        break;
      }
    }
    // Saying a place's name teaches it to everyone who hears.
    for (const g of a.places ?? []) if (placeNames[g] && a.said.toLowerCase().includes(placeNames[g].name.toLowerCase())) for (const o of listeners) knowPlace(o, g);
    // A speaker pulled into a council by what they said does nothing else this turn.
    if (a.council !== null) { a.doing = 'in council'; return; }
  }
  const shared = (Array.isArray(d.share) ? d.share : []).filter(f => typeof f === 'number' || typeof f === 'string').map(Number).filter(f => a.known.includes(f)).slice(0, 4);
  for (const f of shared) teach(a, f, listeners, 'told');
  const skillsTaught = (Array.isArray(d.teach_skill) ? d.teach_skill : d.teach_skill ? [d.teach_skill] : []).filter(n => typeof n === 'string').map(n => (n as string).toLowerCase()).filter(n => a.skills?.includes(n)).slice(0, 2);
  for (const n of skillsTaught) {
    const learners = listeners.filter(o => { o.skills ??= []; if (o.skills.includes(n)) return false; o.skills.push(n); return true; });
    if (learners.length) emit('learn_skill', `${n}: ${skillLine(skills.get(n)!)}`, a.id, learners.map(o => o.id), { skill: n });
  }
  const action = String(d.action ?? 'wait').toLowerCase(), target = String(d.target ?? '').toLowerCase();
  a.doing = ({ walk: `walking to ${target || 'somewhere'}`, gather: `gathering ${target || 'what is here'}`, combine: `combining ${target} + ${String(d.with ?? '').toLowerCase()}`,
    strike: `striking ${target}`, build: `building ${target}`, drop: `setting down ${target}`, eat: `eating ${target}`, rest: 'resting', council: 'calling a council' } as Record<string, string>)[action] ?? (d.say ? 'talking' : 'waiting');
  const here = nodes[a.node];
  if (action === 'walk') {
    // Walk to a person, a place the agent knows by name, or in a direction.
    const friend = byName(target);
    const named = (a.places ?? []).find(g => placeNames[g] && target.includes(placeNames[g].name.toLowerCase()));
    const hereRegion = regionAt(a.x, a.z);
    const dir = [...DIRS].sort((x, y) => y.length - x.length).find(d => target.includes(d)) ?? (/\b(uphill|up|peak|high)\b/.test(target) ? 'uphill' : /\b(downhill|down|shore|sea|coast)\b/.test(target) ? 'downhill' : undefined);
    let goal: number | undefined = friend ? friend.node : named !== undefined ? regionCentre(named) : undefined;
    if (goal === undefined && dir) {
      const options = REGIONS.filter(g => g !== hereRegion).map(regionCentre).filter(n => dir === 'uphill' ? nodes[n].y > nodes[a.node].y + 0.5 : dir === 'downhill' ? nodes[n].y < nodes[a.node].y - 0.3 : direction(a.x, a.z, nodes[n].x, nodes[n].z) === dir);
      goal = options.sort((x, y) => Math.hypot(nodes[x].x - a.x, nodes[x].z - a.z) - Math.hypot(nodes[y].x - a.x, nodes[y].z - a.z))[0];
    }
    if (goal === undefined) goal = regionCentre(pick(REGIONS));
    a.path = route(a.node, goal); a.activity = friend ? 'socialising' : 'wandering';
    const where = friend ? friend.name : placeLabel(a, regionAt(nodes[goal].x, nodes[goal].z));
    a.lastResult = a.path.length ? `You are walking to ${where}.` : 'You cannot find a way there.';
    emit('action', `walks to ${where}`, a.id);
  } else if (action === 'gather') {
    const options = gatherable(here);
    const want = options.find(i => target.includes(i)) ?? options[Math.floor(Math.random() * options.length)];
    if (!want) { a.lastResult = 'There is nothing to gather here.'; emit('result', 'finds nothing to gather here', a.id); }
    else if (a.inventory.length >= 6) { a.lastResult = 'Your hands are full.'; emit('result', 'has full hands', a.id); }
    else {
      a.inventory.push(want); itemLedger += 1; a.activity = 'seeking food'; a.lastResult = `You gathered ${describeItem(want)}.`;
      learn(a, factId(`${want} is found on ${soilOf(here)} ground`)); emit('action', `gathers ${want}`, a.id);
    }
  } else if (action === 'combine') {
    const r = tryCombine(a, target, String(d.with ?? '').toLowerCase());
    if (!/^lacks /.test(r.text)) judge(a, d.expect, `${target} + ${String(d.with ?? '').toLowerCase()}`, r.made);
    a.lastResult = r.made ? `You made ${describeItem(r.made)}!` : `Combining: ${r.text}.`;
    if (!r.made) emit('result', `combines: ${r.text}`, a.id);
  } else if (action === 'strike') {
    const i = a.inventory.indexOf(target);
    const r = i < 0 ? undefined : strike(chem, target);
    if (i < 0) a.lastResult = `You have no ${target}.`;
    else if (!r) { judge(a, d.expect, `striking ${target}`, undefined); learn(a, factId(`striking ${target} does nothing`)); a.lastResult = `Striking ${target} does nothing.`; emit('result', `strikes ${target}: nothing`, a.id); }
    else {
      a.inventory[i] = r.product; judge(a, d.expect, `striking ${target}`, r.product); learn(a, factId(`striking ${target} makes ${r.product}`));
      const first = !agents.some(o => o.made.includes(r.product)); if (!a.made.includes(r.product)) a.made.push(r.product);
      a.lastResult = `Striking ${target} made ${describeItem(r.product)}!`;
      emit(first ? 'discovery' : 'action', first ? `DISCOVERS ${r.product} (striking ${target})` : `strikes ${target} into ${r.product}`, a.id);
    }
  } else if (action === 'build') {
    const i = a.inventory.indexOf(target), sub = substance(chem, target);
    if (i < 0) a.lastResult = `You have no ${target}.`;
    else if (!sub?.structure) { a.lastResult = `${target} cannot be built.`; emit('result', `tries to build with ${target}, which cannot be built`, a.id); }
    else {
      a.inventory.splice(i, 1); itemLedger -= 1; a.activity = 'seeking cover'; a.busyUntil = Date.now() + 4000;
      const b: Built = { id: structures.length + 1, kind: sub.structure, name: target, x: a.x, y: a.y, z: a.z, colour: sub.colour, by: a.id, at: Date.now() };
      structures.push(b); learn(a, factId(`${target} can be built`));
      a.lastResult = `You built ${target} at ${placeLabel(a, regionAt(a.x, a.z))}. It stays there.`;
      emit('built', `BUILDS ${target} at ${placeLabel(undefined, regionAt(a.x, a.z))}`, a.id, undefined, { structure: b });
    }
  } else if (action === 'name_place') {
    const g = regionAt(a.x, a.z);
    const name = scrub(txt(d.target, 30)).replace(/[^A-Za-z' -]/g, '').trim();
    if (!name) a.lastResult = 'A place needs a name.';
    else if (placeNames[g]) { knowPlace(a, g); a.lastResult = `This place is already called ${placeNames[g].name}.`; }
    else if (Object.values(placeNames).some(p => p.name.toLowerCase() === name.toLowerCase())) a.lastResult = `${name} is already the name of another place.`;
    else {
      placeNames[g] = { name, by: a.id, at: Date.now() }; knowPlace(a, g);
      const hearers = near(a); for (const o of hearers) knowPlace(o, g);
      a.lastResult = `You named this place ${name}. Those near you heard it.`;
      emit('named', `names this ${soilOfRegion(g)} place ${name}`, a.id, hearers.map(o => o.id), { region: g, name });
    }
  } else if (action === 'eat') {
    const i = a.inventory.indexOf(target), sub = substance(chem, target);
    if (i < 0) a.lastResult = `You have no ${target}.`;
    else if (sub?.food === undefined) { learn(a, factId(`${target} is not food`)); a.lastResult = `${target} is not food. You keep it.`; emit('result', `tries to eat ${target}: not food`, a.id); }
    else {
      a.inventory.splice(i, 1); itemLedger -= 1; a.energy = Math.max(0, Math.min(1, (a.energy ?? 1) + sub.food)); a.activity = 'eating'; a.busyUntil = Date.now() + 2500;
      const good = sub.food > 0;
      learn(a, factId(good ? `eating ${target} restores strength` : `eating ${target} makes you ill`));
      a.lastResult = good ? `You ate ${target} and feel stronger.` : `You ate ${target} and feel ill.`;
      emit(good ? 'action' : 'result', good ? `eats ${target} and feels stronger` : `eats ${target} and is sickened`, a.id);
    }
  } else if (action === 'drop') {
    const i = a.inventory.indexOf(target);
    if (i < 0) a.lastResult = `You have no ${target}.`;
    else { a.inventory.splice(i, 1); itemLedger -= 1; a.lastResult = `You set down ${target}. Your hands have room.`; emit('action', `sets down ${target}`, a.id); }
  } else if (action === 'rest') {
    a.activity = 'resting'; a.busyUntil = Date.now() + 5000; a.lastResult = 'You rested.'; emit('action', 'rests', a.id);
  } else if (action === 'write_skill') {
    const name = scrub(String(d.skill_name ?? d.target ?? '')).toLowerCase().replace(/[^a-z0-9 '-]/g, '').trim().slice(0, 32);
    const steps = cleanSteps(d.steps);
    if (!name || steps.length < 2) { a.lastResult = 'A skill needs a name and at least two steps.'; emit('result', 'tries to write a skill but it has no name or too few steps', a.id); }
    else if (skills.has(name) && skills.get(name)!.author !== a.id) { a.lastResult = `Someone already wrote a skill called ${name}.`; }
    else {
      skills.set(name, { name, steps, author: a.id, uses: 0, successes: 0, made: [], at: Date.now() });
      a.skills ??= []; if (!a.skills.includes(name)) a.skills.push(name);
      a.lastResult = `You wrote the skill ${name}. You can run it with use_skill and teach it to others.`;
      emit('skill_written', `writes a skill: ${skillLine(skills.get(name)!)}`, a.id, undefined, { skill: name });
    }
  } else if (action === 'use_skill') {
    const name = String(d.target ?? d.skill_name ?? '').toLowerCase().trim();
    if (!a.skills?.includes(name) || !skills.has(name)) { a.lastResult = `You do not know a skill called ${name}.`; }
    else { a.running = { skill: name, step: 0, startedAt: Date.now(), made: [] }; skills.get(name)!.uses++; emit('skill_run', `runs the skill ${name}`, a.id, undefined, { skill: name }); }
  } else if (action === 'council') {
    void council(a, String(d.problem || d.target || 'What can we make together that none of us has made?'));
  } else a.lastResult = 'You waited.';
}

// ---------- minds ----------
type Mind = 'scripted' | Backend;
let mindMode: Mind = (process.env.MIND_MODE as Backend) ?? 'scripted';
// The minds mixer: which model thinks for each agent. Set from the top bar.
let mix: Mind[] = NAMES.map(() => mindMode);
const mindOf = (a: SandboxAgent): Mind => mix[a.id] ?? 'scripted';
let running = false;
let inFlight = 0;
// One limit for every model call, minds and councils alike.
const MAX_IN_FLIGHT = Number(process.env.MAX_IN_FLIGHT ?? process.env.MIND_CONCURRENCY ?? 2);
const waitForSlot = async (epoch = pauseEpoch): Promise<boolean> => {
  for (let i = 0; i < 600; i++) { if (!running || viewers.size === 0 || pauseEpoch !== epoch) return false; if (inFlight < MAX_IN_FLIGHT) { inFlight++; return true; } await new Promise(r => setTimeout(r, 100)); }
  return false;
};
const canSpend = () => running && viewers.size > 0;
// Every pause starts a new epoch: a council that began before it can never act after it.
let pauseEpoch = 0;
const mindCalls: number[] = [], councilCalls: number[] = [];
const within = (xs: number[], cap: number) => { const now = Date.now(); while (xs.length && now - xs[0] > 60000) xs.shift(); return xs.length < cap; };
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const SCRIPT_THOUGHTS = ['What is beyond the trees?', 'This one is sharp.', 'I should find the others.', 'The peak looks far.',
  'Maybe these two fit together.', 'Others may know what I do not.'];
function scriptedMind(a: SandboxAgent): Decision {
  const r = Math.random(), d: Decision = { thought: pick(SCRIPT_THOUGHTS) };
  if (a.known.length) d.share = [pick(a.known)];
  if (a.skills?.length && Math.random() < 0.2) d.teach_skill = [pick(a.skills)];
  if ((a.energy ?? 1) < 0.45 && a.inventory.some(i => (substance(chem, i)?.food ?? 0) !== 0) && Math.random() < 0.6) { d.action = 'eat'; d.target = a.inventory.find(i => (substance(chem, i)?.food ?? 0) !== 0); }
  else if (a.inventory.length >= 6 && Math.random() < 0.5) { d.action = 'drop'; d.target = pick(a.inventory); }
  else if (a.skills?.length && r < 0.12) { d.action = 'use_skill'; d.target = pick(a.skills); }
  else if ((!a.skills?.length ? Math.random() < 0.3 : r > 0.95) && a.known.some(f => / makes (?!nothing)/.test(facts[f]))) {
    const f = facts[a.known.filter(x => / makes (?!nothing)/.test(facts[x]))[0]], m = f.match(/^(.+?) \+ (.+?) makes (.+)$/);
    if (m) { d.action = 'write_skill'; d.skill_name = `make ${m[3]}`; d.steps = [{ action: 'gather', target: m[1] }, { action: 'gather', target: m[2] }, { action: 'combine', target: m[1], with: m[2], expect: m[3] }]; }
  }
  else if (r < 0.08 && near(a).length >= 2) { d.action = 'council'; d.problem = 'What can we make that none of us has made?'; }
  else if (!placeNames[regionAt(a.x, a.z)] && r < 0.2) { d.action = 'name_place'; d.target = `${pick(['Ash', 'Brine', 'Cleft', 'Dunmere', 'Elm', 'Fallow', 'Gull', 'Hollow', 'Ironside', 'Juniper', 'Kelp', 'Lark', 'Marrow', 'Nettle', 'Oyster', 'Pike', 'Quarry', 'Reed', 'Shale', 'Thorn'])} ${pick(['Rise', 'Flat', 'Bay', 'Wood', 'Rock', 'Point', 'Field', 'Cove'])}`; }
  else if (r < 0.38) { d.action = 'walk'; d.target = pick([...DIRS, 'uphill', 'downhill', ...agents.filter(o => o !== a).map(o => o.name)]); }
  else if (r < 0.65) d.action = 'gather';
  else if (a.inventory.some(i => substance(chem, i)?.structure)) { d.action = 'build'; d.target = a.inventory.find(i => substance(chem, i)?.structure); }
  else if (r < 0.72 && a.inventory.length >= 2) { d.action = 'combine'; d.target = pick(a.inventory); d.with = pick(a.inventory); d.expect = pick(['nothing', 'fire', 'rope', 'a tool']); }
  else if (r < 0.8 && a.inventory.length) { d.action = 'strike'; d.target = pick(a.inventory); d.expect = pick(['nothing', 'sparks', 'flint flake']); }
  else if (r < 0.92) { d.action = 'wait'; const kf = a.known.map(f => facts[f]).filter(t => / makes /.test(t)); d.say = kf.length && Math.random() < 0.5 ? (Math.random() < 0.3 ? kf[0].replace(/makes .*/, 'makes nothing') : pick(kf)) : pick(['Over here!', 'I found something.', 'Listen to this.']); }
  else d.action = 'rest';
  return d;
}

const SYSTEM = `You are one inhabitant of a small island. You and seven others woke here with no memories.
Island laws: ${LAWS.join(' ')} Facts pass between minds only when spoken: share the numbers of facts you want nearby listeners to learn.
A council: when a problem is too big for one mind, you may call the people near you into a council. The council may split the problem into parts, try competing plans side by side, and merge what worked.
You control only yourself. Each turn reply with ONE JSON object and nothing else:
{"thought": "<one short private thought>", "say": "<words spoken aloud, or empty>", "share": [<fact numbers to teach listeners>], "action": "walk|gather|combine|strike|build|drop|eat|rest|wait|council|name_place", "target": "<place, person or thing>", "with": "<second thing for combine>", "expect": "<for combine or strike: what you predict it makes, or nothing>", "problem": "<for council: the problem>"}
Nobody has named any place on this island. You want to know all of it: walk to places nobody has reached, and name each place in your own words with name_place (target: the name). Walk by person, by a place name you know, or by direction (north, south-east, uphill, downhill...). ${CHEMISTRY === 'real' ? 'The materials here are ordinary real-world things and behave as they do in the real world. Whenever you combine or strike, first predict the result in "expect": the world will show whether your hypothesis was right. If you think something real could be made that nobody has tried, say what and from what.' : 'Nothing here is like anything you remember: the materials have their own names and ways, and you must learn them by trying.'}
Skills: when you know a way of doing something in several steps, write it down as a skill and give it a name of your own: {"action": "write_skill", "skill_name": "<your name for it>", "steps": [{"action": "gather", "target": "<thing>"}, {"action": "combine", "target": "<thing>", "with": "<thing>", "expect": "<what it makes>"}, ...]}. Steps may be walk, gather, combine, strike, build, drop. Run a skill you know with {"action": "use_skill", "target": "<skill name>"}: it carries out every step for you. Teach a skill to people near you by adding "teach_skill": ["<skill name>"].
Be curious, share what you learn, turn what works into skills, and call a council when working together would help. Keep words short.`;

const factList = (ids: number[]) => ids.slice(-24).map(f => `[${f}] ${facts[f]}`).join('; ') || 'none';
function prompt(a: SandboxAgent): string {
  const here = regionAt(a.x, a.z);
  const knownPlaces = (a.places ?? []).filter(g => g !== here && placeNames[g]).map(g => `${placeNames[g].name} (${direction(a.x, a.z, nodes[regionCentre(g)].x, nodes[regionCentre(g)].z)})`);
  const unexplored = DIRS.filter(d => REGIONS.some(g => !(a.visited ?? []).includes(g) && direction(a.x, a.z, nodes[regionCentre(g)].x, nodes[regionCentre(g)].z) === d));
  return [`You are ${a.name}. You are in ${placeLabel(a, here)}${placeNames[here] ? '' : ' (you may name it)'}. You have been to ${(a.visited ?? []).length} of ${REGIONS.length} places.`,
    `Places you know by name: ${knownPlaces.join(', ') || 'none'}. Directions with places you have never been: ${unexplored.join(', ') || 'none, you have been everywhere'}.`, `Your strength: ${Math.round((a.energy ?? 1) * 100)}%. It is ${isNight() ? 'night' : daylight() < 0.55 ? 'dusk or dawn' : 'day'}${storm ? ', and a storm is raging' : ''}. You are ${a.sheltered ? 'sheltered' : 'exposed'}.`, `Last result: ${a.lastResult}`,
    `The ground here is ${soilOf(nodes[a.node])}. Here you could gather: ${gatherable(nodes[a.node]).map(describeItem).join(', ') || 'nothing'}.`,
    `You carry: ${a.inventory.map(describeItem).join(', ') || 'nothing'}.`,
    `Facts you know: ${factList(a.known)}.`,
    `Skills you know: ${(a.skills ?? []).map(n => skills.get(n)).filter(Boolean).map(k => skillLine(k!)).join('; ') || 'none yet'}.`, `Nearby: ${near(a).map(o => o.name).join(', ') || 'nobody'}.`,
    `Recently heard: ${a.heard.join(' | ') || 'nothing'}.`, `Your last thought: ${a.thought || 'none'}.`, 'Reply with the JSON object only.'].join('\n');
}

async function think(a: SandboxAgent) {
  a.thinking = true;
  // A reply that arrives after the agent collapsed belongs to a mind that no longer exists.
  const epoch = a.mindEpoch ?? 0;
  try {
    let d: Decision, src: Mind = 'scripted';
    const m = mindOf(a);
    if (m !== 'scripted' && within(mindCalls, MIND_CAP) && inFlight < MAX_IN_FLIGHT && canSpend()) {
      mindCalls.push(Date.now()); inFlight++;
      try { d = cleanDecision(await callModel(m, SYSTEM, prompt(a), 'mind')); src = m; } catch { d = scriptedMind(a); } finally { inFlight--; }
    } else d = scriptedMind(a);
    if (running && a.council === null && !a.collapsedUntil && (a.mindEpoch ?? 0) === epoch) {
      a.source = src;
      try { act(a, d); } catch (err) { a.lastResult = 'Something went wrong with that; try again.'; console.error('act failed', a.name, (err as Error).message); }
    }
  } finally { a.thinking = false; a.nextThink = Date.now() + (mindOf(a) === 'scripted' ? 3000 + Math.random() * 3000 : 1500); }
}
function stepSkills() {
  const now = Date.now();
  for (const a of agents) {
    if (!a.running || a.path.length || now < a.busyUntil || a.council !== null) continue;
    const k = skills.get(a.running.skill);
    if (!k || a.running.step >= k.steps.length) {
      if (k && a.running) {
        const worked = a.running.made.length > 0; if (worked) { k.successes++; for (const m of a.running.made) if (!k.made.includes(m)) k.made.push(m); }
        a.lastResult = `Your skill ${k.name} finished${worked ? `, making ${a.running.made.join(', ')}` : ', but made nothing new'}.`;
        emit('skill_done', `finishes ${k.name}${worked ? `: made ${a.running.made.join(', ')}` : ': nothing made'}`, a.id, undefined, { skill: k.name, worked });
      }
      a.running = null; a.nextThink = now + 500; continue;
    }
    const st = k.steps[a.running.step++];
    const before = new Set(a.inventory);
    try { act(a, { action: st.action, target: st.target, with: st.with, expect: st.expect }); } catch (err) { console.error('skill step failed', a.name, (err as Error).message); a.running = null; continue; }
    for (const item of a.inventory) if (!before.has(item) && st.action !== 'gather') a.running.made.push(item);
    a.busyUntil = Math.max(a.busyUntil, now + 1200);
  }
}
function scheduleMinds() {
  if (!running || viewers.size === 0) return;
  stepSkills();
  const now = Date.now();
  const ready = agents.filter(a => !a.thinking && !a.running && !a.collapsedUntil && a.council === null && !a.path.length && now >= a.busyUntil && now >= a.nextThink)
    .sort((x, y) => x.nextThink - y.nextThink);
  for (const a of ready) { if (mindOf(a) !== 'scripted' && inFlight >= MAX_IN_FLIGHT) continue; void think(a); }
}

// ---------- councils: the torrent ----------
interface CouncilRecord { id: number; chair: number; members: number[]; problem: string; mode: string; parts: Array<{ agent: number; task: string; finding?: string; result?: string; made?: string }>;
  winner: number | null; summary: string; calls: number; openedAt: number; closedAt?: number; observer: boolean; epoch: number }
let councils: CouncilRecord[] = [];
async function councilCall(system: string, user: string, rec: CouncilRecord, fallback: () => Record<string, unknown>, who?: SandboxAgent): Promise<Record<string, unknown>> {
  const epoch = rec.epoch;
  const m = who ? mindOf(who) : mindOf(agents[rec.chair]);
  // Pause or an empty room stops the council spending: it falls back without a call.
  if (m === 'scripted' || !canSpend()) return fallback();
  if (!(await waitForSlot(epoch))) return fallback();
  // Budget is checked and reserved together at the moment of launch, after any wait,
  // so parallel parts cannot all pass the check and overspend.
  if (!canSpend() || pauseEpoch !== epoch || !within(councilCalls, COUNCIL_CAP)) { inFlight--; return fallback(); }
  councilCalls.push(Date.now()); rec.calls++;
  try { const reply = await callModel(m, system, user, 'council'); if (pauseEpoch !== epoch) return fallback(); councilSource.set(reply, m); return reply; } catch { return fallback(); } finally { inFlight--; }
}
// Which model wrote a council reply; a fallback reply is not in here, so it counts as scripted.
const councilSource = new WeakMap<object, Mind>();
const COUNCIL_SYSTEM = `You are inhabitants of a small island holding a council. Island laws: ${LAWS.join(' ')}
The materials have their own names; use them exactly. Reply with ONE JSON object and nothing else.`;

async function council(chair: SandboxAgent, problem: string, observer = false) {
  const epoch = pauseEpoch;
  let dealtPot: Array<{ item: Item; owner: SandboxAgent; home: boolean }> = [];
  if (chair.collapsedUntil || chair.council !== null) return;
  const members = [chair, ...near(chair).filter(o => o.council === null && !o.collapsedUntil)].slice(0, 6);
  if (members.length < 2) { chair.lastResult = 'Nobody is near enough to hold a council.'; emit('result', 'calls a council but nobody is near', chair.id); return; }
  const rec: CouncilRecord = { id: councils.length + 1, chair: chair.id, members: members.map(m => m.id), problem: scrub(problem).slice(0, 160), mode: '',
    parts: [], winner: null, summary: '', calls: 0, openedAt: Date.now(), observer, epoch: pauseEpoch };
  councils.push(rec);
  for (const m of members) { m.council = rec.id; m.path = []; m.activity = 'socialising'; }
  emit('council_open', `${observer ? '[observer asked] ' : ''}calls a council: "${rec.problem}"`, chair.id, rec.members.filter(i => i !== chair.id), { council: rec.id, members: rec.members });
  try {
    const pool = members.map(m => `${m.name} carries ${m.inventory.map(describeItem).join(', ') || 'nothing'}`).join('; ');
    const pooled = [...new Set(members.flatMap(m => m.known))];
    // 1. The chair chooses the pattern: split, branch, or none.
    const plan = await councilCall(COUNCIL_SYSTEM, [`Chair: ${chair.name}. Problem: ${rec.problem}`, `Members: ${members.map(m => m.name).join(', ')}.`,
      `What the council carries: ${pool}.`, `Facts the council knows: ${factList(pooled)}.`,
      'Decide how to work: "split" the problem into different parts for different members, "branch" into competing plans tried side by side, or "none" if one person can do it.',
      'Reply: {"mode": "split|branch|none", "parts": [{"agent": "<member name>", "task": "<short task>"}]}'].join('\n'), rec,
      () => ({ mode: 'branch', parts: members.map(m => ({ agent: m.name, task: 'try a pair nobody has tried' })) }));
    rec.mode = ['split', 'branch', 'none'].includes(txt(plan.mode, 10)) ? txt(plan.mode, 10) : 'branch';
    const parts = (Array.isArray(plan.parts) ? plan.parts : []).filter(p => p && typeof p === 'object').map(p => p as Record<string, unknown>)
      .map(p => ({ agent: byName(txt(p.agent, 30)), task: scrub(txt(p.task, 120)) }))
      .filter(p => p.agent && rec.members.includes(p.agent.id)).slice(0, 6) as Array<{ agent: SandboxAgent; task: string }>;
    if (rec.mode === 'none' || parts.length === 0) parts.splice(0, parts.length, { agent: chair, task: rec.problem });
    if (pauseEpoch !== epoch || !running) throw new Error('adjourned');
    rec.parts = parts.map(p => ({ agent: p.agent.id, task: p.task }));
    emit('council_split', `${rec.mode.toUpperCase()}: ${parts.map(p => `${p.agent.name}: ${p.task}`).join(' | ')}`, chair.id, parts.map(p => p.agent.id),
      { council: rec.id, mode: rec.mode, parts: rec.parts });
    // 2. Fan out. The council pools what it carries and deals it out, so each part
    // works with its own items; every part runs as its own parallel model call.
    // Each dealt item remembers its owner, and goes back to them unless it was used.
    // Test hook: a slow council, so the eval can pause one part-way through.
    if (process.env.SANDBOX_TEST === '1' && Number(process.env.SANDBOX_COUNCIL_DELAY_MS ?? 0) > 0) await new Promise(r => setTimeout(r, Number(process.env.SANDBOX_COUNCIL_DELAY_MS)));
    const live = () => running && pauseEpoch === epoch;
    if (!live()) throw new Error('adjourned');
    const pot = members.flatMap(m => m.inventory.splice(0).map(item => ({ item, owner: m, home: false })));
    dealtPot = pot;
    const hands: Array<typeof pot> = parts.map(() => []);
    pot.forEach((entry, i) => hands[i % parts.length].push(entry));
    // Every part settles before anything else happens, so one failing part cannot race the others.
    const settled = await Promise.allSettled(parts.map(async (p, i) => {
      const dealt = hands[i];
      const mine = dealt.map(d => d.item);
      // Test hook: every second council's first part answers with a malformed reply, items in hand or not.
      const injected = process.env.SANDBOX_TEST_BAD_PART === '1' && i === 0 && rec.id % 2 === 0;
      if (injected) emit('test_bad_part', `council ${rec.id}: malformed part injected`);
      const answer = injected ? { finding: { evil: true }, try: { a: { toString: 0 }, b: 'wood' }, expect: { x: 1 } } as Record<string, unknown> : mine.length < 2 ? { finding: 'too few items to try anything', try: {} } : await councilCall(COUNCIL_SYSTEM, [`You are ${p.agent.name} in a council chaired by ${chair.name}. Problem: ${rec.problem}`,
        `Your part (${rec.mode}): ${p.task}`, `Items dealt to you for this part: ${mine.join(', ') || 'none'}.`, `Facts the council knows: ${factList(pooled)}.`,
        mine.length >= 2 ? 'Pick one pair from your items to combine for your part, avoiding pairs already known to make nothing.' : 'You have too few items to combine; report what the council should do next.',
        'Reply: {"finding": "<one short line>", "try": {"a": "<item>", "b": "<item>"}, "expect": "<what you predict it makes, or nothing>"}'].join('\n'), rec,
        () => ({ finding: 'trying a pair', try: { a: mine[0] ?? '', b: mine[1] ?? '' }, expect: 'nothing' }), p.agent);
      const t = (answer && typeof answer.try === 'object' && answer.try ? answer.try : {}) as Record<string, unknown>;
      // Only plain strings count as item names; anything else is treated as no choice.
      const word = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().slice(0, 40) : '');
      const x = word(t.a), y = word(t.b);
      let r: { text: string; made?: string; fact?: number } = { text: mine.length >= 2 ? `has no ${x} and ${y} in hand` : 'too few items to try' };
      // Paused while this part was thinking: nothing is tried, and the dealt items go home below.
      if (mine.length >= 2 && live()) { r = tryCombine(p.agent, x, y, { inventory: mine } as SandboxAgent); if (!/^lacks /.test(r.text)) judge(p.agent, answer.expect, `${x} + ${y}`, r.made, councilSource.get(answer) ?? 'scripted'); }
      // Return what is left: unused items to their owners, anything new to the one who made it.
      const left = [...mine];
      for (const d of dealt) { const k = left.indexOf(d.item); if (k >= 0) { left.splice(k, 1); d.owner.inventory.push(d.item); } d.home = true; }
      p.agent.inventory.push(...left);
      rec.parts[i] = { ...rec.parts[i], finding: typeof answer.finding === 'string' ? scrub(answer.finding).slice(0, 120) : '', result: r.text, made: r.made };
      if (rec.closedAt || !live()) return { agent: p.agent, ...r };
      emit('council_part', `${p.agent.name}: ${rec.parts[i].finding} (${r.text})`, p.agent.id, [chair.id], { council: rec.id, part: i, made: r.made ?? null });
      return { agent: p.agent, ...r };
    }));
    const results = settled.flatMap(x => (x.status === 'fulfilled' ? [x.value] : []));
    if (settled.some(x => x.status === 'rejected')) throw new Error('a council part failed');
    if (!live()) throw new Error('adjourned');
    // 3. Merge: the chair keeps what worked and every member learns it.
    const merged = await councilCall(COUNCIL_SYSTEM, [`You chair the council (${chair.name}). Problem: ${rec.problem}. Mode: ${rec.mode}.`,
      `Results: ${results.map(r => `${r.agent.name}: ${r.text}`).join('; ')}.`,
      'Merge: say which member\'s result best answers the problem (or none) and summarise what the council learned in one line.',
      'Reply: {"winner": "<member name or none>", "summary": "<one line>"}'].join('\n'), rec,
      () => { const w = results.find(r => r.made); return { winner: w ? w.agent.name : 'none', summary: w ? `${w.agent.name} made ${w.made}.` : 'Nothing new this time.' }; });
    const winner = byName(txt(merged.winner, 30));
    rec.winner = winner && rec.members.includes(winner.id) ? winner.id : null;
    rec.summary = scrub(txt(merged.summary, 180));
    if (!live()) throw new Error('adjourned');
    for (const r of results) if (r.fact !== undefined) teach(r.agent, r.fact, members, 'council');
    rec.closedAt = Date.now();
    emit('council_merge', `MERGE: ${rec.summary}${rec.winner !== null ? ` (best: ${agents[rec.winner].name})` : ''} · ${rec.calls} calls`, chair.id, rec.members.filter(i => i !== chair.id),
      { council: rec.id, winner: rec.winner, calls: rec.calls });
    for (const m of members) m.lastResult = `Council: ${rec.summary}`;
  } catch (err) {
    // Paused (or anything unexpected): the council closes cleanly and says so.
    const why = (err as Error).message === 'adjourned' ? 'paused before it could act' : 'something went wrong';
    rec.summary = `Adjourned: ${why}.`; rec.closedAt = Date.now();
    emit('council_merge', `ADJOURNED: ${why}`, chair.id, rec.members.filter(i => i !== chair.id), { council: rec.id, winner: null, calls: rec.calls });
    if ((err as Error).message !== 'adjourned') console.error('council failed', (err as Error).message);
  } finally {
    rec.closedAt ??= Date.now();
    // Whatever happened, every dealt item that has not gone home goes back to its owner.
    for (const d of dealtPot) if (!d.home) { d.owner.inventory.push(d.item); d.home = true; }
    // The carry law holds the moment the council ends: anything over six is set down at once.
    for (const m of members) {
      if (m.inventory.length > 6) { const dropped = m.inventory.splice(6); itemLedger -= dropped.length; emit('result', `sets down ${dropped.join(', ')}: hands full after the council`, m.id); }
      m.council = null; m.nextThink = Date.now() + 1000;
    }
  }
}

// ---------- persistence: the island resumes after a restart ----------
function save() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const data = { version: 3, simMs, director: { lastProgressSim, lastFound }, placeNames, recall, triedPairs: [...triedPairs], weather: { storm, nextStorm }, chemistry: CHEMISTRY, hypTotal, hypRight, hypMissing, hypUntested, ideas, seed: SEED, running, facts, seq, structures, mix, skills: [...skills.values()], events: events.slice(-400), councils: councils.slice(-100),
      agents: agents.map(a => ({ ...a, path: [], thinking: false, council: null, running: null })) };
    writeFileSync(STATE_FILE + '.tmp', JSON.stringify(data)); renameSync(STATE_FILE + '.tmp', STATE_FILE);
  } catch (err) { console.error('save failed', (err as Error).message); }
}
function load() {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    if (data.version !== 3 || data.seed !== SEED || data.chemistry !== CHEMISTRY) return;
    // The island clock is saved with the island, so every saved deadline keeps its meaning.
    // An older save without it gets a fresh clock, and any deadline far beyond it is reset.
    if (data.placeNames && typeof data.placeNames === 'object') Object.assign(placeNames, data.placeNames);
    // The director's stall clock survives a restart; an older save starts it from the saved island time.
    if (data.director && typeof data.director.lastProgressSim === 'number') { lastProgressSim = data.director.lastProgressSim; lastFound = Number(data.director.lastFound) || 0; }
    else { lastProgressSim = typeof data.simMs === 'number' ? data.simMs : 0; lastFound = -1; }
    if (data.recall) Object.assign(recall, data.recall); for (const t of data.triedPairs ?? []) triedPairs.add(t);
    const hadClock = typeof data.simMs === 'number';
    simMs = hadClock ? data.simMs : 0;
    if (data.weather && typeof data.weather.nextStorm === 'number') { nextStorm = data.weather.nextStorm; storm = data.weather.storm ?? null; }
    else nextStorm = simMs + 300000 + Math.random() * 300000;
    hypTotal = data.hypTotal ?? 0; hypRight = data.hypRight ?? 0; hypMissing = data.hypMissing ?? 0; hypUntested = data.hypUntested ?? 0; ideas.push(...(data.ideas ?? []));
    structures = data.structures ?? []; if (Array.isArray(data.mix)) mix = data.mix; if (typeof data.running === 'boolean') running = data.running;
    for (const k of data.skills ?? []) skills.set(k.name, k);
    facts.push(...data.facts); seq = data.seq; events = data.events; councils = data.councils ?? [];
    agents = data.agents.map((a: SandboxAgent) => ({ ...a, nextThink: Date.now() + 1000 + a.id * 500, busyUntil: 0,
      // Without a saved clock no deadline can be trusted: every collapse restarts its 20 seconds.
      collapsedUntil: a.collapsedUntil ? (hadClock ? a.collapsedUntil : simMs + 20000) : undefined }));
    console.log(`resumed ${agents.length} agents, ${facts.length} facts, ${councils.length} councils`);
  } catch { /* fresh island */ }
}
if (process.env.SANDBOX_FRESH !== '1') load();
itemLedger = agents.reduce((n, a) => n + a.inventory.length, 0);
if (process.env.SANDBOX_TEST === '1') setInterval(checkLedger, 500);
setInterval(save, 15000);
process.on('SIGTERM', () => { save(); process.exit(0); });
// A failure in one agent's task must never stop the island.
process.on('unhandledRejection', err => console.error('unhandled', (err as Error)?.message ?? err));
process.on('SIGINT', () => { save(); process.exit(0); });

// ---------- the loop ----------
let tick = 0, last = Date.now();
const CARRY = 6;
setInterval(() => {
  const now = Date.now(), dt = (now - last) / 1000; last = now;
  // Bodies, hunger and minds share one condition: the island lives while it runs and is watched.
  if (running && viewers.size > 0) { simMs += dt * 1000; stepAgents(dt); updatePressure(dt); direct(); }
  // The carry law holds between every step: anything over six is set down.
  for (const a of agents) if (a.council === null && a.inventory.length > CARRY) {
    const dropped = a.inventory.splice(CARRY); itemLedger -= dropped.length;
    emit('result', `sets down ${dropped.join(', ')}: hands full`, a.id);
  }
  scheduleMinds();
}, 100);
setInterval(() => {
  tick++;
  send('state', { tick, running, mindMode, mix, world: { daylight: daylight(), night: isNight(), storm: !!storm }, backends: ['scripted', ...available()], calls: stats.total, failed: stats.failed, mindError: stats.lastError, perMin: perMinute(), cap: MIND_CAP + COUNCIL_CAP,
    councilCalls: stats.byPurpose.council ?? 0, facts: facts.length,
    progress: { elements: chem.substances.filter(x => x.tier === 0).length, makeable: chem.substances.filter(x => x.tier > 0).length, found: new Set(agents.flatMap(a => a.made)).size,
      structures: chem.substances.filter(x => x.structure).length, built: new Set(structures.map(b => b.name)).size, councils: councils.length, skills: skills.size, regions: REGIONS.length, explored: new Set(agents.flatMap(a => a.visited ?? [])).size, named: Object.keys(placeNames).length, recall, hypotheses: hypTotal, hypothesesRight: hypRight, hypothesesMissing: hypMissing, ideas: ideas.length, chemistry: CHEMISTRY },
    councils: councils.filter(c => !c.closedAt || Date.now() - c.closedAt < 6000).map(c => ({ id: c.id, chair: c.chair, members: c.members, problem: c.problem, mode: c.mode, open: !c.closedAt, winner: c.winner })),
    agents: agents.map(a => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, activity: a.activity, thought: a.thought,
      said: Date.now() - a.saidAt < 8000 ? a.said : '', saidAt: a.saidAt, thinking: a.thinking, inventory: a.inventory, known: a.made, facts: a.known.length, knownIds: a.known,
      visited: (a.visited ?? []).length, energy: a.energy ?? 1, sheltered: !!a.sheltered, collapsed: !!a.collapsedUntil, hyp: { tried: a.hyp?.tried ?? 0, right: a.hyp?.right ?? 0, missing: a.hyp?.missing ?? 0, untested: a.hyp?.untested ?? 0 }, skills: a.skills ?? [], runningSkill: a.running ? `${a.running.skill} (step ${a.running.step} of ${skills.get(a.running.skill)?.steps.length ?? 0})` : '',
      council: a.council, doing: a.collapsedUntil ? 'collapsed' : a.running ? `running skill ${a.running.skill}` : a.council !== null ? 'in council' : a.path.length ? a.doing ?? 'walking' : a.doing ?? 'waiting', outcome: a.outcome ?? '' })) });
}, 250);

// ---------- real usage meters ----------
// Codex: the weekly meter Codex itself records in its newest session file.
// Claude: the plan meter, if a status line hook has written it; else this island's own spend.
let codexCache: { at: number; value: unknown } = { at: 0, value: null };
function codexMeter(): unknown {
  if (Date.now() - codexCache.at < 30000) return codexCache.value;
  let value: unknown = null;
  try {
    const roots = [join(CODEX_HOME, 'sessions'), join(homedir(), '.codex', 'sessions')];
    // Newest session files first; the first one that recorded a meter wins.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((x, y) => y.name.localeCompare(x.name))) {
        if (files.length >= 8) return;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push(p);
      }
    };
    for (const root of roots) { try { walk(root); } catch { /* none */ } }
    files.sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const at = text.lastIndexOf('"rate_limits":');
      if (at < 0) continue;
      const m = text.slice(at).match(/"primary":\{"used_percent":([\d.]+),"window_minutes":(\d+),"resets_at":(\d+)/);
      const plan = text.slice(at).match(/"plan_type":"([^"]+)"/);
      if (m) { value = { usedPercent: Number(m[1]), windowMinutes: Number(m[2]), resetsAt: Number(m[3]) * 1000, plan: plan?.[1] ?? '' }; break; }
    }
  } catch { /* no codex sessions */ }
  codexCache = { at: Date.now(), value };
  return value;
}
// Claude Code hands its plan meter to the status line; ~/.claude/hooks/island-meter.sh records it.
function claudeMeter(): unknown {
  try {
    const file = join(homedir(), '.claude', 'island-meter-raw.json');
    const r = JSON.parse(readFileSync(file, 'utf8')).rate_limits ?? {};
    const pct = (w: { used_percentage?: number } | undefined) => (typeof w?.used_percentage === 'number' ? w.used_percentage : undefined);
    return { fiveHourPercent: pct(r.five_hour), fiveHourResetsAt: r.five_hour?.resets_at ? r.five_hour.resets_at * 1000 : undefined,
      sevenDayPercent: pct(r.seven_day), sevenDayResetsAt: r.seven_day?.resets_at ? r.seven_day.resets_at * 1000 : undefined,
      asOf: statSync(file).mtimeMs };
  } catch { return null; }
}
function usage() {
  return { codex: codexMeter(), claude: claudeMeter(),
    island: { byBackend: stats.byBackend, codexCostMeasured: false, calls: stats.total, failed: stats.failed, costUsd: stats.costUsd, inputTokens: stats.inputTokens, outputTokens: stats.outputTokens,
      perMinute: perMinute(), cap: MIND_CAP + COUNCIL_CAP, byPurpose: stats.byPurpose } };
}

// ---------- http ----------
function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
}
createServer(async (req, res) => {
  if (req.url?.startsWith('/api/events')) {
    const silent = req.url.includes('silent=1');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ seed: SEED, names: NAMES, history: events.slice(-200), councils: councils.slice(-30), structures })}\n\n`);
    clients.add(res); if (!silent) viewers.add(res);
    req.on('close', () => { clients.delete(res); viewers.delete(res); });
    return;
  }
  if (req.url === '/api/skills') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([...skills.values()])); return; }
  if (req.url === '/api/places') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ grid: GRID, size: world.size, regions: REGIONS.map(g => ({ id: g, x: nodes[regionCentre(g)].x, y: nodes[regionCentre(g)].y, z: nodes[regionCentre(g)].z, soil: soilOfRegion(g), name: placeNames[g]?.name ?? null, by: placeNames[g]?.by ?? null, explored: agents.some(a => (a.visited ?? []).includes(g)) })) })); return; }
  if (req.url === '/api/ideas') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(ideas)); return; }
  if (req.url === '/api/facts') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(facts)); return; }
  if (req.url === '/api/usage') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(usage())); return; }
  if (req.url === '/api/councils') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(councils)); return; }
  if (req.url === '/api/control' && req.method === 'POST') {
    const b = await body(req);
    if (b.cmd === 'start') { running = true; emit('system', 'The island wakes.'); }
    if (b.cmd === 'pause') { running = false; pauseEpoch++; emit('system', 'Paused.'); }
    // Test hook (eval only): feed an agent an arbitrary, possibly malformed, decision.
    // Test hook: give an agent a fact, as if it had learned it.
    if (process.env.SANDBOX_TEST === '1' && b.cmd === 'know') { const ag = agents[Number(b.agent)]; if (ag && typeof b.fact === 'string') learn(ag, factId(b.fact)); }
    // Test hook: place an agent next to another.
    if (process.env.SANDBOX_TEST === '1' && b.cmd === 'meet') { const ag = agents[Number(b.agent)], to = agents[Number(b.to)]; if (ag && to) { ag.node = to.node; ag.x = to.x; ag.y = to.y; ag.z = to.z; ag.path = []; } }
    if (process.env.SANDBOX_TEST === '1' && b.cmd === 'wake') { for (const k of Object.keys(lastDisagreement)) delete lastDisagreement[k]; for (const i of Array.isArray(b.agents) ? b.agents : []) { const ag = agents[Number(i)]; if (ag && !ag.collapsedUntil) { ag.energy = 1; ag.running = null; ag.path = []; ag.busyUntil = Date.now() + 15000; ag.nextThink = Date.now() + 15000; } } }
    if (process.env.SANDBOX_TEST === '1' && b.cmd === 'act') { const ag = agents[Number(b.agent)]; if (ag) try { act(ag, cleanDecision(b.decision)); } catch (err) { console.error('act failed', (err as Error).message); } }
    if (b.cmd === 'council') {
      const a = agents[Number(b.agent)];
      if (a && a.council === null) { emit('intervention', `observer asks ${a.name} to call a council`, a.id); void council(a, String(b.problem || 'What can we make that none of us has made?'), true); }
    }
    const minds = ['scripted', ...available()];
    if (typeof b.minds === 'string' && minds.includes(b.minds)) { mindMode = b.minds as Mind; mix = NAMES.map(() => mindMode); emit('system', `Minds: ${mindMode}`); }
    if (Array.isArray(b.mix) && b.mix.length === NAMES.length && b.mix.every(m => minds.includes(String(m)))) {
      mix = b.mix.map(String) as Mind[]; emit('system', `Minds mix: ${NAMES.map((n, i) => `${n} ${mix[i]}`).join(', ')}`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ running, mindMode }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`sandbox server on :${PORT} seed ${SEED} minds ${mindMode} · ${describe()}`));
