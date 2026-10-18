// Verify exported events from capture-stage's actual worker against the Node core.
// The capture script uses default dials; legacy capture records retain seed/ticks/events.
import { createServer } from 'vite';
import { readFile,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const {values}=parseArgs({options:{input:{type:'string'},output:{type:'string'}}});
if(!values.input||!values.output)throw new Error('Use --input captures.json --output results.json');
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
try{
 const {replay}=await server.ssrLoadModule('/src/sim/core.ts');
 const {DEFAULT_DIALS}=await server.ssrLoadModule('/src/sim/types.ts');
 const {eventLogHash}=await server.ssrLoadModule('/src/sim/evaluate.ts');
 const captures=JSON.parse(await readFile(values.input,'utf8')),results=[];
 for(const item of captures){
  const record=item.record??{version:1,seed:item.seed,initialDials:{...DEFAULT_DIALS},ticks:item.ticks,events:item.events};
  const simulation=replay(record);
  results.push({mode:item.mode,seed:record.seed,ticks:record.ticks,exact:true,hash:await eventLogHash(simulation.record().events),stats:simulation.snapshot().stats});
 }
 await writeFile(values.output,JSON.stringify({source:values.input,passed:true,results},null,2)+'\n');
 console.log(JSON.stringify(results));
}finally{await server.close();}
