/** Removes listed private terms from any text before it leaves the server.
 * Terms match as whole words, so "seek" hides "Seek" but not "seeking".
 * The list itself is supplied at runtime and never stored in the repo. */
export function makeScrubber(terms: string[]): (text: string) => string {
  const clean = terms.map(t => t.trim()).filter(t => t.length >= 3);
  if (clean.length === 0) return text => text;
  const escaped = clean.sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp('(?<![\\w@.])(?:' + escaped.join('|') + ')(?![\\w@])', 'gi');
  return text => text.replace(pattern, '[hidden]');
}
