import { expect, it } from 'vitest';
import { Simulation } from '../src/sim/core';
it('observes reproduction failures without advancing or changing a run', () => {
  const a=new Simulation(42), b=new Simulation(42);
  for(let i=0;i<6;i++){a.step(300);a.reproductionDiagnostics();b.step(300);}
  expect(a.record()).toEqual(b.record());
  const stats=a.reproductionDiagnostics();
  expect(stats.failures.rest).toBeGreaterThan(0);
  expect(stats.readyWithPartner).toBe(0);
  expect(stats.population).toBe(a.snapshot().stats.population);
});
