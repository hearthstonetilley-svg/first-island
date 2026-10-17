import { median } from './diagnostics';

export type QualityLevel = 'high' | 'balanced' | 'low';
export interface QualityChange {
  level: QualityLevel;
  pixelRatio: number;
  aoEnabled: boolean;
  medianMs: number;
  elapsedMs: number;
}

/** Measure two seconds of visible RAF cadence after warm-up, then after each change.
 * Deliberately one-way: a slow device must not oscillate between expensive graphs. */
export class AdaptiveQuality {
  level: QualityLevel = 'high';
  readonly reducedPixelRatio: number;
  private windowStart: number | undefined;
  private previousTime: number | undefined;
  private samples: number[] = [];
  private stage = 0;

  constructor(readonly basePixelRatio: number, readonly postEnabled: boolean) {
    this.reducedPixelRatio = Math.min(basePixelRatio, 1, Math.max(0.5, basePixelRatio * 0.75));
  }

  reset(): void {
    this.windowStart = undefined;
    this.previousTime = undefined;
    this.samples = [];
  }

  sample(timestamp: number): QualityChange | undefined {
    if (this.stage >= (this.postEnabled ? 2 : 1)) return;
    if (this.windowStart === undefined || this.previousTime === undefined) {
      this.windowStart = this.previousTime = timestamp;
      return;
    }
    this.samples.push(timestamp - this.previousTime);
    this.previousTime = timestamp;
    if (timestamp - this.windowStart < 2000) return;
    const medianMs = median(this.samples);
    const elapsedMs = timestamp - this.windowStart;
    this.reset();
    if (medianMs <= 25) return;
    this.stage += 1;
    this.level = this.stage === 1 ? 'balanced' : 'low';
    return { level: this.level, pixelRatio: this.reducedPixelRatio,
      aoEnabled: this.postEnabled && this.stage < 2, medianMs, elapsedMs };
  }
}
