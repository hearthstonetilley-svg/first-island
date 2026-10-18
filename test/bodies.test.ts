import { describe, expect, it } from 'vitest';
import { Simulation, replay } from '../src/sim/core';
import { Bodies } from '../src/sim/bodies';
import { generateWorld, sampleHeight } from '../src/world/generate';
import { DEFAULT_DIALS, DeathCause, SimEvent } from '../src/sim/types';

describe('scripted bodies',()=>{
 it('spawns on ground, keeps needs bounded, and reproduces inherited bodies deterministically',()=>{
  const sim=new Simulation(42);
  sim.step(5400);
  const state=sim.snapshot();
  console.info('body baseline',JSON.stringify({seed:42,...state.stats}));
  expect(state.stats.births).toBeGreaterThan(20);
  expect(state.stats.population).toBeGreaterThan(0);
  expect(state.stats.population).toBe(state.stats.births-state.stats.deaths);
  for(const a of state.agents){
   expect(sampleHeight(sim.world,a.x,a.z)).toBeGreaterThan(0.15);
   for(const need of [a.energy,a.warmth,a.rest,a.health])expect(need).toBeGreaterThanOrEqual(0);
   expect(a.health).toBeLessThanOrEqual(100);
   expect(a.y).toBeCloseTo(sampleHeight(sim.world,a.x,a.z));
  }
  expect(replay(sim.record()).snapshot()).toEqual(state);
 });
 it('records every physiological cause, with no silent removal',()=>{
  for(const cause of ['starvation','exposure','old age','exhaustion'] as DeathCause[]){
   const events:SimEvent['data'][]=[];
   const bodies=new Bodies(generateWorld(1),{...DEFAULT_DIALS,startingPopulation:1},(type,data)=>{if(type==='death')events.push(data);});
   const a=bodies.agents[0];a.health=0.01;
   if(cause==='starvation')a.energy=0;
   if(cause==='exposure'){a.warmth=0;bodies.environment.rain=1;}
   if(cause==='old age')a.biologicalAge=a.traits.lifespan+1;
   if(cause==='exhaustion')a.rest=0;
   bodies.step({...DEFAULT_DIALS},cause==='exposure'?900:1);
   expect(events).toEqual([expect.objectContaining({id:a.id,cause})]);
   expect(bodies.stats.population).toBe(0);expect(bodies.agents).toHaveLength(0);
  }
 });
 it('inherits exact parental means with mutation disabled and enforces the population cap',()=>{
  const sim=new Simulation(7,{mutationRate:0,populationCap:25});sim.step(6000);
  const births=sim.record().events.filter(e=>e.type==='birth');
  expect(births.length).toBeGreaterThan(20);
  const traits=new Map(births.map(e=>[e.data.id,e.data.traits as Record<string,number>]));
  for(const event of births){
   const parents=event.data.parents as number[];if(!parents.length)continue;
   const child=event.data.traits as Record<string,number>;
   for(const key of Object.keys(child))expect(child[key]).toBeCloseTo((traits.get(parents[0])![key]+traits.get(parents[1])![key])/2,12);
  }
  expect(sim.snapshot().stats.population).toBeLessThanOrEqual(25);
 });
});
