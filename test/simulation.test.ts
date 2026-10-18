import { describe, expect, it } from 'vitest';
import { Simulation, replay } from '../src/sim/core';

describe('fixed simulation core', () => {
  it('replays logged dial and speed interventions at the same tick', () => {
    const sim = new Simulation(7);
    sim.step(100); sim.intervene({ speed: 100 }); sim.intervene({ dials: { generationSeconds: 60 } });
    sim.step(300); sim.intervene({ speed: 0 });
    const restored = replay(sim.record());
    expect(restored.snapshot()).toEqual(sim.snapshot());
    expect(restored.record()).toEqual(sim.record());
    expect(() => replay({ ...sim.record(), events: sim.record().events.slice(1) })).toThrow('diverged');
  });
  it('is independent of stepping batches and returns detached snapshots and logs', () => {
    const a = new Simulation(42); const b = new Simulation(42);
    a.step(4000); for (let n=0;n<400;n++) b.step(10);
    expect(a.record()).toEqual(b.record());
    const record = a.record(); record.events[0].data.generation = -1;
    expect(a.record().events[0].data.generation).toBe(1);
    const snapshot=a.snapshot();snapshot.dials.generationSeconds=1;
    expect(a.snapshot().dials.generationSeconds).toBe(1800);
    expect(a.snapshot().generation).toBe(3);
    expect(new Simulation(99).record()).not.toEqual(new Simulation(42).record());
  });
  it('validates ticks and dials and keeps generation changes prospective', () => {
    const sim=new Simulation(1);
    expect(()=>sim.step(-1)).toThrow(); expect(()=>sim.step(1.2)).toThrow();
    expect(()=>sim.intervene({dials:{foodRegrowth:NaN}})).toThrow();
    expect(()=>sim.intervene({dials:{startingPopulation:2}})).toThrow();
    sim.step(900);sim.intervene({dials:{generationSeconds:60}});sim.step(30);
    expect(sim.snapshot().generation).toBe(2);
  });
});
