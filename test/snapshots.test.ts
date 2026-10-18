import { describe, expect, it } from 'vitest';
import { SnapshotBuffer } from '../src/render/snapshots';
import { Simulation } from '../src/sim/core';
describe('render snapshot interpolation',()=>{
 it('smooths positions by ID without extrapolating or altering the core snapshot',()=>{
  const a=new Simulation(1).snapshot(),b=structuredClone(a);b.tick=1;b.seconds=1;b.agents.reverse();
  b.agents.forEach(agent=>{agent.x+=2;agent.y+=1;});
  const buffer=new SnapshotBuffer();buffer.receive(a,0);buffer.receive(b,1000);
  const halfway=buffer.sample(1500)[0],current=b.agents[0];
  expect(halfway.x).toBeCloseTo(current.x-1);expect(halfway.y).toBeCloseTo(current.y-0.5);
  expect(buffer.sample(4000)[0].x).toBe(current.x);
  expect(b.agents[0].x).toBe(current.x);
 });
 it('shows new births immediately, removes deaths, and freezes at exact paused positions',()=>{
  const a=new Simulation(7).snapshot(),b=structuredClone(a);b.tick=1;b.speed=0;
  b.agents.splice(0,1);b.agents[0].x+=5;
  const buffer=new SnapshotBuffer();buffer.receive(a,0);buffer.receive(b,10);
  expect(buffer.sample(10)).toEqual(b.agents);
  expect(buffer.sample(5000)).toEqual(b.agents);
 });
});
