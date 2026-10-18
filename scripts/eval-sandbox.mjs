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
  env: { ...process.env, SANDBOX_PORT: String(PORT), SANDBOX_FRESH: '1', MIND_MODE: 'scripted', SANDBOX_STATE_DIR: mkdtempSync(join(tmpdir(), 'sandbox-eval-')),
    // The eval must never spend: both call caps are zero, whatever the mixer is set to.
    MAX_CALLS_PER_MIN: '0', COUNCIL_CALLS_PER_MIN: '0', SANDBOX_TEST: '1', SANDBOX_COUNCIL_DELAY_MS: '1500' } });
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
const seen = { types: new Set(), maxCarry: 0, states: 0, agents: 0, drops: 0, actions: 0, realItems: 0, hyps: 0, adjourned: false };
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
      if (kind === 'event') { seen.types.add(d.type); if (/^sets down /.test(d.text)) seen.drops++; if (['action', 'result', 'thought', 'say'].includes(d.type)) seen.actions++; if (/^gathers (sand|shell|seaweed|driftwood|water|wood|plant fibre|resin|fruit|clay|dry grass|red berries|flint|stone|pyrite)$/.test(d.text)) seen.realItems++; if (d.type === 'hypothesis') seen.hyps++; if (d.type === 'council_merge' && /^ADJOURNED/.test(d.text)) seen.adjourned = true; }
    }
  }
})().catch(() => {});

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://localhost:${WEB}/sandbox.html?renderer=webgl2&debug=1`);
// The startup contract: a loading screen that ends complete, or limited with an Enter button.
const loadState = await page.waitForFunction(() => ['complete', 'limited', 'error'].includes(document.querySelector('.loading-screen')?.dataset.state ?? '') || (window.__SANDBOX__?.entered ?? false),
  null, { timeout: 150000 }).then(() => page.evaluate(() => document.querySelector('.loading-screen')?.dataset.state ?? 'gone'), () => 'timeout');
