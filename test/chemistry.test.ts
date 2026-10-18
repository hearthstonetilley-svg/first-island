import { describe, expect, it } from 'vitest';
import { generateChemistry, react, strike } from '../src/sandbox/chemistry';

describe('island chemistry', () => {
  it('is the same for the same seed and differs between seeds', () => {
    expect(generateChemistry(7)).toEqual(generateChemistry(7));
    expect(generateChemistry(7).substances[0].name).not.toBe(generateChemistry(8).substances[0].name);
  });
  it('has six elements, each found somewhere, with unique coined names', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const c = generateChemistry(seed);
      const elements = c.substances.filter(s => s.tier === 0);
      expect(elements).toHaveLength(6);
      expect(elements.every(e => e.ground)).toBe(true);
      expect(new Set(c.substances.map(s => s.name)).size).toBe(c.substances.length);
      for (const word of ['stone', 'wood', 'fire', 'water', 'tree', 'fruit']) expect(c.substances.some(s => s.name === word)).toBe(false);
    }
  });
  it('lets every structure be reached from the elements alone', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const c = generateChemistry(seed);
      const reachable = new Set(c.substances.filter(s => s.tier === 0).map(s => s.name));
      for (let changed = true; changed;) {
        changed = false;
        for (const r of c.reactions) if (reachable.has(r.a) && reachable.has(r.b) && !reachable.has(r.product)) { reachable.add(r.product); changed = true; }
      }
      const structures = c.substances.filter(s => s.structure);
      expect(structures).toHaveLength(4);
      expect(structures.every(s => reachable.has(s.name))).toBe(true);
    }
  });
  it('separates striking from combining', () => {
    const c = generateChemistry(1);
    const s = c.reactions.find(r => r.struck)!;
    expect(strike(c, s.a)?.product).toBe(s.product);
    expect(react(c, s.a, s.a)?.struck).toBeFalsy();
  });
});
