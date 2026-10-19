import { describe, expect, it } from 'vitest';
import { lightingAt } from '../src/render/daycycle';

// The day cycle (decision 58), swept finely: the browser eval can only sample a few phases.
const daylight = (phase: number) => 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
const sweep = (step = 0.0005) => Array.from({ length: Math.round(1 / step) }, (_, i) => i * step);
const luminance = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('day cycle lighting', () => {
  it('never snaps: the light changes smoothly through dusk and dawn, sun to moon', () => {
    for (const storm of [false, true]) {
      let prev = lightingAt(0, daylight(0), storm);
      for (const phase of sweep().slice(1)) {
        const now = lightingAt(phase, daylight(phase), storm);
        // The shadow a light casts moves only as fast as its strength allows: any change of side happens in the dark.
        const turn = prev.light.dir.angleTo(now.light.dir);
        expect(turn * Math.min(prev.light.intensity, now.light.intensity), `turn at phase ${phase}`).toBeLessThan(0.05);
        expect(Math.abs(now.light.intensity - prev.light.intensity), `intensity jump at phase ${phase}`).toBeLessThan(0.05);
        prev = now;
      }
    }
  });
  it('a storm never brightens the sky or the ocean', () => {
    for (const phase of sweep(0.01)) {
      const calm = lightingAt(phase, daylight(phase), false), storm = lightingAt(phase, daylight(phase), true);
      for (const k of ['water', 'zenith', 'horizon'] as const)
        expect(luminance(storm.colours[k]), `${k} at phase ${phase}`).toBeLessThanOrEqual(luminance(calm.colours[k]) + 1e-6);
    }
  });
  it('the sun is up by day and the moon lights the night', () => {
    expect(lightingAt(0, 1, false).light.byDay).toBe(true);
    expect(lightingAt(0.5, 0, false).light.byDay).toBe(false);
    expect(lightingAt(0.5, 0, false).light.intensity).toBeGreaterThan(0.3);
    expect(lightingAt(0.5, 0, false).night).toBeGreaterThan(0.9);
  });
});
