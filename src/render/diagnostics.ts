export interface FrameSample {
  frame: number;
  elapsedMs: number;
  intervalMs: number | null;
  renderCpuMs: number;
  quality: string;
}

export interface FrameSummary {
  frames: number;
  worstFrameMs: number;
  framesOver50Ms: number;
  medianFrameMs: number;
  first30MedianMs: number;
  last120MedianMs: number;
  settledFrame: number | null;
  settledAfterMs: number | null;
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) * 0.5;
}

/** Settled means trailing 30-frame windows agree with the final median within 15%,
 * with their 90th percentile below 1.5x that median. This is a diagnostic, not an FPS target. */
export function summarizeFrames(frames: readonly FrameSample[]): FrameSummary {
  const intervals = frames.filter((frame): frame is FrameSample & { intervalMs: number } => frame.intervalMs !== null);
  const values = intervals.map((frame) => frame.intervalMs);
  const tail = median(values.slice(-120));
  let settled: FrameSample | undefined;
  for (let end = intervals.length; end >= 30; end -= 30) {
    const window = intervals.slice(end - 30, end);
    const times = window.map((frame) => frame.intervalMs).sort((a, b) => a - b);
    if (Math.abs(median(times) - tail) > tail * 0.15 || times[Math.floor(times.length * 0.9)] > tail * 1.5) break;
    settled = window[0];
  }
  return {
    frames: frames.length, worstFrameMs: Math.max(0, ...values),
    framesOver50Ms: values.filter((value) => value > 50).length,
    medianFrameMs: median(values), first30MedianMs: median(values.slice(0, 30)), last120MedianMs: tail,
    settledFrame: settled?.frame ?? null, settledAfterMs: settled?.elapsedMs ?? null,
  };
}

export interface DiagnosticReport {
  context: Record<string, unknown>;
  phasesMs: Record<string, number>;
  scene: Record<string, unknown>;
  timeToFirstFrameMs: number | null;
  frames: FrameSample[];
  summary: FrameSummary | null;
  complete: boolean;
}

declare global { interface Window { __ISLAND_DEBUG__?: DiagnosticReport } }

export class FrameDiagnostics {
  readonly report: DiagnosticReport;
  private previousTimestamp: number | undefined;
  private firstTimestamp: number | undefined;

  constructor(context: Record<string, unknown>, private readonly emit = true) {
    this.report = { context, phasesMs: {}, scene: {}, timeToFirstFrameMs: null, frames: [], summary: null, complete: false };
    if (typeof window !== 'undefined') window.__ISLAND_DEBUG__ = this.report;
  }

  phase(name: string, milliseconds: number): void { this.report.phasesMs[name] = milliseconds; }

  record(timestamp: number, renderCpuMs: number, quality: string, submittedAt: number): void {
    if (this.report.complete) return;
    if (this.firstTimestamp === undefined) {
      this.firstTimestamp = timestamp;
      this.report.timeToFirstFrameMs = submittedAt;
      if (this.emit) console.info('[island-debug] first frame', JSON.stringify({
        timeToFirstFrameMs: submittedAt, phasesMs: this.report.phasesMs, scene: this.report.scene,
      }));
    }
    const frame: FrameSample = {
      frame: this.report.frames.length + 1, elapsedMs: timestamp - this.firstTimestamp,
      intervalMs: this.previousTimestamp === undefined ? null : timestamp - this.previousTimestamp,
      renderCpuMs, quality,
    };
    this.previousTimestamp = timestamp;
    this.report.frames.push(frame);
    if (this.emit) console.debug('[island-debug] frame', JSON.stringify(frame));
    if (this.report.frames.length === 600) {
      this.report.complete = true;
      this.report.summary = summarizeFrames(this.report.frames);
      if (this.emit) console.info('[island-debug] summary', JSON.stringify(this.report.summary));
    }
  }
}
