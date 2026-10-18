import { describe, expect, it } from 'vitest';
import { newBoar, stepBoar, Prey } from '../src/sandbox/boar';

const food = (i: string) => i === 'fruit';
const prey = (over: Partial<Prey> = {}): Prey => ({ id: 1, x: 0, z: 0, sheltered: false, collapsed: false, inventory: [], ...over });
describe('the night boar', () => {
  it('sleeps by day', () => {
    const b = newBoar(5, 0);
    expect(stepBoar(b, [prey()], false, 0, 1, food)).toEqual([]);
    expect(b.awake).toBe(false);
  });
  it('closes on an exposed agent at night and charges, taking food', () => {
    const b = newBoar(3, 0), p = prey({ inventory: ['shell', 'fruit'] });
    let ev = stepBoar(b, [p], true, 0, 1, food);
    expect(b.x).toBeLessThan(3);
    for (let t = 1; t < 10 && !ev.length; t++) ev = stepBoar(b, [p], true, t * 1000, 1, food);
    expect(ev).toEqual([{ kind: 'charge', id: 1, took: 'fruit' }]);
  });
  it('leaves sheltered and collapsed agents alone', () => {
    const b = newBoar(0.5, 0);
    expect(stepBoar(b, [prey({ sheltered: true }), prey({ id: 2, collapsed: true })], true, 0, 1, food)).toEqual([]);
  });
  it('a spear drives it off, and it keeps away for a while', () => {
    const b = newBoar(0.5, 0), p = prey({ inventory: ['spear'] });
    expect(stepBoar(b, [p], true, 0, 1, food)).toEqual([{ kind: 'driven', id: 1 }]);
    const d0 = Math.hypot(b.x, b.z);
    stepBoar(b, [p], true, 1000, 1, food);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(d0);
  });
  it('does not charge the same agent again straight away', () => {
    const b = newBoar(0.5, 0), p = prey();
    expect(stepBoar(b, [p], true, 0, 1, food)).toHaveLength(1);
    b.x = 0.5; b.z = 0;
    expect(stepBoar(b, [p], true, 2000, 1, food)).toEqual([]);
  });
});
