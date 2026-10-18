import { expect, it } from 'vitest';
import { generateWorld, generateWorldAsync } from '../src/world/generate';

it('preserves pre-loading-screen world fingerprints while yielding real progress', async () => {
  const expected = new Map([
    [1, '0208203fea02a99a8adc0e8ee68caef52ea633849c0c88ed3d26f519356f15a3'],
    [42, '53f211aa97d2709499ba017942a9a0876e8ab9748d205d4ee8f4c90347d479ec'],
    [2026, '7408f234ddb6382d4a98b6ecbfc3983cbd7fed9a712d9397d834b1afb7352fec'],
  ]);
  for (const [seed, hash] of expected) {
    const stages: Array<{stage:string;fraction:number}> = [];
    const world = await generateWorldAsync(seed, 256, 64, async (step) => { stages.push(step); });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(world)));
    expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(hash);
    expect(world).toEqual(generateWorld(seed));
    const firstTree = stages.findIndex((step) => step.stage === 'trees');
    expect(stages[firstTree - 1]).toEqual({stage:'terrain',fraction:1});
    expect(stages.at(-1)).toEqual({stage:'trees',fraction:1});
    expect(stages.filter((step) => step.stage === 'terrain').length).toBeGreaterThan(5);
    expect(stages.filter((step) => step.stage === 'trees').length).toBeGreaterThan(5);
  }
});
