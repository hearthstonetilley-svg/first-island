import { median } from './diagnostics';

export interface ReadinessWindow {
  medianMs: number;
  p95Ms: number;
  elapsedMs: number;
  samples: number;
  ready: boolean;
}

/** A steady slow renderer is not a smooth renderer. Only auto-enter after a
 * complete visible-page cadence window meets the same 25 ms quality target. */
export class ReadinessGate {
  private start: number | undefined;
  private previous: number | undefined;
  private intervals: number[] = [];

  reset(): void { this.start = this.previous = undefined; this.intervals = []; }

  sample(timestamp: number): ReadinessWindow | undefined {
    if (this.start === undefined || this.previous === undefined) {
      this.start = this.previous = timestamp;
      return;
    }
    this.intervals.push(timestamp - this.previous);
    this.previous = timestamp;
    if (timestamp - this.start < 2000 || this.intervals.length < 5) return;
    const ordered = [...this.intervals].sort((a, b) => a - b);
    const medianMs = median(ordered);
    const p95Ms = ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)];
    const result = { medianMs, p95Ms, elapsedMs: timestamp - this.start,
      samples: ordered.length, ready: medianMs <= 25 && p95Ms <= 50 };
    this.reset();
    return result;
  }
}
