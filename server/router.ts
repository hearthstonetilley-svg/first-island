// The mind router (design 5.5): one entry point for every model call, so the
// minds stay swappable. Each backend is isolated: no tools, no settings, no
// memory, an empty folder. Calls are budgeted per purpose.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Backend = 'haiku' | 'luna';
const which = (cmd: string) => { try { return execSync(`command -v ${cmd}`, { shell: '/bin/bash', encoding: 'utf8' }).trim() || cmd; } catch { return cmd; } };
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? which('claude');
const CODEX_BIN = process.env.CODEX_BIN ?? which('codex');
const LUNA_MODEL = process.env.LUNA_MODEL ?? '';
const CODEX_HOME = process.env.ISLAND_CODEX_HOME ?? '';
const workDir = mkdtempSync(join(tmpdir(), 'island-minds-'));
const emptyMcp = join(workDir, 'mcp.json');
writeFileSync(emptyMcp, '{"mcpServers":{}}');

export interface CallStats { total: number; failed: number; byPurpose: Record<string, number>; lastError: string; recent: number[] }
export const stats: CallStats = { total: 0, failed: 0, byPurpose: {}, lastError: '', recent: [] };
export function perMinute(): number { const now = Date.now(); stats.recent = stats.recent.filter(t => now - t < 60000); return stats.recent.length; }

export function lunaAvailable(): boolean { return LUNA_MODEL !== '' && CODEX_HOME !== ''; }
export function describe(): string { return `claude ${CLAUDE_BIN}; codex ${lunaAvailable() ? `${CODEX_BIN} model ${LUNA_MODEL}` : 'off'}`; }

function run(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: workDir, env });
    let out = '', settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => { child.kill(); done(() => reject(new Error('timed out'))); }, 60000);
    child.stdout.on('data', c => { out += c; });
    child.on('error', err => done(() => reject(err)));
    child.on('close', code => done(() => (code === 0 || out ? resolve(out) : reject(new Error(`exit ${code}`)))));
  });
}

/** Returns the parsed JSON object from one isolated model call, or throws. */
export async function callModel(backend: Backend, system: string, user: string, purpose: string): Promise<Record<string, unknown>> {
  stats.total++; stats.recent.push(Date.now()); stats.byPurpose[purpose] = (stats.byPurpose[purpose] ?? 0) + 1;
  try {
    let out: string;
    if (backend === 'luna' && lunaAvailable()) {
      out = await run(CODEX_BIN, ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', LUNA_MODEL,
        `${system}\n\n${user}`], { ...process.env, CODEX_HOME });
    } else {
      out = await run(CLAUDE_BIN, ['-p', '--model', 'haiku', '--tools', '', '--setting-sources', '', '--strict-mcp-config',
        '--mcp-config', emptyMcp, '--no-session-persistence', '--system-prompt', system, user], process.env);
    }
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON in reply');
    return JSON.parse(m[0]);
  } catch (err) {
    stats.failed++; stats.lastError = String((err as Error).message).slice(0, 120);
    throw err;
  }
}
