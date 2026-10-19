import { describe, expect, it } from 'vitest';
import { launch, seaClear, shoreGifts, startVoyage, voyageAt } from '../src/sandbox/sea';

// Boats (decision 59): the sea decides. Effects and physics, never solutions (decision 12).
const item = (name: string, floats?: 'rolls' | 'drifts', craft?: 'raft' | 'boat') => ({ name, floats, craft });
const from = { x: 0, z: 0 }, to = { x: 30, z: -40 };

describe('the sea', () => {
  it('what sinks is lost, small floats drift off, a lone log dumps its rider, a craft sails', () => {
    for (const n of ['stone', 'flint', 'pyrite', 'clay']) expect(launch(item(n)).kind).toBe('sank');
    for (const n of ['fruit', 'dry grass']) expect(launch(item(n, 'drifts')).kind).toBe('drifted');
    for (const n of ['driftwood', 'wood']) expect(launch(item(n, 'rolls')).kind).toBe('dumped');
    expect(launch(item('raft', undefined, 'raft')).kind).toBe('voyage');
    expect(launch(item('boat', undefined, 'boat')).kind).toBe('voyage');
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

describe('the sea route', () => {
  // A height field: a ridge of land across x = 10, open sea elsewhere.
  const height = (x: number, _z: number) => (Math.abs(x - 10) < 2 ? 2 : -1);
  it('a straight course across open water is clear', () => {
    expect(seaClear(height, { x: 0, z: 0 }, { x: 0, z: 30 })).toBe(true);
  });
  it('a course that would cross land is not', () => {
    expect(seaClear(height, { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
  });
  it('the shores at either end do not block the course', () => {
    const shores = (x: number, _z: number) => (x < 1 || x > 19 ? 1 : -1);
    expect(seaClear(shores, { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(true);
  });
});

describe('what the sea washes ashore', () => {
  const subs = [{ name: 'sand', tier: 0 }, { name: 'obsidian', tier: 0, islet: true }, { name: 'rope', tier: 1 }];
  it('never gives the islet\'s own material on the main island', () => {
    expect(shoreGifts(subs, 'main').map(s => s.name)).toEqual(['sand']);
    expect(shoreGifts(subs, 'islet').map(s => s.name)).toEqual(['sand', 'obsidian']);
  });
});
