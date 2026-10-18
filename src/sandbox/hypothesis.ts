// Reading an agent's prediction and marking it against what the island did.
// The mark is agreement with the island's rules, not proof about the real world:
// a real thing the island has no recipe for is "untested", never "incorrect".

export type Mark = 'correct' | 'incorrect' | 'untested' | 'missing';
export type Prediction =
  | { kind: 'missing' }
  | { kind: 'nothing' }
  | { kind: 'something' }
  | { kind: 'thing'; name: string }
  | { kind: 'not'; name: string }
  | { kind: 'other'; text: string };

// Everyday words for things the island knows, so "rope" means cord.
const ALIASES: Record<string, string> = {
  rope: 'cord', string: 'cord', twine: 'cord', spark: 'sparks', flake: 'flint flake', 'sharp flint': 'flint flake',
  knife: 'blade', 'stone knife': 'blade', 'hand axe': 'axe', hatchet: 'axe', pot: 'pottery', bowl: 'pottery', jar: 'pottery',
  ceramic: 'pottery', brick: 'mud brick', bricks: 'mud brick', shelter: 'hut', house: 'hut', campfire: 'fire', flame: 'fire',
  flames: 'fire', glue: 'pitch', tar: 'pitch', mud: 'wet clay', roof: 'thatch', coal: 'ember', embers: 'ember',
  smoulder: 'ember', quicklime: 'lime', beacon: 'signal fire', cairn: 'stone circle', 'cooked food': 'cooked fruit',
};
// Words that say something will happen without saying what: not a testable prediction.
const VAGUE = /^(a |an |some )?(tool|thing|something|weapon|item|object|material|stuff|anything|result|reaction|new thing|useful thing)s?$/;

const clean = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
const STRIP = /\b(i (think|expect|predict|guess)|it (will|might|may|should|could) (make|become|produce|give|be)|maybe|probably|perhaps|makes?|produces?|gives?|becomes?|will|the|a|an|some)\b/g;

export function readPrediction(raw: unknown, names: string[]): Prediction {
  if (typeof raw !== 'string') return { kind: 'missing' };
  let t = clean(raw);
  if (!t) return { kind: 'missing' };
  let negated = false;
  const neg = t.match(/^(not|no|never|won't make|will not make|does not make|doesn't make)\b\s*(.*)$/);
  if (neg) { negated = true; t = neg[2]; }
  t = t.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  if (/^(nothing|none|no change|no reaction|nothing happens)$/.test(t) || (!t && negated)) return negated ? { kind: 'something' } : { kind: 'nothing' };
  if (!t || VAGUE.test(t)) return { kind: 'missing' };
  // Whole-word matches only, longest first: "fireproof" is not "fire", "wet clay" beats "clay".
  const candidates = [...names.map(n => [n, n] as const), ...Object.entries(ALIASES)].sort((x, y) => y[0].length - x[0].length);
  for (const [word, name] of candidates) {
    if (new RegExp(`(^| )${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(t)) return negated ? { kind: 'not', name } : { kind: 'thing', name };
  }
  return negated ? { kind: 'missing' } : { kind: 'other', text: t.slice(0, 60) };
}

export function markPrediction(p: Prediction, actual: string | null): Mark {
  switch (p.kind) {
    case 'missing': return 'missing';
    case 'nothing': return actual === null ? 'correct' : 'incorrect';
    case 'something': return actual !== null ? 'correct' : 'incorrect';
    case 'thing': return actual === p.name ? 'correct' : 'incorrect';
    case 'not': return actual !== p.name ? 'correct' : 'incorrect';
    case 'other': return actual === null ? 'untested' : 'incorrect';
  }
}
