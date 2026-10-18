import { expect, it } from 'vitest';
import { Simulation } from '../src/sim/core';
import { Bodies } from '../src/sim/bodies';
import { generateWorld } from '../src/world/generate';
import { DEFAULT_DIALS, SimEvent } from '../src/sim/types';
it('observes reproduction failures without advancing or changing a run', () => {
  const a=new Simulation(42), b=new Simulation(42);
  for(let i=0;i<6;i++){a.step(300);a.reproductionDiagnostics();b.step(300);}
  expect(a.record()).toEqual(b.record());
  const stats=a.reproductionDiagnostics();
  for(const failed of Object.values(stats.failures)) expect(failed).toBeGreaterThanOrEqual(0);
  expect(stats.readyWithPartner).toBeLessThanOrEqual(stats.readySelf);
  expect(stats.population).toBe(a.snapshot().stats.population);
});


it('restores energy and rest before their reproductive readiness gates are crossed', () => {
  const bodies=new Bodies(generateWorld(42),{...DEFAULT_DIALS,startingPopulation:1},()=>{});
  const a=bodies.agents[0];
  a.rest=49;a.energy=95;a.decision=0;a.activity='wandering';
  bodies.step({...DEFAULT_DIALS},1);
  expect(a.activity).toBe('resting');
  const food=bodies.plants[0];
  Object.assign(a,{x:food.x,y:food.y,z:food.z,node:bodies.ground.nearest(food.x,food.z),
    energy:74,rest:95,activity:'wandering',decision:0,path:[]});
  const stock=food.quantity;
  bodies.step({...DEFAULT_DIALS},2);
  expect(a.energy).toBeGreaterThan(74);
  expect(food.quantity).toBeLessThan(stock);
});

it('lets healthy adults meet and reproduce even with ordinary sociability disabled', () => {
  const events:SimEvent['data'][]=[];
  const bodies=new Bodies(generateWorld(42),{...DEFAULT_DIALS,startingPopulation:2},(type,data)=>{if(type==='reproduction')events.push(data);});
  const first=bodies.ground.habitable[0],origin=bodies.ground.nodes[first];
  const second=bodies.ground.habitable.find(id=>{
    const n=bodies.ground.nodes[id],d=Math.hypot(n.x-origin.x,n.z-origin.z);
    return d>2&&d<3&&bodies.ground.path(first,id).length<8;
  })!;
  expect(second).toBeDefined();
  bodies.agents.forEach((a,index)=>{
    const node=index?second:first,n=bodies.ground.nodes[node];
    Object.assign(a,{x:n.x,y:n.y,z:n.z,node,goal:node,path:[],biologicalAge:0.7,age:1260,decision:0});
    Object.assign(a.traits,{sociability:0,perception:10,curiosity:0.05});
  });
  for(let tick=1;tick<=1000;tick++)bodies.step({...DEFAULT_DIALS},tick);
  expect(events.length).toBeGreaterThan(0);
  for(const event of events){
    for(const age of event.parentBiologicalAges as number[]){expect(age).toBeGreaterThanOrEqual(0.6);expect(age).toBeLessThan(1.6);}
  }
  expect(bodies.agents.every(a=>a.traits.lifespan>=2.5&&a.traits.lifespan<=3)).toBe(true);
});
