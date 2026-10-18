// Core checkpoint eval. No changes to the owner's scripts/eval-build.mjs.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, parseArgs } from 'node:util';
const exec = promisify(execFile);
export async function evaluateDeterminism() {
  const directory = await mkdtemp(join(tmpdir(), 'island-replay-'));
  const path = join(directory, 'live.json');
  const child = async args => {
    const { stdout } = await exec(process.execPath, ['scripts/sim-process.mjs', ...args], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout);
  };
  try {
    const [first, repeat, different] = await Promise.all([
      child(['--seed', '42', '--batch', '1', '--record', path]),
      child(['--seed', '42', '--batch', '37']), child(['--seed', '7', '--batch', '1']),
    ]);
    const restored = await child(['--replay', path]);
    assert.equal(new Set([process.pid, first.pid, repeat.pid, different.pid, restored.pid]).size, 5, 'All comparisons use fresh processes');
    assert.equal(first.eventHash, repeat.eventHash);
    assert.equal(first.stateHash, repeat.stateHash);
    assert.notEqual(first.eventHash, different.eventHash);
    assert.notEqual(first.stateHash, different.stateHash);
    assert.equal(first.eventHash, restored.eventHash);
    assert.equal(first.stateHash, restored.stateHash, 'Rebuilt state must match the live state, including hidden internals');
    assert.notEqual(first.stateHash, restored.seedOnlyStateHash, 'Seed-only execution must not pass for an intervened run');
    assert.equal(first.continuedStateHash, restored.continuedStateHash);
    assert.equal(first.continuedEventHash, restored.continuedEventHash);
    return { passed: true, ticks: 6000, continuationTicks: 500, parentPid: process.pid,
      first, repeat, different, replay: restored };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { report: { type: 'string', default: 'eval-results/core.json' } } });
  const result = await evaluateDeterminism();
  await mkdir('eval-results', { recursive: true });
  await writeFile(values.report, JSON.stringify(result, null, 2) + '\n');
  console.log(`Core PASS: separate PIDs ${result.first.pid}/${result.repeat.pid}; replay ${result.replay.pid}; state SHA-256 ${result.first.stateHash}`);
}
