// Sandbox eval: runs the agent server with scripted minds on a fresh island,
// serves the pages, and checks what the owner sees and what the laws require.
// Exits non-zero on any failure. Screenshots land in eval-results/sandbox/.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 8791, WEB = 5191, OUT = 'eval-results/sandbox';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Screenshots are evidence, not checks: on a slow software renderer one frame can take
// many seconds, so allow a long time and never fail the run over a picture.
const shot = (pg, path) => pg.screenshot({ path, timeout: 120000 }).catch(e => console.log(`screenshot skipped: ${path} (${String(e.message).split('\n')[0]})`));

const server = spawn('npx', ['vite-node', 'server/sandbox.ts'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, SANDBOX_PORT: String(PORT), SANDBOX_FRESH: '1', MIND_MODE: 'scripted', SANDBOX_STATE_DIR: mkdtempSync(join(tmpdir(), 'sandbox-eval-')) } });
let serverLog = ''; server.stdout.on('data', c => { serverLog += c; }); server.stderr.on('data', c => { serverLog += c; });
process.env.SANDBOX_PORT = String(PORT);
const vite = await createServer({ server: { port: WEB, strictPort: true }, logLevel: 'silent' });
await vite.listen();
const api = (path, body) => fetch(`http://localhost:${PORT}${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
for (let i = 0; i < 60 && !serverLog.includes('sandbox server on'); i++) await sleep(1000);
check('server starts', serverLog.includes('sandbox server on'), serverLog.split('\n')[0]);
if (!serverLog.includes('sandbox server on')) { console.log(serverLog); try { process.kill(-server.pid, 'SIGTERM'); } catch { /* gone */ } process.exit(1); }
await api('/api/control', { cmd: 'start' });

// Watch the stream for the whole run: the carry law must hold at every state.
const seen = { types: new Set(), maxCarry: 0, states: 0, agents: 0 };
const stream = await fetch(`http://localhost:${PORT}/api/events`);
const reader = stream.body.getReader();
let buffer = '';
(async () => {
  for (;;) {
    const { value, done } = await reader.read(); if (done) return;
    buffer += new TextDecoder().decode(value);
    let cut; while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
      const kind = block.match(/^event: (\w+)/)?.[1], data = block.match(/\ndata: (.*)$/s)?.[1];
      if (!data) continue;
      const d = JSON.parse(data);
      if (kind === 'state') { seen.states++; seen.agents = d.agents.length; for (const a of d.agents) if (a.council === null) seen.maxCarry = Math.max(seen.maxCarry, a.inventory.length); }
      if (kind === 'event') seen.types.add(d.type);
    }
  }
})().catch(() => {});

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://localhost:${WEB}/sandbox.html?renderer=webgl2&debug=1`);
await page.waitForFunction(() => window.__SANDBOX__ !== undefined, null, { timeout: 120000 }).catch(() => {});
const info = () => page.evaluate(() => { const d = window.__SANDBOX__; return d && { camera: d.camera, tags: d.tags, mode: d.mode }; });
check('island page renders', !!(await info()), errors[0] ?? '');
check('eight named boxes', (await page.locator('.card').count()) === 8);
const fit = await page.evaluate(() => [...document.querySelectorAll('.card')].every(c => c.getBoundingClientRect().bottom <= innerHeight));
check('all eight boxes fit on screen', fit);
const meters = await page.waitForFunction(() => document.querySelectorAll('.meter').length >= 3, null, { timeout: 20000 }).then(() => true, () => false);
check('usage meters show', meters);
// The mixer: drag the first divider right and the agents' minds change on the server.
const handle = page.locator('.mix-bar .handle').first();
const hb = await handle.boundingBox(), bb = await page.locator('.mix-bar').boundingBox();
const options = await page.evaluate(() => document.querySelectorAll('.mix-bar .seg').length);
check('mixer offers the connected models', options >= 3, `${options} options`);
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.5, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up(); await sleep(1500);
const mixNow = await page.evaluate(() => [...document.querySelectorAll('.card .model')].map(m => m.textContent));
check('dragging the mixer reassigns minds', new Set(mixNow).size >= 2, mixNow.join(','));
await page.mouse.move(bb.x + 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.up();
await api('/api/control', { minds: 'scripted' }); await sleep(1000);
await sleep(4000);
check('name tags visible in island view', ((await info())?.tags ?? 0) >= 6, `${(await info())?.tags} visible`);
await page.waitForFunction(() => [...document.querySelectorAll('.card .thought')].filter(l => l.textContent).length >= 4, null, { timeout: 40000 }).catch(() => {});
check('thoughts land in the boxes', await page.evaluate(() => [...document.querySelectorAll('.card .thought')].filter(l => l.textContent).length >= 4));
await shot(page, `${OUT}/island.png`);

// Keyboard camera: each key moves the view the right way and never into the land.
const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(150); };
let low = Infinity;
const sample = async () => { const c = (await info()).camera; low = Math.min(low, c.y - c.ground); return c; };
const c0 = await sample(); await hold('w', 700); const c1 = await sample();
check('W moves the view', Math.hypot(c1.tx - c0.tx, c1.tz - c0.tz) > 0.5, `${Math.hypot(c1.tx - c0.tx, c1.tz - c0.tz).toFixed(2)} units`);
await hold('s', 700); const c2 = await sample();
const back = (c2.tx - c1.tx) * (c1.tx - c0.tx) + (c2.tz - c1.tz) * (c1.tz - c0.tz);
check('S moves it back', back < 0 && Math.hypot(c2.tx - c1.tx, c2.tz - c1.tz) > 0.3);
await hold('d', 700); const c3 = await sample(); await hold('a', 700); const c4 = await sample();
// Frame rates differ between holds, so judge direction, not distance: A must undo D.
const dx1 = [c3.tx - c2.tx, c3.tz - c2.tz], dx2 = [c4.tx - c3.tx, c4.tz - c3.tz];
const len = v => Math.hypot(v[0], v[1]), dot = dx1[0] * dx2[0] + dx1[1] * dx2[1];
const fwd = [c1.tx - c0.tx, c1.tz - c0.tz];
check('A and D move sideways and back', len(dx1) > 0.3 && dot < 0 && Math.abs(dx1[0] * fwd[0] + dx1[1] * fwd[1]) / (len(dx1) * len(fwd)) < 0.3,
  `D ${len(dx1).toFixed(2)}, A ${len(dx2).toFixed(2)}, cos to forward ${(Math.abs(dx1[0] * fwd[0] + dx1[1] * fwd[1]) / (len(dx1) * len(fwd))).toFixed(2)}`);
