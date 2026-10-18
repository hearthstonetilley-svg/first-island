import { describe, expect, it } from 'vitest';
import { evaluateCost, evaluateDeterminism, evaluateViability } from '../src/sim/evaluate';
describe('Brief 3d simulation evals',()=>{
 it('has identical SHA-256 event logs across batching/replay, different seeds, and exact continued replay',async()=>{
  const result=await evaluateDeterminism();expect(result.passed).toBe(true);
 });
 it('survives three generations on at least four of five seeds without exceeding the cap',async()=>{
  const result=await evaluateViability();
  console.info('viability',JSON.stringify(result.results.map(({seed,population,births,deaths,deathsByCause,maxPopulation})=>({seed,population,births,deaths,deathsByCause,maxPopulation}))));
  expect(result.passed).toBe(true);expect(result.survived).toBeGreaterThanOrEqual(4);
 });
 it('runs all 200 bodies for 10,000 ticks within the stated budget',()=>{
  const result=evaluateCost();console.info('simulation cost',JSON.stringify(result));
  expect(result.passed).toBe(true);expect(result.finalPopulation).toBe(200);
 },10000);
});
