/** Simulation-owned Mulberry32 stream. Its state advances only on fixed ticks/actions. */
export class Random {
  private state: number;
  constructor(seed: number) { this.state = seed | 0; }
  snapshot(): number { return this.state; }
  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}