check('loading screen finishes', ['complete', 'limited', 'gone'].includes(loadState), loadState);
if (loadState === 'limited') await page.click('.loading-action').catch(() => {});
await page.waitForFunction(() => window.__SANDBOX__?.entered, null, { timeout: 30000 }).catch(() => {});
await sleep(2000);
const info = () => page.evaluate(() => { const d = window.__SANDBOX__; return d && { camera: d.camera, tags: d.tags, mode: d.mode, entered: d.entered, qualitySamples: d.qualitySamples }; });
check('island page renders', !!(await info()), errors[0] ?? '');
const perf = await page.evaluate(() => ({ text: document.querySelector('.top .fps')?.textContent ?? '', q: window.__SANDBOX__?.quality, fps: window.__SANDBOX__?.fps }));
// On a very slow renderer, quality must keep stepping down until it reaches the minimal tier.
// Some CI machines draw a frame every few seconds: wait for the page to be playing before judging quality.
await page.waitForFunction(() => (window.__SANDBOX__?.qualitySamples ?? 0) > 0, null, { timeout: 180000 }).catch(() => {});
const fpsNow = (await page.evaluate(() => window.__SANDBOX__?.fps)) ?? 0;
const reached = fpsNow >= 15 ? true : await page.waitForFunction(() => window.__SANDBOX__?.requested === 'minimal', null, { timeout: 180000 }).then(() => true, () => false);
check('quality steps down to the minimal tier on a slow renderer (requested)', reached, `${fpsNow.toFixed(1)} fps; ${await page.evaluate(() => document.querySelector('.top .fps')?.textContent ?? '')}`);
const q0 = (await info()).qualitySamples; await sleep(3000);
await page.waitForFunction(q => (window.__SANDBOX__?.qualitySamples ?? 0) > q, q0, { timeout: 60000 }).catch(() => {});
const q1 = (await info()).qualitySamples;
check('frame-rate readout shows and adaptive quality keeps sampling after entry', /\d+ fps/.test(perf.text) && ['high', 'balanced', 'low'].includes(perf.q) && q1 > q0, `${perf.text}; samples ${q0} to ${q1}`);
check('eight named boxes', (await page.locator('.card').count()) === 8);
const fit = await page.evaluate(() => [...document.querySelectorAll('.card')].every(c => c.getBoundingClientRect().bottom <= innerHeight));
check('all eight boxes fit on screen', fit);
const meters = await page.waitForFunction(() => document.querySelectorAll('.meter').length >= 3, null, { timeout: 20000 }).then(() => true, () => false);
check('usage meters show', meters);
// The mixer: drag the first divider right and the agents' minds change on the server.
const handle = page.locator('.mix-bar .handle').first();
const hb = await handle.boundingBox().catch(() => null), bb = await page.locator('.mix-bar').boundingBox().catch(() => null);
const options = await page.evaluate(() => document.querySelectorAll('.mix-bar .seg').length);
check('mixer offers the connected models', options >= 3, `${options} options`);
if (hb && bb) { await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.5, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up(); await sleep(1500); }
const mixNow = await page.evaluate(() => [...document.querySelectorAll('.card .model')].map(m => m.textContent));
check('dragging the mixer reassigns minds', new Set(mixNow).size >= 2, mixNow.join(','));
if (hb && bb) { await page.mouse.move(bb.x + 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.up(); }
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
await page.keyboard.press('Escape'); await sleep(5000);
check('Esc returns to the whole island', (await info()).mode === 'island');
// Camera ownership: follow an agent, press Free, and the whole pose must stay put while agents move.
await page.click('.card >> nth=1'); await page.click('.inspector .follow'); await sleep(3000);
await page.click('[data-cam="free"]'); await sleep(800);
const pose0 = (await info()).camera; await sleep(6000); const pose1 = (await info()).camera;
const poseMoved = Math.max(...['tx', 'tz', 'yaw', 'pitch', 'distance'].map(k => Math.abs(pose1[k] - pose0[k])));
check('Free stops a follow: the camera pose holds while agents move', poseMoved < 1e-3, `largest change ${poseMoved.toExponential(1)}`);
// Taking the camera by hand ends a follow too.
await page.click('.inspector .follow'); await sleep(1500);
const cv = (await page.locator('canvas').first().boundingBox().catch(() => null)) ?? { x: 0, y: 0, width: 1400, height: 820 };
await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2); await page.mouse.down();
await page.mouse.move(cv.x + cv.width / 2 + 80, cv.y + cv.height / 2 + 10, { steps: 5 }); await page.mouse.up(); await sleep(800);
check('dragging the view ends a follow', (await info()).mode === 'free', (await info()).mode);
// Also from a settled group follow: wait for its glide to finish, then drag.
await page.click('[data-cam="agents"]'); await sleep(6000);
await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2); await page.mouse.down();
await page.mouse.move(cv.x + cv.width / 2 - 60, cv.y + cv.height / 2, { steps: 4 }); await page.mouse.up(); await sleep(800);
check('dragging during a settled group follow takes the camera', (await info()).mode === 'free', (await info()).mode);
await page.keyboard.press('Escape');
// Let the glide back to the whole island finish before judging stillness.
for (let i = 0, prev = null; i < 20; i++) { await sleep(1000); const c = (await info()).camera; if (prev && Math.hypot(c.tx - prev.tx, c.tz - prev.tz) < 1e-4 && Math.abs(c.distance - prev.distance) < 1e-4) break; prev = c; }
// The camera never moves by itself in island mode: a council must not pull it.
const still0 = (await info()).camera;
await page.click('.card >> nth=0');
await page.click('.inspector .ask');
for (let i = 0; i < 30 && !seen.types.has('council_merge'); i++) await sleep(1000);
const still1 = (await info()).camera;
check('the camera stays put unless a follow mode is on', Math.hypot(still1.tx - still0.tx, still1.tz - still0.tz) < 0.05, `${Math.hypot(still1.tx - still0.tx, still1.tz - still0.tz).toFixed(3)} units`);
check('the council card shows the parts', await page.evaluate(() => document.querySelectorAll('.c-parts li').length >= 2));
check('a council opens, splits and merges', ['council_open', 'council_split', 'council_part', 'council_merge'].every(t => seen.types.has(t)), [...seen.types].filter(t => t.startsWith('council')).join(','));
await sleep(30000);
check('agents can set things down', seen.types.has('action') && seen.drops > 0, `${seen.drops} set down`);
check('the carry law holds (six or fewer)', seen.maxCarry <= 6, `max carried ${seen.maxCarry} over ${seen.states} states`);
check('knowledge passes between agents', seen.types.has('learn'));
check('materials are real-world things', seen.realItems > 0, `${seen.realItems} gathers of real materials`);
check('predictions are judged against the world', seen.types.has('hypothesis'), `${seen.hyps} hypotheses`);
await api('/api/control', { cmd: 'act', agent: 5, decision: { action: 'write_skill', skill_name: 'make sparks', steps: [{ action: 'gather', target: 'flint' }, { action: 'gather', target: 'pyrite' }, { action: 'combine', target: 'flint', with: 'pyrite', expect: 'sparks' }] } });
await api('/api/control', { cmd: 'act', agent: 5, decision: { action: 'use_skill', target: 'make sparks' } });
for (let i = 0; i < 30 && !seen.types.has('skill_done'); i++) await sleep(500);
check('agents write and run skills', seen.types.has('skill_written') && seen.types.has('skill_run'), [...seen.types].filter(t => t.startsWith('skill') || t === 'learn_skill').join(','));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
// Layout: at every width the camera and panel controls stay whole and on screen.
const clipped = [];
for (const width of [1400, 1200, 900, 640]) {
  await page.setViewportSize({ width, height: 820 }); await sleep(1500);
  const bad = await page.evaluate(() => [...document.querySelectorAll('.top .cam button, .top .run, .top .toggle-left, .top .toggle-right')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width < 20 || r.right > innerWidth || b.scrollWidth > b.clientWidth + 1; }).map(b => b.textContent));
  if (bad.length) clipped.push(`${width}: ${bad.join(', ')}`);
  await shot(page, `${OUT}/layout-${width}.png`);
}
await page.setViewportSize({ width: 1400, height: 820 }); await sleep(1000);
check('primary controls are whole at 1400, 1200, 900 and 640 px', clipped.length === 0, clipped.join(' | '));
// A malformed model reply must not crash anything: odd types everywhere, including the prediction.
for (const decision of [{ action: 'combine', target: 'flint', with: 'pyrite', expect: { result: 'sparks' } }, { action: 42, expect: [1, 2] }, { thought: { x: 1 }, say: null, share: 'all', steps: 'x' }, null]) {
  await api('/api/control', { cmd: 'act', agent: 2, decision });
}
await sleep(1500);
const alive = await api('/api/usage').then(r => r.ok, () => false);
check('malformed model replies cannot crash the server', alive && !/act failed|TypeError/.test(serverLog), serverLog.match(/act failed.*|TypeError.*/)?.[0] ?? 'server up');
// Pause during a council: it closes cleanly instead of acting.
await api('/api/control', { cmd: 'council', agent: 3 }); await api('/api/control', { cmd: 'pause' });
for (let i = 0; i < 20 && !seen.adjourned; i++) await sleep(500);
check('Pause adjourns a council in progress', seen.adjourned, seen.adjourned ? 'adjourned' : 'no adjournment seen');
await api('/api/control', { cmd: 'start' });
const spent = await (await api('/api/usage')).json();
check('the eval spent nothing (zero model calls)', spent.island.calls === 0, `${spent.island.calls} calls`);
// Pause stops everything: no new actions while paused.
await api('/api/control', { cmd: 'pause' }); await sleep(1500);
const before = seen.actions; await sleep(6000);
check('Pause stops the agents', seen.actions === before, `${seen.actions - before} actions while paused`);
await api('/api/control', { cmd: 'start' });

