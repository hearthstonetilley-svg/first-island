import { describe, expect, it } from 'vitest';
import { realWorldChemistry } from '../src/sandbox/realworld';
import { react, strike, missingTool, pickGather } from '../src/sandbox/chemistry';

describe('real-world chemistry', () => {
  const c = realWorldChemistry();
  it('every reaction uses known materials and has a known product', () => {
    const names = new Set(c.substances.map(s => s.name));
    for (const r of c.reactions) for (const n of [r.a, r.b, r.product]) expect(names.has(n), n).toBe(true);
  });
  it('every made thing and every structure can be reached from what can be gathered', () => {
    const reach = new Set(c.substances.filter(s => s.ground && !s.needs).map(s => s.name));
    for (let changed = true; changed;) {
      changed = false;
      for (const s of c.substances) if (s.ground && s.needs && !reach.has(s.name) && s.needs.some(t => reach.has(t))) { reach.add(s.name); changed = true; }
      for (const r of c.reactions) if (reach.has(r.a) && reach.has(r.b) && !reach.has(r.product)) { reach.add(r.product); changed = true; }
    }
    for (const s of c.substances) expect(reach.has(s.name), s.name).toBe(true);
    expect(c.substances.filter(s => s.structure).map(s => s.structure).sort()).toEqual(['beacon', 'hut', 'ring', 'tower']);
  });
  it('works the way the real world does', () => {
    expect(react(c, 'pyrite', 'flint')?.product).toBe('sparks');
    expect(react(c, 'water', 'clay')?.product).toBe('wet clay');
    expect(strike(c, 'flint')?.product).toBe('flint flake');
    expect(react(c, 'wood', 'sand')).toBeUndefined();
  });
  it('has food to find, and one thing that sickens', () => {
    expect(c.substances.filter(s => (s.food ?? 0) > 0).length).toBeGreaterThanOrEqual(3);
    expect(c.substances.filter(s => (s.food ?? 0) < 0).map(s => s.name)).toEqual(['red berries']);
  });
  it('tools matter: wood from a living tree needs an edge, loose things do not', () => {
    const wood = c.substances.find(s => s.name === 'wood')!, drift = c.substances.find(s => s.name === 'driftwood')!;
    expect(missingTool(wood, [])).toEqual(['flint flake', 'blade', 'axe', 'obsidian blade']);
    expect(missingTool(wood, ['flint flake'])).toBeUndefined();
    expect(missingTool(wood, ['shell', 'axe'])).toBeUndefined();
    expect(missingTool(drift, [])).toBeUndefined();
  });
  it('asking for driftwood never hands over wood', () => {
    expect(pickGather(['wood', 'driftwood', 'sand'], 'driftwood')).toBe('driftwood');
    expect(pickGather(['wood', 'driftwood'], 'some wood')).toBe('wood');
    expect(pickGather(['sand'], 'nothing here', () => 0)).toBe('sand');
  });
});
