import { describe, expect, it } from 'vitest';
import { generateWorld, parseSeed, SEA_LEVEL } from '../src/world/generate';

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

  it('uses seed 1 when the URL seed is missing or empty', () => {
    expect(parseSeed(null)).toBe(1);
    expect(parseSeed('')).toBe(1);
    expect(parseSeed('   ')).toBe(1);
    expect(parseSeed('5')).toBe(5);
  });

  it('has land above sea, sea below land, and an underwater border', () => {
    const world = generateWorld(1, 32);
    const edgeValues: number[] = [];
    for (let row = 0; row < world.resolution; row += 1) {
      for (let column = 0; column < world.resolution; column += 1) {
        if (row === 0 || column === 0 || row === world.resolution - 1 || column === world.resolution - 1) {
          edgeValues.push(world.heights[row * world.resolution + column]);
        }
      }
    }
    expect(world.heights.some((height) => height < SEA_LEVEL)).toBe(true);
    expect(world.heights.some((height) => height > SEA_LEVEL)).toBe(true);
    expect(edgeValues.every((height) => height < SEA_LEVEL)).toBe(true);
  });
});
