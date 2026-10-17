import { describe, expect, it } from 'vitest';
import { generateWorld, parseSeed, sampleHeight, sampleSlope, SEA_LEVEL } from '../src/world/generate';

describe('seeded world generation', () => {
  it('is identical for the same seed, including trees', () => {
    const first = generateWorld(1234, 32);
    const second = generateWorld(1234, 32);
    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
    expect(first.trees).toEqual(second.trees);
  });

  it('keeps seed zero distinct from seed one', () => {
    expect(Array.from(generateWorld(0, 32).heights)).not.toEqual(Array.from(generateWorld(1, 32).heights));
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

describe('review 3 terrain and vegetation regressions', () => {
  const worlds = [1, 42, 7, 99].map((seed) => generateWorld(seed));

  it('gives seeds 1, 42 and 7 land masks with at least 25% difference per pair', () => {
    for (let a = 0; a < 3; a += 1) {
      for (let b = a + 1; b < 3; b += 1) {
        let union = 0;
        let difference = 0;
        for (let i = 0; i < worlds[a].heights.length; i += 1) {
          const landA = worlds[a].heights[i] > SEA_LEVEL;
          const landB = worlds[b].heights[i] > SEA_LEVEL;
          if (landA || landB) union += 1;
          if (landA !== landB) difference += 1;
        }
        expect(difference / union, `seeds ${worlds[a].seed} and ${worlds[b].seed}`).toBeGreaterThanOrEqual(0.25);
      }
    }
  });

  it('has high relief, lowlands, submerged margins and natural groves for every reference seed', () => {
    for (const world of worlds) {
      expect(Math.max(...world.heights)).toBeGreaterThan(7);
      expect(world.heights.some((height) => height > 0.4 && height < 1.2)).toBe(true);
      for (let i = 0; i < world.resolution; i += 1) {
        expect(world.heights[i]).toBeLessThan(-10);
        expect(world.heights[(world.resolution - 1) * world.resolution + i]).toBeLessThan(-10);
        expect(world.heights[i * world.resolution]).toBeLessThan(-10);
        expect(world.heights[i * world.resolution + world.resolution - 1]).toBeLessThan(-10);
      }
      expect(world.trees.length).toBeGreaterThan(40);
      expect(world.trees.filter((tree) => tree.kind === 'palm').length).toBeLessThan(world.trees.length * 0.4);
      for (const tree of world.trees) {
        expect(tree.y).toBeCloseTo(sampleHeight(world, tree.x, tree.z), 6);
        expect(tree.y).toBeGreaterThan(0.24);
        expect(tree.y).toBeLessThan(5.4);
        expect(sampleSlope(world, tree.x, tree.z)).toBeLessThan(1.6);
        expect(tree.scale).toBeLessThan(0.55);
        if (tree.kind === 'palm') expect(tree.y).toBeLessThan(0.65);
        if (tree.kind === 'pine') expect(tree.y).toBeGreaterThan(2.6);
      }
    }
  });
});
