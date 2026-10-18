import { describe, expect, it } from 'vitest';
import { FrameDiagnostics, median, summarizeFrames } from '../src/render/diagnostics';

describe('first-load frame diagnostics', () => {
  it('calculates medians without mutating the caller data', () => {
    const values = [50, 10, 40, 20];
    expect(median(values)).toBe(30);
    expect(values).toEqual([50, 10, 40, 20]);
    expect(median([4, 2, 3])).toBe(3);
    expect(median([])).toBe(0);
  });

  it('keeps the first 600 frames, counts spikes and reports trailing stability', () => {
    const recorder = new FrameDiagnostics({ seed: 1 }, false);
    let timestamp = 0;
    for (let frame = 1; frame <= 620; frame += 1) {
      timestamp += frame === 2 ? 300 : 16;
      recorder.record(timestamp, frame === 2 ? 280 : 2, 'high', timestamp);
    }
    const { report } = recorder;
    expect(report.frames).toHaveLength(600);
    expect(report.frames[0].intervalMs).toBeNull();
    expect(report.timeToFirstFrameMs).toBe(16);
    expect(report.complete).toBe(true);
    expect(report.summary?.worstFrameMs).toBe(300);
    expect(report.summary?.framesOver50Ms).toBe(1);
    expect(report.summary?.last120MedianMs).toBe(16);
    expect(report.summary?.settledFrame).toBeGreaterThan(2);
  });

  it('does not count a hidden-tab gap as a rendered frame interval', () => {
    const recorder = new FrameDiagnostics({}, false);
    recorder.record(100, 2, 'high', 102);
    recorder.discontinuity();
    recorder.record(100000, 2, 'high', 100002);
    expect(recorder.report.frames[1].intervalMs).toBeNull();
  });

  it('reports no stability claim for fewer than 30 intervals', () => {
    const recorder = new FrameDiagnostics({}, false);
    recorder.record(100, 2, 'high', 102);
    expect(summarizeFrames(recorder.report.frames).settledFrame).toBeNull();
    expect(summarizeFrames([]).worstFrameMs).toBe(0);
  });
});
