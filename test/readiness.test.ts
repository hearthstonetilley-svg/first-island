import { describe, expect, it } from 'vitest';
import { ReadinessGate } from '../src/render/readiness';

function sampleWindow(intervals: number[]) {
  const gate = new ReadinessGate();
  let time = 0;
  gate.sample(time);
  let result;
  for (const interval of intervals) { time += interval; result = gate.sample(time) ?? result; }
  return result;
}

describe('loading readiness gate', () => {
  it('requires a full two seconds before automatic entry', () => {
    const gate = new ReadinessGate();
    gate.sample(0);
    for (let time = 16; time < 2000; time += 16) expect(gate.sample(time)).toBeUndefined();
    expect(gate.sample(2000)?.ready).toBe(true);
  });
  it('accepts the 25 ms target but rejects a stable slow renderer', () => {
    expect(sampleWindow(Array(80).fill(25))?.ready).toBe(true);
    expect(sampleWindow(Array(10).fill(400))?.ready).toBe(false);
    expect(sampleWindow(Array(50).fill(40))?.ready).toBe(false);
  });
  it('rejects frequent hitches even with a fast median', () => {
    const result = sampleWindow(Array.from({length:100}, (_, i) => i % 10 === 0 ? 100 : 16));
    expect(result?.medianMs).toBe(16);
    expect(result?.p95Ms).toBe(100);
    expect(result?.ready).toBe(false);
  });
  it('discards pre-change and hidden-tab intervals before checking readiness', () => {
    const gate = new ReadinessGate();
    gate.sample(0); gate.sample(1000); gate.reset();
    expect(gate.sample(100000)).toBeUndefined();
    let result;
    for (let time = 100016; time < 102032; time += 16) result = gate.sample(time) ?? result;
    expect(result?.ready).toBe(true);
    expect(result?.p95Ms).toBe(16);
  });
});
