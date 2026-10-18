// Diagnose browser WebGPU loss without loading Three.js, then compare the built app.
// Run npm run build first. Uses the same installed Chromium and flags as npm run eval.
import { chromium } from 'playwright';
import { preview } from 'vite';
import { writeFile, access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { step: { type: 'string' } } });
if (!/^\d{3}$/.test(values.step ?? '')) throw new Error('Use --step NNN');
const output = `docs/iterations/${values.step}-device-probe.json`;
if (await access(output).then(() => true, () => false)) throw new Error(`Refusing to overwrite ${output}`);
const server=await preview({preview:{port:4180,strictPort:true},logLevel:"silent"});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});
const results={bare:{},app:{}};
for(const kind of ['bare','app']) {
 const page=await browser.newPage();const events=[];
 page.on('console',m=>events.push({type:m.type(),text:m.text()}));
 page.on('pageerror',e=>events.push({type:'pageerror',text:String(e)}));
 await page.addInitScript(()=>{
  window.__gpuTrace=[];
  if(!globalThis.GPUAdapter)return;
  const original=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){
   const device=await original.apply(this,args);
   window.__gpuTrace.push({event:'created',atMs:performance.now()});
   const destroy=device.destroy.bind(device);
   device.destroy=()=>{window.__gpuTrace.push({event:'destroy called',stack:new Error().stack,atMs:performance.now()});return destroy();};
   device.lost.then(info=>window.__gpuTrace.push({event:'lost',reason:info.reason,message:info.message,atMs:performance.now()}));
   return device;
  };
 });
 if(kind==='bare') {
  await page.route('**/probe.html', route=>route.fulfill({contentType:'text/html',body:'<canvas width="64" height="64"></canvas>'}));
  await page.goto('http://localhost:4180/probe.html');
  await page.evaluate(async()=>{
   window.adapter=await navigator.gpu.requestAdapter();
   window.device=await window.adapter.requestDevice();
   const context=document.querySelector('canvas').getContext('webgpu');
   context.configure({device:window.device,format:navigator.gpu.getPreferredCanvasFormat()});
   const encoder=window.device.createCommandEncoder();
   const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0.5,b:0.8,a:1},loadOp:'clear',storeOp:'store'}]});
   pass.end();window.device.queue.submit([encoder.finish()]);
   await window.device.queue.onSubmittedWorkDone();
  }).catch(e=>events.push({type:'probe error',text:String(e)}));
 } else await page.goto('http://localhost:4180/?seed=1&debug=1');
 await page.waitForTimeout(3000);
 results[kind]={events,trace:await page.evaluate(()=>window.__gpuTrace)};
 await page.close();
}
await browser.close();
await new Promise(resolve=>server.httpServer.close(resolve));
await writeFile(output,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
