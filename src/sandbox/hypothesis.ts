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
const STRIP = /\b(i (think|expect|predict|guess)|i'd (say|guess)|it (will|might|may|should|could)|maybe|probably|perhaps|make|makes|produce|produces|give|gives|become|becomes|create|creates|result in|will|would|the|a|an|some|it|this|that|be)\b/g;

export function readPrediction(raw: unknown, names: string[]): Prediction {
  if (typeof raw !== 'string') return { kind: 'missing' };
  // Punctuation is read before it is cleaned away: "cord, not fire" is two claims.
  if (/[,;/]/.test(raw)) return { kind: 'missing' };
  let t = clean(raw);
  if (!t) return { kind: 'missing' };
  // "Nothing" in any of its forms is checked first, before "no" is read as negation.
  if (/^(nothing|none|no change|no reaction|nothing happens|nothing will happen|it will do nothing)$/.test(t.replace(STRIP, ' ').replace(/\s+/g, ' ').trim()) || /^(no change|no reaction)$/.test(t)) return { kind: 'nothing' };
  // A hedge or a list of outcomes is not one testable claim: reject rather than guess.
  if (/\b(or|either|and|but)\b|[,;]/.test(t)) return { kind: 'missing' };
  // Any sentence whose only outcome word is "nothing" predicts nothing ("it will do nothing").
  const bare = t.replace(STRIP, ' ').replace(/\b(do|does|happen|happens|change|changes|occur|occurs)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (bare === 'nothing') return { kind: 'nothing' };
  // Negation can sit anywhere before the outcome: "not cord", "I expect not cord", "it will not make fire".
  let negated = false;
  const neg = /\b(not|no|never|won't|wont|cannot|can't|doesn't|does not|will not)\b/;
  if (neg.test(t)) { negated = true; t = t.replace(new RegExp(neg.source, 'g'), ' '); }
  t = t.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  if (/^(nothing|none)$/.test(t) || (!t && negated)) return negated ? { kind: 'something' } : { kind: 'nothing' };
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
