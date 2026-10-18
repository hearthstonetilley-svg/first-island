// Focused browser regression: native startup loss recovers, and a deliberately
// lost WebGL2 context clears the backend/FPS claim. Run after npm run build.
import { chromium } from 'playwright';
import { preview } from 'vite';
import { writeFile, access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { step: { type: 'string' } } });
if (!/^\d{3}$/.test(values.step ?? '')) throw new Error('Use --step NNN');
const prefix = `docs/iterations/${values.step}`;
for (const suffix of ['recovered-notice-seed-42.png', 'webgl2-lost-seed-42.png', 'focused-device.json']) {
  if (await access(`${prefix}-${suffix}`).then(() => true, () => false)) throw new Error('Refusing to overwrite earlier device-check evidence');
}
const server=await preview({preview:{port:4180,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
 window.__lossEvents=[];
 const original=GPUAdapter.prototype.requestDevice;
 GPUAdapter.prototype.requestDevice=async function(...args){
  const device=await original.apply(this,args);
  device.lost.then(info=>window.__lossEvents.push({reason:info.reason,message:info.message}));
  return device;
 };
});
try {
 await page.goto('http://localhost:4180/?seed=42&debug=1');
 await page.waitForFunction(()=>['limited','complete','error'].includes(document.querySelector('.loading-screen')?.dataset.state),{},{timeout:30000});
 const loader=await page.locator('.loading-screen').getAttribute('data-state');
 if(loader==='error')throw new Error('Recovery failed');
 if(loader==='limited')await page.locator('.loading-action').click();
 await page.waitForTimeout(1600);
 const recovered=await page.evaluate(()=>({label:document.querySelector('.label').textContent,fps:document.querySelector('.fps').textContent,
  notice:document.querySelector('.graphics-notice').textContent,canvasCount:document.querySelectorAll('#app > canvas').length,
  navigationCount:performance.getEntriesByType('navigation').length,lossEvents:window.__lossEvents,scene:window.__ISLAND_DEBUG__.scene,
  generationStarts:window.__ISLAND_DEBUG__.loading.stages.filter(s=>s.message==='Generating terrain'&&s.percent===1).length}));
 if(!recovered.label.includes('WebGL2')||recovered.canvasCount!==1||recovered.navigationCount!==1||recovered.generationStarts!==1||errors.length)throw new Error(JSON.stringify({recovered,errors}));
 await page.screenshot({path:`${prefix}-recovered-notice-seed-42.png`});
 await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
 await page.waitForFunction(()=>document.querySelector('.loading-screen')?.dataset.state==='error');
 const stopped=await page.evaluate(()=>({label:document.querySelector('.label').textContent,fps:document.querySelector('.fps').textContent,
  state:document.querySelector('.loading-screen').dataset.state}));
 if(stopped.fps!=='renderer unavailable'||/· WebGPU$|· WebGL2$/.test(stopped.label))throw new Error('Stale renderer claim: '+JSON.stringify(stopped));
 await page.screenshot({path:`${prefix}-webgl2-lost-seed-42.png`});
 await writeFile(`${prefix}-focused-device.json`,JSON.stringify({recovered,stopped,errors},null,2)+'\n');
 console.log(JSON.stringify({recovered,stopped,errors},null,2));
} finally {await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
