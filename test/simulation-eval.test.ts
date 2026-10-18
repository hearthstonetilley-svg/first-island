import { describe, expect, it } from 'vitest';
import { evaluateCost, evaluateViability } from '../src/sim/evaluate';
describe('Bounded body observations (Round 12 long-run viability is still pending)',()=>{
 it('observes the original three-generation window without exceeding the cap',async()=>{
  const result=await evaluateViability();
  console.info('viability',JSON.stringify(result.results.map(({seed,population,births,deaths,deathsByCause,maxPopulation})=>({seed,population,births,deaths,deathsByCause,maxPopulation}))));
  expect(result.passed).toBe(true);expect(result.survived).toBeGreaterThanOrEqual(4);
 });
 it('runs all 200 bodies for 10,000 ticks within the stated budget',()=>{
  const result=evaluateCost();console.info('simulation cost',JSON.stringify(result));
  expect(result.passed).toBe(true);expect(result.finalPopulation).toBe(200);
 },10000);
});
