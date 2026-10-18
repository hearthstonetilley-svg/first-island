import { median } from './diagnostics';

export type QualityLevel = 'high' | 'balanced' | 'low' | 'minimal';
export interface QualityChange {
  level: QualityLevel;
  pixelRatio: number;
  aoEnabled: boolean;
  /** False only in the opt-in minimal tier: the scene renders directly, without bloom. */
  postEnabled?: boolean;
  shadowMapSize?: number;
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

  /** allowMinimal adds one tier below low (no post-processing, smaller shadows) for pages that opt in. */
  constructor(readonly basePixelRatio: number, readonly postEnabled: boolean, readonly allowMinimal = false) {
    this.reducedPixelRatio = Math.min(basePixelRatio, 1, Math.max(0.5, basePixelRatio * 0.75));
  }

  private get lowStage(): number { return this.postEnabled ? 2 : 1; }
  get atMinimum(): boolean { return this.stage >= this.lowStage + (this.allowMinimal ? 1 : 0); }

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
    const minimal = this.stage > this.lowStage;
    this.level = minimal ? 'minimal' : this.stage === 0 ? 'high' : this.stage === 1 ? 'balanced' : 'low';
    const change: QualityChange = { level: this.level, pixelRatio: this.stage === 0 ? this.basePixelRatio : this.reducedPixelRatio,
      aoEnabled: this.postEnabled && this.stage < 2, medianMs, elapsedMs };
    if (this.allowMinimal) { change.postEnabled = this.postEnabled && !minimal; change.shadowMapSize = minimal ? 1024 : 2048; }
    return change;
  }
}
