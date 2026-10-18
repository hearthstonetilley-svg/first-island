import { median } from './diagnostics';

export type QualityLevel = 'high' | 'balanced' | 'low';
export interface QualityChange {
  level: QualityLevel;
  pixelRatio: number;
  aoEnabled: boolean;
  medianMs: number;
  elapsedMs: number;
}

/** Adapt from unobscured play cadence only. Two slow seconds reduce quality;
 * six consistently fast seconds restore one step. The threshold gap provides
 * headroom before restoring a more expensive resolution/graph. */
export class AdaptiveQuality {
  level: QualityLevel = 'high';
  readonly reducedPixelRatio: number;
  private windowStart: number | undefined;
  private previousTime: number | undefined;
  private samples: number[] = [];
  private stage = 0;
  private fastWindows = 0;

  constructor(readonly basePixelRatio: number, readonly postEnabled: boolean) {
    this.reducedPixelRatio = Math.min(basePixelRatio, 1, Math.max(0.5, basePixelRatio * 0.75));
  }

  get atMinimum(): boolean { return this.stage >= (this.postEnabled ? 2 : 1); }

  reset(): void {
    this.fastWindows = 0;
    this.resetWindow();
  }

  private resetWindow(): void {
    this.windowStart = undefined;
    this.previousTime = undefined;
    this.samples = [];
  }

  sample(timestamp: number, playing = true): QualityChange | undefined {
    if (!playing) { this.reset(); return; }
    if (this.windowStart === undefined || this.previousTime === undefined) {
      this.windowStart = this.previousTime = timestamp;
      return;
    }
    this.samples.push(timestamp - this.previousTime);
    this.previousTime = timestamp;
    if (timestamp - this.windowStart < 2000) return;
    const medianMs = median(this.samples);
    const elapsedMs = timestamp - this.windowStart;
    const ordered = [...this.samples].sort((a, b) => a - b);
    const p95 = ordered[Math.floor((ordered.length - 1) * 0.95)];
    this.resetWindow();
    this.fastWindows = medianMs <= 18 && p95 <= 25 ? this.fastWindows + 1 : 0;
    if (medianMs > 25 && !this.atMinimum) this.stage += 1;
    else if (this.stage > 0 && this.fastWindows >= 3) this.stage -= 1;
    else return;
    this.fastWindows = 0;
    this.level = this.stage === 0 ? 'high' : this.stage === 1 ? 'balanced' : 'low';
    return { level: this.level, pixelRatio: this.stage === 0 ? this.basePixelRatio : this.reducedPixelRatio,
      aoEnabled: this.postEnabled && this.stage < 2, medianMs, elapsedMs };
  }
}
