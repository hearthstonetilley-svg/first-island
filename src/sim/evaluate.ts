import { Simulation, replay } from './core';
import { DEFAULT_DIALS, SimEvent } from './types';

export async function eventLogHash(events: readonly SimEvent[]): Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(events));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function evaluateDeterminism(){
  const run=(seed:number,batch:number)=>{
    const simulation=new Simulation(seed);
    for(let ticks=0;ticks<1200;ticks+=batch)simulation.step(Math.min(batch,1200-ticks));
    simulation.intervene({dials:{mutationRate:0.06}});simulation.intervene({speed:100});
    for(let ticks=1200;ticks<6000;ticks+=batch)simulation.step(Math.min(batch,6000-ticks));
    return simulation;
  };
  const a=run(42,1),b=run(42,37),different=run(7,1),restored=replay(a.record());
  const [firstHash,repeatHash,differentSeedHash,replayedHash]=await Promise.all([
    eventLogHash(a.record().events),eventLogHash(b.record().events),eventLogHash(different.record().events),eventLogHash(restored.record().events),
  ]);
  const sameSnapshot=JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot())&&JSON.stringify(a.snapshot())===JSON.stringify(restored.snapshot());
  a.step(500);restored.step(500);
  const continuation=JSON.stringify(a.record())===JSON.stringify(restored.record())&&JSON.stringify(a.snapshot())===JSON.stringify(restored.snapshot());
  return {passed:firstHash===repeatHash&&firstHash===replayedHash&&firstHash!==differentSeedHash&&sameSnapshot&&continuation,
    seed:42,differentSeed:7,ticks:6000,firstHash,repeatHash,differentSeedHash,replayedHash,continuation};
}

export async function evaluateViability(){
  const results=[];
  for(const seed of [1,7,42,99,2026]){
    const simulation=new Simulation(seed);
    const samples=[{tick:0,...simulation.snapshot().stats}];
    for(let ticks=300;ticks<=5400;ticks+=300){simulation.step(300);samples.push({tick:ticks,...simulation.snapshot().stats});}
    const record=simulation.record();let live=0,maxPopulation=0,capHeld=true;
    for(const event of record.events){
      if(event.type==='birth')live++;
      if(event.type==='death')live--;
      maxPopulation=Math.max(maxPopulation,live);
      if(live<0||live>DEFAULT_DIALS.populationCap)capHeld=false;
    }
    const stats=simulation.snapshot().stats;
    results.push({seed,ticks:5400,generationsElapsed:3,survived:stats.population>=2,capHeld,maxPopulation,
      ...stats,offspring:stats.births-DEFAULT_DIALS.startingPopulation,eventHash:await eventLogHash(record.events),samples});
  }
  const survived=results.filter(result=>result.survived).length;
  return {passed:survived>=4&&results.every(result=>result.capHeld),requiredSurvivors:4,survived,seeds:5,dials:{...DEFAULT_DIALS},results};
}

export const SIMULATION_COST_BUDGET_MS=5000;
export function evaluateCost(){
  // A long generation keeps the full 200 bodies alive throughout the benchmark;
  // it cannot become artificially cheap by killing the population halfway through.
  const dials={...DEFAULT_DIALS,startingPopulation:200,populationCap:200,generationSeconds:86400};
  const start=performance.now();
  const simulation=new Simulation(42,dials);
  const initialized=performance.now();
  simulation.step(10000);
  const end=performance.now();
  const stats=simulation.snapshot().stats;
  return {passed:end-start<=SIMULATION_COST_BUDGET_MS&&stats.population===200&&stats.deaths===0,
    agents:200,ticks:10000,dials,budgetMs:SIMULATION_COST_BUDGET_MS,
    initializationMs:initialized-start,stepMs:end-initialized,totalMs:end-start,finalPopulation:stats.population,deaths:stats.deaths};
}
