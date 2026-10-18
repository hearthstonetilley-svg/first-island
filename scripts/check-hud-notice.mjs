// Verify recovery notices clear the measured HUD height on desktop and narrow views.
import assert from 'node:assert/strict';
import { access,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
const {values}=parseArgs({options:{step:{type:'string'}}});
if(!/^\d{3}$/.test(values.step??''))throw new Error('Use --step NNN');
const prefix=`docs/iterations/${values.step}`;
const cases=[{seed:1,mode:'auto',width:1280,height:800},{seed:7,mode:'auto',width:1280,height:800},{seed:42,mode:'auto-mobile',width:390,height:844},{seed:42,mode:'webgl2',width:1280,height:800}];
for(const c of cases)if(await access(`${prefix}-${c.mode}-seed-${c.seed}.png`).then(()=>true,()=>false))throw new Error('Refusing to overwrite evidence');
const server=await preview({preview:{port:4186,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});
const results=[];
try{
 for(const c of cases){
  const page=await browser.newPage({viewport:{width:c.width,height:c.height}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://localhost:4186/?seed=${c.seed}${c.mode==='webgl2'?'&renderer=webgl2':''}`);
  await page.waitForFunction(()=>['complete','limited','error'].includes(document.querySelector('.loading-screen')?.dataset.state),{},{timeout:30000});
  assert.notEqual(await page.locator('.loading-screen').getAttribute('data-state'),'error');
  if(await page.locator('.loading-screen').getAttribute('data-state')==='limited')await page.locator('.loading-action').click();
  await page.waitForFunction(()=>!document.querySelector('.loading-screen'));
  const evidence=await page.evaluate(()=>{
   const hud=document.querySelector('.simulation-hud'),notice=document.querySelector('.graphics-notice'),h=hud.getBoundingClientRect(),n=notice.getBoundingClientRect();
   return {hud:{top:h.top,bottom:h.bottom,height:h.height},notice:{top:n.top,bottom:n.bottom,height:n.height,hidden:notice.hidden},gap:h.top-n.bottom,
    pointerEvents:getComputedStyle(notice).pointerEvents,rendered:Number(hud.dataset.renderedAgents),label:document.querySelector('.label').textContent};
  });
  assert(evidence.rendered>=20);assert.equal(evidence.pointerEvents,'none');
  if(c.mode!=='webgl2'){assert.equal(evidence.notice.hidden,false,'Capture the actual native-loss recovery notice');assert(evidence.gap>=10,JSON.stringify(evidence));}
  else assert.equal(evidence.notice.hidden,true);
  await page.screenshot({path:`${prefix}-${c.mode}-seed-${c.seed}.png`});
  await page.locator('[data-speed="0"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-speed="0"]').getAttribute('aria-pressed')==='true');
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({...c,...evidence,pauseClickable:true,errors});console.log(`PASS ${c.mode} seed ${c.seed}: gap ${evidence.gap.toFixed(0)} px`);
  await page.close();
 }
 await writeFile(`${prefix}-notice.json`,JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
