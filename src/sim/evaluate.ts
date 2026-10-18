import { Simulation } from './core';
import { DEFAULT_DIALS, SimEvent } from './types';

export async function eventLogHash(events: readonly SimEvent[]): Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(events));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Trace parent IDs, never the wall-clock generation milestone or reported generation field. */
export function assessViability(events: readonly SimEvent[], finalPopulation: number) {
  const depths = new Map<number, number>();
  const birthsByDepth: Record<number, number> = {};
  let firstThirdGenerationBirth: { id: number; tick: number; parents: number[] } | null = null;
  for (const event of events) {
    if (event.type !== 'birth') continue;
    const id = event.data.id as number, parents = event.data.parents as number[];
    if (!Number.isSafeInteger(id) || depths.has(id) || !Array.isArray(parents)
      || (parents.length !== 0 && parents.length !== 2) || parents.some(parent => !depths.has(parent))) throw new Error('Invalid birth ancestry');
    const depth = parents.length ? Math.max(...parents.map(parent => depths.get(parent)!)) + 1 : 0;
    depths.set(id, depth); birthsByDepth[depth] = (birthsByDepth[depth] ?? 0) + 1;
    if (depth >= 2 && !firstThirdGenerationBirth) firstThirdGenerationBirth = { id, tick: event.tick, parents: [...parents] };
  }
  return { viable: firstThirdGenerationBirth !== null && finalPopulation > 0, firstThirdGenerationBirth,
    birthsByDepth, maxLineageDepth: depths.size ? Math.max(...depths.values()) : -1 };
}

export const VIABILITY_TICKS = 21600;
export async function evaluateViability(){
  const results=[];
  for(const seed of [1,7,42,99,2026]){
    const simulation=new Simulation(seed);
    const samples=[{tick:0,...simulation.snapshot().stats}];
    for(let ticks=300;ticks<=VIABILITY_TICKS;ticks+=300){simulation.step(300);samples.push({tick:ticks,...simulation.snapshot().stats});}
    const record=simulation.record();let live=0,maxPopulation=0,capHeld=true;
    for(const event of record.events){
      if(event.type==='birth')live++;
      if(event.type==='death')live--;
      maxPopulation=Math.max(maxPopulation,live);
      if(live<0||live>DEFAULT_DIALS.populationCap)capHeld=false;
    }
    const stats=simulation.snapshot().stats;
    const reproduction=record.events.filter(event=>event.type==='reproduction');
    const ages=reproduction.flatMap(event=>event.data.parentAges as number[]);
    results.push({seed,ticks:VIABILITY_TICKS,...assessViability(record.events,stats.population),capHeld,maxPopulation,
      ...stats,offspring:stats.births-DEFAULT_DIALS.startingPopulation,
      meanParentAgeTicks:ages.length?ages.reduce((sum,age)=>sum+age,0)/ages.length:null,
      eventHash:await eventLogHash(record.events),samples});
  }
  const viableSeeds=results.filter(result=>result.viable).length;
  return {passed:viableSeeds>=4&&results.every(result=>result.capHeld),requiredViableSeeds:4,viableSeeds,seeds:5,
    definition:'A child of a child of a founder is born, and final population is above zero. Ancestry is traced from parent IDs; clock generations are ignored.',
    ticks:VIABILITY_TICKS,dials:{...DEFAULT_DIALS},results};
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
