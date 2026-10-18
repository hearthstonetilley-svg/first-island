// The night boar (decision 55): a threat to defend against. It sleeps by day. At night it
// hunts the nearest agent caught in the open, charges on contact (hurting them and taking a
// piece of food), and leaves sheltered and collapsed agents alone. An agent holding a spear
// drives it off for a while. Pure: the server applies the strength loss and the lost item.
export interface Boar { x: number; z: number; awake: boolean; fleeUntil: number; nextHit: Record<number, number> }
export interface Prey { id: number; x: number; z: number; sheltered: boolean; collapsed: boolean; inventory: string[] }
export type BoarEvent = { kind: 'charge'; id: number; took?: string } | { kind: 'driven'; id: number };

export const BOAR_SPEED = 1.2, BOAR_SIGHT = 12, BOAR_REACH = 1, BOAR_FLEE_MS = 30000, BOAR_REST_MS = 15000;

export const newBoar = (x: number, z: number): Boar => ({ x, z, awake: false, fleeUntil: 0, nextHit: {} });

export function stepBoar(b: Boar, prey: Prey[], active: boolean, now: number, dt: number, isFood: (item: string) => boolean): BoarEvent[] {
  b.awake = active;
  if (!active) return [];
  const open = prey.filter(p => !p.sheltered && !p.collapsed);
  const dist = (p: Prey) => Math.hypot(p.x - b.x, p.z - b.z);
  const nearest = open.sort((p, q) => dist(p) - dist(q))[0];
  if (!nearest || dist(nearest) > BOAR_SIGHT) return [];
  const d = dist(nearest), ux = d > 1e-6 ? (nearest.x - b.x) / d : 1, uz = d > 1e-6 ? (nearest.z - b.z) / d : 0;
  if (now < b.fleeUntil) { b.x -= ux * BOAR_SPEED * dt; b.z -= uz * BOAR_SPEED * dt; return []; }
  if (d > BOAR_REACH) {
    const step = Math.min(BOAR_SPEED * dt, d);
    b.x += ux * step; b.z += uz * step;
    if (d - step > BOAR_REACH) return [];
  }
  if (now < (b.nextHit[nearest.id] ?? 0)) return [];
  b.nextHit[nearest.id] = now + BOAR_REST_MS;
  if (nearest.inventory.includes('spear')) { b.fleeUntil = now + BOAR_FLEE_MS; return [{ kind: 'driven', id: nearest.id }]; }
  const took = nearest.inventory.find(isFood);
  return [took ? { kind: 'charge', id: nearest.id, took } : { kind: 'charge', id: nearest.id }];
}
