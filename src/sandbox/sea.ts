// The sea (decision 59): effects and physics, never solutions (decision 12). What sinks is lost; a lone
// log rolls its rider back into the shallows; anything small that floats drifts away; a raft or a sealed boat carries its rider across. A storm
// capsizes a raft, and the sea keeps what it carried; a sealed boat rides the storm out. Pure, so the
// server applies the losses and the landing.
export type Craft = 'raft' | 'boat';
export interface Floatable { name: string; floats?: 'rolls' | 'drifts'; craft?: Craft }
export type Launch = { kind: 'nothing' } | { kind: 'sank' } | { kind: 'drifted' } | { kind: 'dumped' } | { kind: 'voyage'; craft: Craft };
export interface Point { x: number; z: number }
export interface Voyage { craft: Craft; from: Point; to: Point; start: number; ms: number }

export function launch(item: Floatable | undefined): Launch {
  if (!item) return { kind: 'nothing' };
  if (item.craft) return { kind: 'voyage', craft: item.craft };
  return item.floats === 'rolls' ? { kind: 'dumped' } : item.floats === 'drifts' ? { kind: 'drifted' } : { kind: 'sank' };
}

export const startVoyage = (craft: Craft, from: Point, to: Point, start: number, ms: number): Voyage => ({ craft, from: { ...from }, to: { ...to }, start, ms });

/** Where the craft is at a time, and what has become of it. */
export function voyageAt(v: Voyage, now: number, storm: boolean): Point & { state: 'sailing' | 'landfall' | 'capsized' } {
  const t = Math.max(0, Math.min(1, (now - v.start) / v.ms));
  const at = { x: v.from.x + (v.to.x - v.from.x) * t, z: v.from.z + (v.to.z - v.from.z) * t };
  if (t >= 1) return { ...at, state: 'landfall' };
  if (storm && v.craft === 'raft') return { ...at, state: 'capsized' };
  return { ...at, state: 'sailing' };
}

/** A course is sea-clear when nothing but water lies under it, apart from the shores it leaves and reaches. */
export function seaClear(height: (x: number, z: number) => number, from: Point, to: Point, shore = 3): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  for (let d = shore; d <= length - shore; d += 0.5) {
    const t = d / length;
    if (height(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) > 0) return false;
  }
  return true;
}

/** What the sea may wash ashore for an agent: loose materials, but never the islet's own off the islet. */
export function shoreGifts<T extends { tier: number; islet?: boolean }>(substances: T[], island: 'main' | 'islet'): T[] {
  return substances.filter(s => s.tier === 0 && (!s.islet || island === 'islet'));
}
