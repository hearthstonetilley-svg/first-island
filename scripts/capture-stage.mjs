// Iteration evidence using the project's installed build-eval browser workflow.
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
const { values } = parseArgs({ options: { step: { type: 'string' }, stage: { type: 'string', default: 'core' } } });
if (!/^\d{3}$/.test(values.step ?? '')) throw new Error('Use --step NNN');
const prefix=`docs/iterations/${values.step}`;
const cases=[{seed:1,mode:'auto'},{seed:7,mode:'auto'},{seed:42,mode:'auto'},{seed:42,mode:'webgl2'}];
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
  await page.waitForTimeout(2200);
  await page.locator('[data-speed="0"]').click();
  const before=await exportRun();await page.waitForTimeout(1200);const paused=await exportRun();
  assert.equal(paused.ticks,before.ticks,'Pause must stop simulation ticks');
  assert(paused.ticks>=100,'100x must advance independently of render FPS');
  assert(paused.events.some(e=>e.type==='intervention'&&e.data.speed===100));
  assert(paused.events.some(e=>e.type==='intervention'&&e.data.speed===0));
  await page.screenshot({path:`${prefix}-${item.mode}-seed-${item.seed}.png`});
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({...item,ticks:paused.ticks,eventCount:paused.events.length,events:paused.events,errors,stage:values.stage});
  console.log(`PASS ${item.mode} seed ${item.seed}: paused at tick ${paused.ticks}`);
  await page.close();
 }
 await writeFile(`${prefix}-browser.json`,JSON.stringify(results,null,2)+'\n');
} finally {await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
