// The mind router (design 5.5): one entry point for every model call, so the
// minds stay swappable. Each backend is isolated: no tools, no settings, no
// memory, an empty folder. Calls are budgeted per purpose.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export type Backend = 'haiku' | 'sonnet' | 'luna' | 'sol';
export const BACKENDS: Backend[] = ['haiku', 'sonnet', 'luna', 'sol'];
const CODEX_MODELS: Record<string, string> = { luna: process.env.LUNA_MODEL ?? 'gpt-6-luna', sol: process.env.SOL_MODEL ?? 'gpt-6.1-sol' };
const which = (cmd: string) => { try { return execSync(`command -v ${cmd}`, { shell: '/bin/bash', encoding: 'utf8' }).trim() || cmd; } catch { return cmd; } };
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? which('claude');
const CODEX_BIN = process.env.CODEX_BIN ?? which('codex');
// Codex minds run from a private home holding only credentials, so no personal
// instructions or memories reach them.
export const CODEX_HOME = process.env.ISLAND_CODEX_HOME ?? join(homedir(), '.local', 'share', 'first-island', 'codex-home');
const workDir = mkdtempSync(join(tmpdir(), 'island-minds-'));
const emptyMcp = join(workDir, 'mcp.json');
writeFileSync(emptyMcp, '{"mcpServers":{}}');

export interface CallStats { total: number; failed: number; byPurpose: Record<string, number>; byBackend: Record<string, number>; lastError: string; recent: number[]; costUsd: number; inputTokens: number; outputTokens: number }
export const stats: CallStats = { total: 0, failed: 0, byPurpose: {}, byBackend: {}, lastError: '', recent: [], costUsd: 0, inputTokens: 0, outputTokens: 0 };
export function perMinute(): number { const now = Date.now(); stats.recent = stats.recent.filter(t => now - t < 60000); return stats.recent.length; }

export function codexAvailable(): boolean { return existsSync(join(CODEX_HOME, 'auth.json')); }
export function available(): Backend[] { return BACKENDS.filter(b => (b === 'luna' || b === 'sol' ? codexAvailable() : true)); }
export function describe(): string { return `claude ${CLAUDE_BIN}; codex ${codexAvailable() ? `${CODEX_BIN} (isolated home)` : 'off'}`; }

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
  stats.byBackend[backend] = (stats.byBackend[backend] ?? 0) + 1;
  try {
    let out: string;
    if ((backend === 'luna' || backend === 'sol') && codexAvailable()) {
      out = await run(CODEX_BIN, ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', CODEX_MODELS[backend],
        `${system}\n\n${user}`], { ...process.env, CODEX_HOME });
    } else {
      out = await run(CLAUDE_BIN, ['-p', '--model', backend === 'sonnet' ? 'sonnet' : 'haiku', '--tools', '', '--setting-sources', '', '--strict-mcp-config',
        '--mcp-config', emptyMcp, '--no-session-persistence', '--output-format', 'json', '--system-prompt', system, user], process.env);
      // The JSON envelope carries this call's real cost and tokens; the reply is in .result.
      try {
        const envelope = JSON.parse(out);
        stats.costUsd += Number(envelope.total_cost_usd ?? 0);
        const u = envelope.usage ?? {};
        stats.inputTokens += Number(u.input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0) + Number(u.cache_read_input_tokens ?? 0);
        stats.outputTokens += Number(u.output_tokens ?? 0);
        out = String(envelope.result ?? '');
      } catch { /* plain text reply */ }
    }
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON in reply');
    return JSON.parse(m[0]);
  } catch (err) {
    stats.failed++; stats.lastError = String((err as Error).message).slice(0, 120);
    throw err;
  }
}
