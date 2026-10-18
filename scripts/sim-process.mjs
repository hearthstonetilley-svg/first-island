// Each invocation is a fresh Node VM running the actual worker's TypeScript core.
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { seed: { type: 'string', default: '42' }, batch: { type: 'string', default: '1' },
  replay: { type: 'string' }, record: { type: 'string' } } });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { Simulation, replay } = await server.ssrLoadModule('/src/sim/core.ts');
  let simulation, seedOnlyStateHash;
  if (values.replay) {
    const record = JSON.parse(await readFile(values.replay, 'utf8'));
    // The checkpoint is an oracle, never an input to simulation reconstruction.
    simulation = replay(record);
    const seedOnly = new Simulation(record.seed, record.initialDials);
    seedOnly.step(record.ticks);
    seedOnlyStateHash = hash(seedOnly.state());
  } else {
    simulation = new Simulation(Number(values.seed));
    const batch = Number(values.batch);
    if (!Number.isSafeInteger(batch) || batch < 1) throw new Error('Invalid batch');
    const step = ticks => { for (let i = 0; i < ticks; i += batch) simulation.step(Math.min(batch, ticks - i)); };
    step(1200);
    simulation.intervene({ dials: { mutationRate: 0.06, foodRegrowth: 0.4 } });
    step(1200);
    simulation.intervene({ dials: { generationSeconds: 1500 } });
    step(3600);
  }
  const record = simulation.record();
  if (values.record) await writeFile(values.record, JSON.stringify(record));
  const result = { pid: process.pid, seed: record.seed, ticks: record.ticks,
    eventHash: hash(record.events), stateHash: hash(simulation.state()), seedOnlyStateHash };
  simulation.step(500);
  result.continuedStateHash = hash(simulation.state());
  result.continuedEventHash = hash(simulation.record().events);
  console.log(JSON.stringify(result));
} finally { await server.close(); }
