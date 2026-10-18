// Compare the actual simulation module in Node and Chromium, including awkward
// solar phases (the old native Math.cos diverged at tick 756 between engines).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const {values}=parseArgs({options:{report:{type:'string',default:'eval-results/portability.json'}}});
const ticks=[756,1372,1800,5400,21600],seeds=[1,7,42,99,2026];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const server=await createServer({server:{port:4187,strictPort:true,hmr:false},appType:'custom',logLevel:'error'});
server.middlewares.use('/simulation-probe',(_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Simulation engine comparison</title>');});
await server.listen();
const browser=await chromium.launch();
const results=[];
try{
 const {Simulation}=await server.ssrLoadModule('/src/sim/core.ts');
 for(const seed of seeds){
  const page=await browser.newPage();await page.goto('http://localhost:4187/simulation-probe');
  const actual=await page.evaluate(async({seed,ticks})=>{
   const {Simulation}=await import('/src/sim/core.ts');
   const sim=new Simulation(seed),results=[];
   const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');
   let current=0;
   for(const tick of ticks){sim.step(tick-current);current=tick;results.push({tick,stateHash:await hash(sim.state()),eventHash:await hash(sim.record().events)});}
   return results;
  },{seed,ticks});
  const sim=new Simulation(seed);let current=0;
  for(const tick of ticks){
   sim.step(tick-current);current=tick;
   const expected={stateHash:hash(sim.state()),eventHash:hash(sim.record().events)},observed=actual.find(row=>row.tick===tick);
   const passed=expected.stateHash===observed.stateHash&&expected.eventHash===observed.eventHash;
   results.push({seed,tick,passed,node:expected,browser:observed});
  }
  console.log(`Cross-engine seed ${seed}: ${results.filter(row=>row.seed===seed&&row.passed).length}/${ticks.length} exact checkpoints`);
  await page.close();
 }
 const report={passed:results.every(row=>row.passed),seeds,ticks,results};
 await mkdir('eval-results',{recursive:true});await writeFile(values.report,JSON.stringify(report,null,2)+'\n');
 assert(report.passed,'Node and browser states/events must match exactly; see portability report');
}finally{await browser.close();await server.close();}
