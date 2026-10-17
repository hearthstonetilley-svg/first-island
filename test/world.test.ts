import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate';

describe('seeded world generation', () => {
  it('is identical for the same seed, including trees', () => {
    const first = generateWorld(1234, 32);
    const second = generateWorld(1234, 32);
    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
    expect(first.trees).toEqual(second.trees);
  });

  it('changes for a different seed', () => {
    const first = generateWorld(1234, 32);
    const second = generateWorld(1235, 32);
    expect(Array.from(first.heights)).not.toEqual(Array.from(second.heights));
    expect(first.trees).not.toEqual(second.trees);
  });
});
