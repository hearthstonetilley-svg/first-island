import { describe, expect, it } from 'vitest';
import { launch, startVoyage, voyageAt } from '../src/sandbox/sea';

// Boats (decision 59): the sea decides. Effects and physics, never solutions (decision 12).
const item = (name: string, floats: boolean, craft?: 'raft' | 'boat') => ({ name, floats, craft });
const from = { x: 0, z: 0 }, to = { x: 30, z: -40 };

describe('the sea', () => {
  it('what sinks is lost, a lone float dumps its rider, a craft sails', () => {
    for (const n of ['stone', 'flint', 'pyrite', 'clay']) expect(launch(item(n, false)).kind).toBe('sank');
    for (const n of ['driftwood', 'wood']) expect(launch(item(n, true)).kind).toBe('dumped');
    expect(launch(item('raft', true, 'raft')).kind).toBe('voyage');
    expect(launch(item('boat', true, 'boat')).kind).toBe('voyage');
    expect(launch(undefined).kind).toBe('nothing');
  });
  it('a raft crosses in calm weather and lands when the voyage is done', () => {
    const v = startVoyage('raft', from, to, 1000, 4000);
    expect(voyageAt(v, 2000, false).state).toBe('sailing');
    expect(voyageAt(v, 5000, false).state).toBe('landfall');
  });
  it('a storm capsizes a raft but not a sealed boat', () => {
    expect(voyageAt(startVoyage('raft', from, to, 0, 4000), 1000, true).state).toBe('capsized');
    const boat = startVoyage('boat', from, to, 0, 4000);
    for (let t = 0; t < 4000; t += 100) expect(voyageAt(boat, t, true).state).toBe('sailing');
    expect(voyageAt(boat, 4000, true).state).toBe('landfall');
  });
  it('a craft travels the straight line between the shores, never past them', () => {
    const v = startVoyage('raft', from, to, 0, 4000);
    for (let t = 0; t <= 5000; t += 250) {
      const { x, z } = voyageAt(v, t, false);
      const along = (x * to.x + z * to.z) / (to.x ** 2 + to.z ** 2);
      expect(along).toBeGreaterThanOrEqual(0); expect(along).toBeLessThanOrEqual(1);
      expect(Math.abs(x * to.z - z * to.x) / Math.hypot(to.x, to.z)).toBeLessThan(1e-9);
    }
  });
});
