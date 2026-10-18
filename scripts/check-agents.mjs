import assert from 'node:assert/strict';
import { access,readFile,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
const {values}=parseArgs({options:{step:{type:'string'}}});
if(!/^\d{3}$/.test(values.step??''))throw new Error('Use --step NNN');
const prefix=`docs/iterations/${values.step}`;
for(const suffix of ['inspect-seed-42.png','follow-seed-42.png','dials-seed-42.png','mobile-seed-42.png','agents.json'])if(await access(`${prefix}-${suffix}`).then(()=>true,()=>false))throw new Error('Refusing to overwrite evidence');
const server=await preview({preview:{port:4184,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://localhost:4184/?seed=42&renderer=webgl2&debug=1');
 await page.waitForFunction(()=>['complete','limited','error'].includes(document.querySelector('.loading-screen')?.dataset.state),{},{timeout:30000});
 assert.notEqual(await page.locator('.loading-screen').getAttribute('data-state'),'error');
 if(await page.locator('.loading-screen').getAttribute('data-state')==='limited')await page.locator('.loading-action').click();
 await page.waitForFunction(()=>!document.querySelector('.loading-screen'));
 await page.locator('[data-speed="0"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-speed="0"]').getAttribute('aria-pressed')==='true');
 const exportRun=async()=>{const pending=page.waitForEvent('download');await page.locator('.sim-export').click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
 const before=await exportRun();
 const positions=await page.evaluate(()=>window.__ISLAND_AGENTS__.positions);
 assert(positions.length>=20,'Instanced figures must be present');
 let picked;
 for(const position of positions.filter(p=>p.visible&&p.y>70&&p.y<690)){
  await page.mouse.click(position.x,position.y);
  if(await page.locator('.agent-panel').isVisible()){picked=await page.locator('.agent-panel h2').textContent();break;}
 }
 assert(picked,'A visible figure must be pickable on the canvas');
 assert.equal(await page.locator('.agent-traits dt').count(),7);
 assert.equal(await page.locator('.agent-needs meter').count(),4);
 await page.screenshot({path:`${prefix}-inspect-seed-42.png`});
 await page.locator('.agent-follow').click();
 await page.waitForFunction(()=>document.querySelector('.agent-follow')?.getAttribute('aria-pressed')==='true');
 await page.waitForTimeout(2500);
 await page.screenshot({path:`${prefix}-follow-seed-42.png`});
 const after=await exportRun();assert.deepEqual(after,before,'Picking/following cannot change the simulation');
 await page.locator('.agent-overview').click();
 await page.locator('.agent-close').click();
 await page.locator('.sim-dials summary').click();
 await page.locator('input[name="foodRegrowth"]').fill('1.2');
 await page.locator('input[name="mutationRate"]').fill('0.02');
 await page.locator('.sim-dials button[type="submit"]').click();
 const changed=await exportRun();
 assert(changed.events.some(e=>e.type==='intervention'&&e.data.dials?.foodRegrowth===1.2&&e.data.dials?.mutationRate===0.02));
 await page.screenshot({path:`${prefix}-dials-seed-42.png`});
 await page.locator('.sim-dials summary').click();
 await page.setViewportSize({width:390,height:844});
 await page.locator('.agent-chooser').selectOption('1');
 await page.screenshot({path:`${prefix}-mobile-seed-42.png`});
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(`${prefix}-agents.json`,JSON.stringify({picked,positions,before,after,changed,errors},null,2)+'\n');
 console.log(JSON.stringify({picked,figures:positions.length,ticks:before.ticks,followPreservesState:true,dialIntervention:true,errors}));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
