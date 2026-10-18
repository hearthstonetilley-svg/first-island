// Reading a spoken recipe claim: "flint + pyrite makes sparks", "flint and pyrite make sparks",
// "... makes nothing". Only one plain, affirmative outcome counts; negations ("makes no sparks",
// "does not make") and alternatives ("fire or sparks") are not claims, and every material must be
// a whole known name, so "redwood" is never read as "wood".
export function readClaim(text: string, names: Iterable<string>): { pair: string; product: string } | undefined {
  const knownNames = names instanceof Set ? names as Set<string> : new Set(names);
  const t = text.toLowerCase();
  const m = t.match(/([a-z][a-z ]*?)\s+(?:\+|and|with)\s+([a-z][a-z ]*?)\s+(?:makes?|gives?|becomes?|produces?)\s+([a-z][a-z ]*?)\s*(?:[.!,;]|$)/);
  if (!m) return undefined;
  // The claim must stand alone: nothing joined onto the first ingredient from before it
  // ("flint/wood and", "flint + wood + pyrite", "flint, wood and").
  const before = t.slice(0, m.index).trimEnd();
  if (/(?:[+/&,]|\b(?:or|and|with|nor|plus))$/.test(before)) return undefined;
  const sorted = [...knownNames].sort((p, q) => q.length - p.length);
  // An ingredient is the last whole name in its phrase; anything before it may set the scene
  // ("I found that flint") but may not hedge or negate it ("flint or wood", "not flint").
  const nameIn = (x: string) => {
    const s = x.trim(), n = sorted.find(k => s === k || s.endsWith(` ${k}`));
    if (!n) return undefined;
    return /\b(?:no|not|never|or|nor|and)\b/.test(s.slice(0, s.length - n.length)) ? undefined : n;
  };
  const x = nameIn(m[1]), y = nameIn(m[2]);
  const raw = m[3].trim().replace(/^(?:a|an|some)\s+/, '');
  if (/\b(?:no|not|never|or|and|nor)\b/.test(raw)) return undefined;
  const product = raw === 'nothing' ? 'nothing' : knownNames.has(raw) ? raw : undefined;
  if (!x || !y || !product) return undefined;
  return { pair: [x, y].sort().join(' + '), product };
}
