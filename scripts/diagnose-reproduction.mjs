// Read-only observation of the real reproduction gates. No dials or thresholds changed.
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { step: { type: 'string' } } });
if (!/^\d{3}$/.test(values.step ?? '')) throw new Error('Use --step NNN');
const prefix = `docs/iterations/${values.step}-reproduction`;
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { Simulation } = await server.ssrLoadModule('/src/sim/core.ts');
  const results = [];
  for (const seed of [1, 7, 42, 99, 2026]) {
    const sim = new Simulation(seed), samples = [];
    for (let tick = 0; tick <= 21600; tick += 300) {
      if (tick) sim.step(300);
      samples.push({ tick, ...sim.snapshot().stats, ...sim.reproductionDiagnostics() });
    }
    const events = sim.record().events;
    const parentAges = events.filter(event => event.type === 'reproduction').flatMap(event => event.data.parentAges);
    results.push({ seed, samples, parentAgeMean: parentAges.reduce((sum, age) => sum + age, 0) / parentAges.length,
      finalStats: sim.snapshot().stats, events });
    console.log(`Seed ${seed}: ${samples.filter(row => row.tick % 1800 === 0).map(row => row.population).join(' ')}; mean parent age ${results.at(-1).parentAgeMean.toFixed(1)}`);
  }
  await writeFile(`${prefix}.json`, JSON.stringify({ ticks: 21600, sampleEveryTicks: 300, results }, null, 2) + '\n');
  const lines = ['# Reproduction condition measurements', '', 'Independent failure counts at every 300-tick sample. Partner means another body passing all six own gates within the actual mating distance; no-neighbour counts geometric isolation separately. Ready+self/mate counts distinguish overlapping failures. No instrumentation advances the PRNG or the simulation.', ''];
  for (const result of results) {
    lines.push(`## Seed ${result.seed}`, '', `Mean parent age at birth: ${result.parentAgeMean.toFixed(1)} ticks. Final deaths: ${JSON.stringify(result.finalStats.deathsByCause)}.`, '',
      '| tick | alive | age window | cooldown | health | energy | rest | warmth | partner | no neighbour | ready self | ready + mate | only rest | mean rest | births |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const row of result.samples) lines.push(`| ${[row.tick, row.population, ...Object.values(row.failures), row.noNeighbour, row.readySelf, row.readyWithPartner, row.only.rest, row.meanNeeds.rest.toFixed(1), row.births].join(' | ')} |`);
    lines.push('');
  }
  await writeFile(`${prefix}.md`, lines.join('\n') + '\n');
} finally { await server.close(); }
