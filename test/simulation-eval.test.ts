import { describe, expect, it } from 'vitest';
import { assessViability, evaluateCost } from '../src/sim/evaluate';
describe('Biological lineage viability and simulation cost',()=>{
 it('requires a real grandchild birth and final survivors, irrespective of clock or claimed generation',()=>{
  const birth=(id:number,parents:number[])=>({seq:id,tick:id*100,type:'birth' as const,data:{id,parents,generation:999}});
  const founders=[birth(1,[]),birth(2,[])];
  const clock={seq:2,tick:21600,type:'generation' as const,data:{generation:100}};
  expect(assessViability([...founders,clock],20).viable).toBe(false);
  const child=birth(3,[1,2]),grandchild=birth(4,[1,3]);
  expect(assessViability([...founders,child],3).viable).toBe(false);
  const lineage=[...founders,child,grandchild];
  expect(assessViability(lineage,1).viable).toBe(true);
  expect(assessViability(lineage,0).viable).toBe(false);
  expect(assessViability(lineage,1).firstThirdGenerationBirth).toEqual({id:4,tick:400,parents:[1,3]});
  expect(()=>assessViability([grandchild],1)).toThrow('Invalid birth ancestry');
 });
 it('runs all 200 bodies for 10,000 ticks within the stated budget',()=>{
  const result=evaluateCost();console.info('simulation cost',JSON.stringify(result));
  expect(result.passed).toBe(true);expect(result.finalPopulation).toBe(200);
 },10000);
});
