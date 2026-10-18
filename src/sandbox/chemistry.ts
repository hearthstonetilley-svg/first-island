// The island's chemistry (design 2c): six invented elements per world, with
// coined names and sensory descriptions, found in particular kinds of ground.
// Reactions are hidden and seeded: most pairs do nothing, some make a material,
// materials make more, and the deepest products are things that can be built.

export type Ground = 'shore' | 'grove' | 'high rock' | 'meadow';
export interface Substance { name: string; description: string; tier: number; ground?: Ground; structure?: string; colour: string; colourName: string;
  /** Strength gained (or lost) by eating it; undefined means it is not food. */
  food?: number;
  /** Tools any one of which must be carried to gather it (wood from a living tree needs an edge). */
  needs?: string[] }
/** The tools still missing to gather this, or undefined when it can be gathered by hand or with what is carried. */
export function missingTool(s: Substance | undefined, inventory: string[]): string[] | undefined {
  if (!s?.needs || s.needs.some(t => inventory.includes(t))) return undefined;
  return s.needs;
}

/** Choose what a gather takes: an exact name first, then the longest name the request mentions, else a random option. */
export function pickGather(options: string[], target: string, random: () => number = Math.random): string | undefined {
  const t = target.trim().toLowerCase();
  const exact = options.find(o => o === t);
  if (exact) return exact;
  const named = options.filter(o => new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)).sort((a, b) => b.length - a.length)[0];
  return named ?? options[Math.floor(random() * options.length)];
}

export interface Reaction { a: string; b: string; product: string; struck?: boolean }
export interface Chemistry { seed: number; substances: Substance[]; reactions: Reaction[] }

function rng(seed: number) {
  let state = seed | 0;
  return () => {
    let v = (state += 0x6d2b79f5);
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
const SYLLABLES = ['ka', 'vel', 'or', 'sith', 'mu', 'ren', 'tal', 'quo', 'ix', 'bel', 'dra', 'nu', 'fen', 'lo', 'zar', 'pi',
  'osk', 'umb', 'ei', 'tro', 'yl', 'gav', 'reth', 'oon'];
const COLOURS = [['blue', '#5a8fd6'], ['ochre', '#c9953a'], ['pale green', '#9fd49a'], ['rust red', '#b8563c'], ['violet', '#9a6fd1'],
  ['ash grey', '#9aa3a8'], ['amber', '#e0a83c'], ['black', '#3a3d42'], ['pearl white', '#e8e4dc'], ['teal', '#3fb8a8']];
const TEXTURES = ['grit', 'fibre', 'shard', 'gel', 'husk', 'crystal', 'paste', 'pebble', 'down', 'resin'];
const TRAITS = ['that is cold to touch', 'that hums faintly', 'that smells sharp', 'that is warm', 'that bends without breaking',
  'that sticks to skin', 'that rings when tapped', 'that crumbles easily', 'that floats', 'that glows in shade'];
const NEW_TRAITS = ['that holds its shape', 'that gives off a steady light', 'that is very hard', 'that feels alive', 'that is heavy',
  'that spreads when pressed', 'that sings when struck', 'that repels water'];
const FORMS: Record<string, string> = { hut: 'a hollow shape one can sit inside', tower: 'a tall shape that stands by itself',
  beacon: 'a slender pole that carries light at its tip', ring: 'a wide circle that lies flat on the ground' };
const an = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');
const STRUCTURES = ['hut', 'tower', 'beacon', 'ring'];
const GROUNDS: Ground[] = ['shore', 'grove', 'high rock', 'meadow'];

export function generateChemistry(seed: number): Chemistry {
  const r = rng(seed * 7919 + 17);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const used = new Set<string>();
  const coin = (parts: number) => {
    for (;;) {
      let name = ''; for (let i = 0; i < parts; i++) name += pick(SYLLABLES);
      if (!used.has(name) && name.length >= 4) { used.add(name); return name; }
    }
  };
  const substances: Substance[] = [];
  for (let i = 0; i < 6; i++) {
    const [colourName, colour] = pick(COLOURS);
    substances.push({ name: coin(2), tier: 0, ground: GROUNDS[i % GROUNDS.length], colour, colourName,
      description: `${an(colourName)} ${colourName} ${pick(TEXTURES)} ${pick(TRAITS)}` });
  }
  const reactions: Reaction[] = [];
  const has = (a: string, b: string) => reactions.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  const make = (a: Substance, b: Substance, tier: number, structure?: string) => {
    const [colourName, colour] = r() < 0.5 ? [a.colourName, a.colour] : pick(COLOURS);
    const product: Substance = { name: coin(tier >= 2 ? 3 : 2), tier, colour, colourName, structure,
      description: structure ? `${an(colourName)} ${colourName} piece that can be set down and built: ${FORMS[structure]}`
        : `${an(colourName)} ${colourName} ${pick(TEXTURES)} ${pick(NEW_TRAITS)}` };
    substances.push(product);
    reactions.push({ a: a.name, b: b.name, product: product.name });
    return product;
  };
  // Tier 1: five materials from pairs of elements (including an element with itself).
  const base = substances.slice(0, 6);
  const tier1: Substance[] = [];
  while (tier1.length < 5) {
    const a = pick(base), b = pick(base);
    if (!has(a.name, b.name)) tier1.push(make(a, b, 1));
  }
  // One element changes when struck alone.
  const struck = pick(base);
  const spark: Substance = { name: coin(2), tier: 1, colour: '#ffe27a', colourName: 'bright', description: `what ${struck.name} becomes when struck: a bright flicker ${pick(NEW_TRAITS)}` };
  substances.push(spark); reactions.push({ a: struck.name, b: struck.name, product: spark.name, struck: true }); tier1.push(spark);
  // Tier 2: four from a material and an element or two materials.
  const tier2: Substance[] = [];
  while (tier2.length < 4) {
    const a = pick(tier1), b = r() < 0.5 ? pick(base) : pick(tier1);
    if (!has(a.name, b.name)) tier2.push(make(a, b, 2));
  }
  // Tier 3: one structure of each kind, each needing a tier 2 product.
  for (const kind of STRUCTURES) {
    for (;;) { const a = pick(tier2), b = pick([...tier1, ...tier2]); if (!has(a.name, b.name)) { make(a, b, 3, kind); break; } }
  }
  return { seed, substances, reactions };
}

export function react(chem: Chemistry, a: string, b: string): Reaction | undefined {
  return chem.reactions.find(x => !x.struck && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
}
export function strike(chem: Chemistry, a: string): Reaction | undefined {
  return chem.reactions.find(x => x.struck && x.a === a);
}
export const substance = (chem: Chemistry, name: string) => chem.substances.find(s => s.name === name);
