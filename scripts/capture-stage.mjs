// Iteration evidence using the project's installed build-eval browser workflow.
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
const exec = promisify(execFile);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const { values } = parseArgs({ options: { step: { type: 'string' }, stage: { type: 'string', default: 'core' }, close: {type:'boolean',default:false} } });
if (!/^\d{3}$/.test(values.step ?? '')) throw new Error('Use --step NNN');
const prefix=`docs/iterations/${values.step}${values.close?'-food-close':''}`;
const cases=values.close?[{seed:42,mode:'webgl2'}]:[{seed:1,mode:'auto'},{seed:7,mode:'auto'},{seed:42,mode:'auto'},{seed:42,mode:'webgl2'}];
for(const item of cases) if(await access(`${prefix}-${item.mode}-seed-${item.seed}.png`).then(()=>true,()=>false)) throw new Error('Refusing to overwrite captures');
const server=await preview({preview:{port:4183,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});
const results=[];
try {
 for(const item of cases){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://localhost:4183/?seed=${item.seed}${item.mode==='webgl2'?'&renderer=webgl2':''}`);
  await page.waitForFunction(()=>['complete','limited','error'].includes(document.querySelector('.loading-screen')?.dataset.state),{},{timeout:30000});
  assert.notEqual(await page.locator('.loading-screen').getAttribute('data-state'),'error');
  if(await page.locator('.loading-screen').getAttribute('data-state')==='limited')await page.locator('.loading-action').click();
  await page.waitForFunction(()=>!document.querySelector('.loading-screen'));
  const exportRun=async()=>{
   const download=page.waitForEvent('download');await page.locator('.sim-export').click();
   return JSON.parse(await readFile(await(await download).path(),'utf8'));
  };
  await page.locator('[data-speed="100"]').click();
  await page.waitForTimeout(values.close?14500:6200);
  await page.locator('[data-speed="0"]').click();
  const before=await exportRun();await page.waitForTimeout(1200);const paused=await exportRun();
  assert.equal(paused.ticks,before.ticks,'Pause must stop simulation ticks');
  assert(paused.ticks>=100,'100x must advance independently of render FPS');
  assert(!paused.events.some(e=>e.type==='intervention'&&'speed' in e.data),'Playback must not be logged');
  assert.deepEqual(paused,before,'Pause/export must leave the entire world record unchanged');
  // Apply a real renderer-originated world change while paused, then replay its export in Node.
  await page.locator('.sim-dials summary').click();
  await page.locator('input[name="foodRegrowth"]').fill('0.4');
  await page.locator('.sim-dials button[type="submit"]').click();
  const changed = await exportRun();
  assert.equal(changed.ticks, paused.ticks);
  assert.equal(changed.events.length, paused.events.length + 1);
  assert.deepEqual(changed.events.at(-1), {seq:paused.events.length,tick:paused.ticks,type:'intervention',data:{dials:{
    generationSeconds:paused.finalState.dials.generationSeconds,foodRegrowth:0.4,mutationRate:paused.finalState.dials.mutationRate}}});
  await page.locator('.sim-dials summary').click();
  const eatenTreeFoods = changed.finalState.bodies.plants.filter(plant=>plant.tree&&plant.quantity<plant.capacity).length;
  assert(eatenTreeFoods>0,'Normal agents must consume tree food');
  await mkdir('eval-results',{recursive:true});
  const recordPath=`eval-results/${values.step}${values.close?'-food-close':''}-${item.mode}-seed-${item.seed}-run.json`;
  await writeFile(recordPath,JSON.stringify(changed));
  const {stdout}=await exec(process.execPath,['scripts/sim-process.mjs','--replay',recordPath],{maxBuffer:1024*1024});
  const replay=JSON.parse(stdout);
  assert.equal(replay.stateHash,hash(changed.finalState));
  assert.equal(replay.eventHash,hash(changed.events));
  assert(Number(await page.locator('.simulation-hud').getAttribute('data-rendered-agents'))>0);
  let followedAgent;
  if(values.close){
   const bodies=changed.finalState.bodies;
   const food=bodies.plants.filter(plant=>plant.tree).sort((a,b)=>a.quantity/a.capacity-b.quantity/b.capacity)[0];
   const births=new Map(changed.events.filter(event=>event.type==='birth').map(event=>[event.data.id,event.data]));
   const grandchildren=bodies.agents.filter(agent=>agent.parents.some(parent=>births.get(parent).parents.some(grandparent=>births.get(grandparent).parents.length===0)));
   assert(grandchildren.length>0,'Close capture must show a real child of a child of a founder');
   const agent=[...grandchildren].sort((a,b)=>Math.hypot(a.x-food.x,a.z-food.z)-Math.hypot(b.x-food.x,b.z-food.z))[0];
   followedAgent={id:agent.id,parents:agent.parents,biologicalAge:agent.biologicalAge};
   await page.locator('.agent-chooser').selectOption(String(agent.id));
   await page.locator('.agent-follow').click();
   await page.waitForTimeout(2000);
   assert.deepEqual(await exportRun(),changed,'Following a grandchild must preserve the world');
  }
  await page.screenshot({path:`${prefix}-${item.mode}-seed-${item.seed}.png`});
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({...item,version:changed.version,initialDials:changed.initialDials,ticks:paused.ticks,pausedEventCount:paused.events.length,eventCount:changed.events.length,events:changed.events,eatenTreeFoods,renderedAgents:Number(await page.locator('.simulation-hud').getAttribute('data-rendered-agents')),stateHash:hash(changed.finalState),replay,followedAgent,errors,stage:values.stage});
  console.log(`PASS ${item.mode} seed ${item.seed}: paused at tick ${paused.ticks}`);
  await page.close();
 }
 await writeFile(`${prefix}-browser.json`,JSON.stringify(results,null,2)+'\n');
} finally {await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