const web = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await web.goto(`http://localhost:${WEB}/web.html?debug=1`); await sleep(6000);
const drawn = await web.evaluate(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) n++; return n; });
check('web page draws the agents', drawn > 2000, `${drawn} pixels`);
const debugStable = await web.evaluate(async () => { const a = window.__WEB__; await new Promise(r => setTimeout(r, 1500)); return a === window.__WEB__ && typeof a.selectFact === 'function'; });
check('web debug object is created once and stays whole', debugStable);
check('web shows its frame rate', await web.evaluate(() => /fps|idle/.test(document.querySelector('.top .fps')?.textContent ?? '')));
// Idle means idle: with the island paused, the web should stop drawing entirely.
await api('/api/control', { cmd: 'pause' }); await sleep(4000);
const d0 = await web.evaluate(() => window.__WEB__?.draws ?? -1); await sleep(5000); const d1 = await web.evaluate(() => window.__WEB__?.draws ?? -1);
check('web draws nothing when nothing changes', d0 >= 0 && d1 - d0 <= 3, `${d1 - d0} draws in 5 s while paused`);
await api('/api/control', { cmd: 'start' });
// Selecting a fact isolates it: exactly one link per mind that knows it.
await web.evaluate(() => window.__WEB__.selectFact(0)); await sleep(800);
const iso = await web.evaluate(() => ({ lit: window.__WEB__.litLinks, knowers: window.__WEB__.knowers }));
check('selecting a fact shows only its links', iso.knowers > 0 && iso.lit === iso.knowers, `${iso.lit} links for ${iso.knowers} knowers`);
await shot(web, `${OUT}/web.png`);

await browser.close(); await vite.close();
// npx starts the server as a child: end the whole process group so no old server outlives the run.
try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/summary.md`, `# Sandbox eval\n\n${results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`).join('\n')}\n`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
