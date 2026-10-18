// Load the exact worker/core TypeScript modules headlessly through installed Vite.
// No DOM, duplicate simulation, browser or simulation wall-clock input is needed.
import { createServer } from 'vite';
import { evaluateDeterminism } from './eval-sim.mjs';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const {values}=parseArgs({options:{replay:{type:'string'},report:{type:'string',default:'eval-results/simulation.json'}}});
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
try{
 const {eventLogHash,evaluateViability,evaluateCost}=await server.ssrLoadModule('/src/sim/evaluate.ts');
 if(values.replay){
  const {replay}=await server.ssrLoadModule('/src/sim/core.ts');
  const simulation=replay(JSON.parse(await readFile(values.replay,'utf8')));
  console.log(JSON.stringify({replay:'exact',tick:simulation.snapshot().tick,...simulation.snapshot().stats,eventHash:await eventLogHash(simulation.record().events)},null,2));
 }else{
  const determinism=await evaluateDeterminism(),viability=await evaluateViability(),cost=evaluateCost();
  const report={passed:determinism.passed&&viability.passed&&cost.passed,determinism,viability,cost};
  await mkdir('eval-results',{recursive:true});await writeFile(values.report,JSON.stringify(report,null,2)+'\n');
  console.log(`Determinism ${determinism.passed?'PASS':'FAIL'}: ${determinism.first.stateHash} (state; separate processes)`);
  for(const r of viability.results)console.log(`Seed ${r.seed}: population curve (0..${viability.ticks}, step 1800) ${r.samples.filter(sample=>sample.tick%1800===0).map(sample=>sample.population).join(' ')}, births ${r.births}, deaths ${JSON.stringify(r.deathsByCause)}, third-generation birth ${r.firstThirdGenerationBirth?.tick??'none'}, final ${r.population}, peak ${r.maxPopulation}/${viability.dials.populationCap}, mean parent age ${r.meanParentAgeTicks?.toFixed(1)??'none'} ticks, viable ${r.viable}`);
  console.log(`Viability ${viability.passed?'PASS':'FAIL'}: ${viability.viableSeeds}/5 have a grandchild birth and living final population after ${viability.ticks} ticks; clock generation is ignored`);
  console.log(`Cost ${cost.passed?'PASS':'FAIL'}: 200 agents / 10,000 ticks, ${cost.totalMs.toFixed(1)} ms / ${cost.budgetMs} ms budget; final population ${cost.finalPopulation}`);
  if(!report.passed)process.exitCode=1;
 }
}finally{await server.close();}
