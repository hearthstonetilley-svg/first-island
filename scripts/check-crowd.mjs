// Verify the instanced renderer at the full default population cap in both modes.
import assert from 'node:assert/strict';
import { access,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
const {values}=parseArgs({options:{step:{type:'string'}}});
if(!/^\d{3}$/.test(values.step??''))throw new Error('Use --step NNN');
const prefix=`docs/iterations/${values.step}`;
for(const suffix of ['auto-crowd-seed-42.png','webgl2-crowd-seed-42.png','crowd-follow-seed-42.png','crowd.json'])if(await access(`${prefix}-${suffix}`).then(()=>true,()=>false))throw new Error('Refusing to overwrite evidence');
const server=await preview({preview:{port:4185,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});
const results=[];
try{
 for(const mode of ['auto','webgl2']){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://localhost:4185/?seed=42&debug=1&startingPopulation=200${mode==='webgl2'?'&renderer=webgl2':''}`);
  await page.waitForFunction(()=>['complete','limited','error'].includes(document.querySelector('.loading-screen')?.dataset.state),{},{timeout:30000});
  assert.notEqual(await page.locator('.loading-screen').getAttribute('data-state'),'error');
  if(await page.locator('.loading-screen').getAttribute('data-state')==='limited')await page.locator('.loading-action').click();
  await page.waitForFunction(()=>!document.querySelector('.loading-screen'));
  await page.locator('[data-speed="0"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-speed="0"]').getAttribute('aria-pressed')==='true');
  const evidence=await page.evaluate(()=>({scene:window.__ISLAND_DEBUG__.scene,positions:window.__ISLAND_AGENTS__.positions,population:document.querySelector('.sim-population').textContent,rendered:Number(document.querySelector('.simulation-hud').dataset.renderedAgents),fps:document.querySelector('.fps').textContent}));
  assert.equal(evidence.rendered,200);assert.equal(evidence.positions.length,200);
  assert.equal(evidence.scene.agentDrawMeshes,5);assert.equal(evidence.scene.initialAgentInstances,200);assert.equal(evidence.scene.treeDrawMeshes,18);
  await page.screenshot({path:`${prefix}-${mode}-crowd-seed-42.png`});
  if(mode==='webgl2'){
   await page.locator('.agent-chooser').selectOption('2');await page.locator('.agent-follow').click();await page.waitForTimeout(2500);
   await page.screenshot({path:`${prefix}-crowd-follow-seed-42.png`});
  }
  assert.equal(errors.length,0,errors.join('\n'));results.push({mode,...evidence,errors});
  console.log(`PASS ${mode}: 200 figures, five shared agent meshes, tree count unchanged`);
  await page.close();
 }
 await writeFile(`${prefix}-crowd.json`,JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