await page.locator('.history input').focus();
await hold('w', 1800); const c5 = await sample();
check('keys still move the view after using the controls', Math.hypot(c5.tx - c4.tx, c5.tz - c4.tz) > 0.3);
for (const key of ['w', 'd', 'w', 'a', 'f', 'w', 'q', 'w', 'r', 'w']) { await hold(key, 900); await sample(); }
check('camera never goes inside the land', low >= 1.0, `lowest clearance ${low.toFixed(2)}`);
await shot(page, `${OUT}/after-flying.png`);

// An observer council runs the whole torrent: open, split, parts, merge.
await page.keyboard.press('Escape'); await sleep(1500);
check('Esc frames the agents', (await info()).mode === 'agents');
await page.click('.card >> nth=0');
await page.click('.inspector .ask');
for (let i = 0; i < 30 && !seen.types.has('council_merge'); i++) await sleep(1000);
check('the council card shows the parts', await page.evaluate(() => document.querySelectorAll('.c-parts li').length >= 2));
check('a council opens, splits and merges', ['council_open', 'council_split', 'council_part', 'council_merge'].every(t => seen.types.has(t)), [...seen.types].filter(t => t.startsWith('council')).join(','));
await sleep(30000);
check('the carry law holds (six or fewer)', seen.maxCarry <= 6, `max carried ${seen.maxCarry} over ${seen.states} states`);
check('knowledge passes between agents', seen.types.has('learn'));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

const web = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await web.goto(`http://localhost:${WEB}/web.html`); await sleep(6000);
const drawn = await web.evaluate(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) n++; return n; });
check('web page draws the agents', drawn > 2000, `${drawn} pixels`);
await shot(web, `${OUT}/web.png`);

await browser.close(); await vite.close();
// npx starts the server as a child: end the whole process group so no old server outlives the run.
try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/summary.md`, `# Sandbox eval\n\n${results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`).join('\n')}\n`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
