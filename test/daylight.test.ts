import { afterEach, expect, it, vi } from 'vitest';
import { daylightAt } from '../src/sim/daylight';
import { Simulation } from '../src/sim/core';
import { generateWorld } from '../src/world/generate';
afterEach(()=>vi.restoreAllMocks());

it('retains the daily curve, boundaries and exact periodicity without native cosine',()=>{
  expect([0,450,900,1350,1800].map(tick=>daylightAt(tick,1800))).toEqual([1,0.5,0,0.5,1]);
  let maxError=0;
  for(let tick=0;tick<=21600;tick++){
    const value=daylightAt(tick,1800);
    expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);
    expect(value).toBe(daylightAt(tick+1800,1800));
    maxError=Math.max(maxError,Math.abs(value-(Math.cos(tick/1800*Math.PI*2)+1)/2));
  }
  expect(maxError).toBeLessThan(1e-12); // Shape accuracy only; replay/state hashes remain exact.
});

it('advances the awkward tick-756 state without calling native cosine inside the simulation',()=>{
  const world=generateWorld(42),simulation=new Simulation(42,{},world);
  vi.spyOn(Math,'cos').mockImplementation(()=>{throw new Error('Nonportable simulation cosine');});
  simulation.step(756);
  expect(simulation.snapshot().environment.daylight).toBe(daylightAt(756,1800));
});
