import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '../src/render/quality';

function windowOf(quality: AdaptiveQuality, start: number, interval: number) {
  quality.sample(start);
  let result;
  for (let time = start + interval; time <= start + 2000 + interval; time += interval) {
    result = quality.sample(time) ?? result;
  }
  return result;
}

describe('adaptive rendering quality', () => {
  it('reduces pixels before disabling AO, only after a complete slow window', () => {
    const quality = new AdaptiveQuality(1.5, true);
    expect(quality.sample(10000)).toBeUndefined();
    for (let time = 10040; time < 12000; time += 40) expect(quality.sample(time)).toBeUndefined();
    expect(quality.sample(12000)).toMatchObject({ level: 'balanced', pixelRatio: 1, aoEnabled: true, medianMs: 40 });
    expect(windowOf(quality, 12040, 40)).toMatchObject({ level: 'low', pixelRatio: 1, aoEnabled: false });
    expect(windowOf(quality, 15000, 100)).toBeUndefined();
  });
  it('keeps high quality at 25 ms and tolerates an isolated hitch', () => {
    const quality = new AdaptiveQuality(1, true);
    expect(windowOf(quality, 0, 25)).toBeUndefined();
    expect(quality.level).toBe('high');
    quality.reset();
    quality.sample(10000);
    quality.sample(10500);
    for (let time = 10516; time < 12020; time += 16) quality.sample(time);
    expect(quality.level).toBe('high');
  });
  it('discards background intervals and measures a fresh visible window', () => {
    const quality = new AdaptiveQuality(1, true);
    quality.sample(0);
    quality.sample(100);
    quality.reset();
    expect(windowOf(quality, 100000, 16)).toBeUndefined();
    expect(quality.level).toBe('high');
  });
  it('never increases pixel ratio and does not claim an AO step when post is off', () => {
    for (const ratio of [0.4, 0.5, 1, 1.5]) {
      const quality = new AdaptiveQuality(ratio, false);
      const change = windowOf(quality, 0, 50);
      expect(change?.pixelRatio).toBeLessThanOrEqual(ratio);
      expect(change?.aoEnabled).toBe(false);
      expect(windowOf(quality, 3000, 50)).toBeUndefined();
    }
  });
});
