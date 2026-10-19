// Sandbox eval: runs the agent server with scripted minds on a fresh island,
// serves the pages, and checks what the owner sees and what the laws require.
// Exits non-zero on any failure. Screenshots land in eval-results/sandbox/.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = Number(process.env.EVAL_SERVER_PORT ?? 8791), WEB = Number(process.env.EVAL_WEB_PORT ?? 5191), OUT = process.env.EVAL_OUT ?? 'eval-results/sandbox';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Screenshots are evidence, not checks: on a slow software renderer one frame can take
// many seconds, so allow a long time and never fail the run over a picture.
const shot = (pg, path) => pg.screenshot({ path, timeout: 120000 }).catch(e => console.log(`screenshot skipped: ${path} (${String(e.message).split('\n')[0]})`));

const STATE_DIR = mkdtempSync(join(tmpdir(), 'sandbox-eval-'));
const server = spawn('npx', ['vite-node', 'server/sandbox.ts'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, SANDBOX_PORT: String(PORT), SANDBOX_FRESH: '1', MIND_MODE: 'scripted', SANDBOX_STATE_DIR: STATE_DIR,
    // The eval must never spend: both call caps are zero, whatever the mixer is set to.
    MAX_CALLS_PER_MIN: '0', COUNCIL_CALLS_PER_MIN: '0', SANDBOX_TEST: '1', SANDBOX_COUNCIL_DELAY_MS: '1500', SANDBOX_DAY_MS: '60000', SANDBOX_VOYAGE_MS: '3000', SANDBOX_TEST_BAD_PART: '1', SANDBOX_DIRECTOR_MS: '20000', SANDBOX_DRAIN: String(1 / 150) } });
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
const seen = { ledgerChecks: 0, councilOpens: 0, types: new Set(), maxCarry: 0, states: 0, agents: 0, drops: 0, actions: 0, realItems: 0, hyps: 0, adjourned: false, minEnergy: 1, maxDay: 0, minDay: 1, eats: 0 };
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
      if (kind === 'state') { seen.last = d; seen.states++; seen.agents = d.agents.length; seen.maxDay = Math.max(seen.maxDay, d.world.daylight); seen.minDay = Math.min(seen.minDay, d.world.daylight); for (const a of d.agents) seen.minEnergy = Math.min(seen.minEnergy, a.energy); for (const a of d.agents) if (a.council === null) seen.maxCarry = Math.max(seen.maxCarry, a.inventory.length); }
      if (kind === 'event') { seen.types.add(d.type); if (/^sets down /.test(d.text)) { seen.drops++; if (seen.watchDrop && d.agent === seen.watchDrop.agent && d.text === `sets down ${seen.watchDrop.item}`) seen.droppedBy = d.agent; } if (['action', 'result', 'thought', 'say'].includes(d.type)) seen.actions++; if (/^gathers (sand|shell|seaweed|driftwood|water|wood|plant fibre|resin|fruit|clay|dry grass|red berries|flint|stone|pyrite)$/.test(d.text)) seen.realItems++; if (d.type === 'hypothesis') seen.hyps++; if (['launch', 'sank', 'voyage', 'landfall', 'capsized', 'milestone'].includes(d.type)) (seen.sea ??= []).push(d); if (d.type === 'threat' && /^is charged by the boar/.test(d.text)) (seen.charged ??= []).push(d.agent); if (d.type === 'threat' && /^drives the boar off/.test(d.text)) (seen.drove ??= []).push(d.agent); if (d.agent === 7 && /^cannot gather wood without/.test(d.text)) seen.toolBlocked = true; if (d.agent === 7 && d.text === 'gathers wood' && seen.toolGiven) seen.woodWithTool = true; if (d.type === 'disagreement') (seen.disagreements ??= []).push(d); if (d.type === 'council_open') (seen.opens ??= []).push(d); if (/^(eats|tries to eat) /.test(d.text)) seen.eats++; if (d.type === 'council_merge' && /^ADJOURNED/.test(d.text)) seen.adjourned = true; if (d.type === 'ledger_mismatch') seen.ledger = d.text; if (d.type === 'council_open') seen.councilOpens++; if (d.type === 'ledger_check') seen.ledgerChecks++; }
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
// A CI machine can take seconds per frame, and Playwright's click waits for steady frames: press Enter through the DOM.
if (loadState === 'limited') await page.evaluate(() => document.querySelector('.loading-action')?.click()).catch(() => {});
await page.waitForFunction(() => window.__SANDBOX__?.entered, null, { timeout: 120000 }).catch(() => {});
await sleep(2000);
const info = () => page.evaluate(() => { const d = window.__SANDBOX__; return d && { camera: d.camera, tags: d.tags, mode: d.mode, entered: d.entered, qualitySamples: d.qualitySamples }; });
check('island page renders', !!(await info()), errors[0] ?? '');
const perf = await page.evaluate(() => ({ text: document.querySelector('.top .fps')?.textContent ?? '', q: window.__SANDBOX__?.quality, fps: window.__SANDBOX__?.fps }));
// On a very slow renderer, quality must keep stepping down until it reaches the minimal tier.
// Some CI machines draw a frame every few seconds: wait for the page to be playing before judging quality.
await page.waitForFunction(() => (window.__SANDBOX__?.qualitySamples ?? 0) > 0, null, { timeout: 180000 }).catch(() => {});
const fpsNow = (await page.evaluate(() => window.__SANDBOX__?.fps)) ?? 0;
const reached = fpsNow >= 15 ? true : await page.waitForFunction(() => window.__SANDBOX__?.quality === 'minimal', null, { timeout: 180000 }).then(() => true, () => false);
check('quality steps down to the minimal tier on a slow renderer, and it is actually applied', reached, `${fpsNow.toFixed(1)} fps; ${await page.evaluate(() => document.querySelector('.top .fps')?.textContent ?? '')}`);
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
let hb = null; for (let i = 0; i < 10 && !hb; i++) { hb = await handle.boundingBox({ timeout: 5000 }).catch(() => null); if (!hb) await sleep(500); }
const bb = await page.locator('.mix-bar').boundingBox().catch(() => null);
const options = await page.evaluate(() => document.querySelectorAll('.mix-bar .seg').length);
check('mixer offers the connected models', options >= 3, `${options} options`);
// Record what the press actually lands on, so a miss explains itself.
await page.evaluate(() => { window.__mixPress = []; addEventListener('pointerdown', e => window.__mixPress.push(`${e.target.className}@${Math.round(e.clientX)}`), { capture: true }); });
if (hb && bb) { await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.5, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up();
// The new mix goes to the server and comes back on the stream: wait for it rather than a fixed pause.
await page.waitForFunction(() => new Set([...document.querySelectorAll('.card .model')].map(m => m.textContent)).size >= 2, null, { timeout: 60000 }).catch(() => {}); }
const mixNow = await page.evaluate(() => [...document.querySelectorAll('.card .model')].map(m => m.textContent));
const mixWhy = await page.evaluate(() => (window.__mixPress ?? []).join(' '));
check('dragging the mixer reassigns minds', new Set(mixNow).size >= 2, `${mixNow.join(',')}; pressed ${mixWhy}; handle at ${hb && Math.round(hb.x + hb.width / 2)}, bar ${bb && Math.round(bb.x)} to ${bb && Math.round(bb.x + bb.width)}; server mix ${(seen.last?.mix ?? []).join(',')}`);
if (hb && bb) { await page.mouse.move(bb.x + 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.up(); }
await api('/api/control', { minds: 'scripted' }); await sleep(1000);
await sleep(4000);
check('name tags visible in island view', ((await info())?.tags ?? 0) >= 6, `${(await info())?.tags} visible`);
await page.waitForFunction(() => [...document.querySelectorAll('.card .thought')].filter(l => l.textContent).length >= 4, null, { timeout: 40000 }).catch(() => {});
check('thoughts land in the boxes', await page.evaluate(() => [...document.querySelectorAll('.card .thought')].filter(l => l.textContent).length >= 4));
await shot(page, `${OUT}/island.png`);

// Keyboard camera: each key moves the view the right way and never into the land.
// Select a mind's box, making sure it ends up selected (clicking a selected box deselects it).
const domClick = sel => page.evaluate(q => { const el = document.querySelector(q); if (el) el.click(); return !!el; }, sel);
const selectCard = async n => {
  await page.evaluate(k => document.querySelectorAll('.card')[k]?.click(), n); await sleep(400);
  if (await page.evaluate(() => document.querySelector('.inspector')?.hidden !== false)) { await page.evaluate(k => document.querySelectorAll('.card')[k]?.click(), n); await sleep(400); }
};
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
await selectCard(1); await domClick('.inspector .follow'); await sleep(3000);
await domClick('[data-cam="free"]'); await sleep(800);
const pose0 = (await info()).camera; await sleep(6000); const pose1 = (await info()).camera;
const poseMoved = Math.max(...['tx', 'tz', 'yaw', 'pitch', 'distance'].map(k => Math.abs(pose1[k] - pose0[k])));
check('Free stops a follow: the camera pose holds while agents move', poseMoved < 1e-3, `largest change ${poseMoved.toExponential(1)}`);
// Taking the camera by hand ends a follow too.
await domClick('.inspector .follow'); await sleep(1500);
const cv = (await page.locator('canvas').first().boundingBox().catch(() => null)) ?? { x: 0, y: 0, width: 1400, height: 820 };
// Drag low on the screen: a followed agent's name tag sits at the centre.
await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height * 0.85); await page.mouse.down();
await page.mouse.move(cv.x + cv.width / 2 + 80, cv.y + cv.height * 0.85 + 10, { steps: 5 }); await page.mouse.up(); await sleep(800);
check('dragging the view ends a follow', (await info()).mode === 'free', (await info()).mode);
// Also from a settled group follow: wait for its glide to finish, then drag.
await domClick('[data-cam="agents"]'); await sleep(6000);
await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height * 0.85); await page.mouse.down();
await page.mouse.move(cv.x + cv.width / 2 - 60, cv.y + cv.height * 0.85, { steps: 4 }); await page.mouse.up(); await sleep(800);
check('dragging during a settled group follow takes the camera', (await info()).mode === 'free', (await info()).mode);
await page.keyboard.press('Escape');
// Let the glide back to the whole island finish before judging stillness.
for (let i = 0; i < 90; i++) { await sleep(1000); if (!(await info()).camera.gliding) break; }
// The camera never moves by itself in island mode: a council must not pull it.
const still0 = (await info()).camera;
await selectCard(0);
await domClick('.inspector .ask');
for (let i = 0; i < 30 && !seen.types.has('council_merge'); i++) await sleep(1000);
const still1 = (await info()).camera;
check('the camera stays put unless a follow mode is on', Math.hypot(still1.tx - still0.tx, still1.tz - still0.tz) < 0.05, `${Math.hypot(still1.tx - still0.tx, still1.tz - still0.tz).toFixed(3)} units`);
check('the council card shows the parts', await page.evaluate(() => document.querySelectorAll('.c-parts li').length >= 2));
check('a council opens, splits and merges', ['council_open', 'council_split', 'council_part', 'council_merge'].every(t => seen.types.has(t)), [...seen.types].filter(t => t.startsWith('council')).join(','));
await sleep(30000);
// Deterministic: tell an agent that is carrying something to set one thing down.
// Hand the agent the item first: with tools and the boar, nobody may happen to be carrying anything.
const carrier = seen.last?.agents.find(a => a.council === null && !a.collapsed);
seen.droppedBy = null;
if (carrier) { await api('/api/control', { cmd: 'hold', agent: carrier.id, items: ['shell'] }); carrier.inventory = ['shell']; }
if (carrier) { seen.watchDrop = { agent: carrier.id, item: carrier.inventory[0] }; await api('/api/control', { cmd: 'act', agent: carrier.id, decision: { action: 'drop', target: carrier.inventory[0] } }); await sleep(1500); }
check('the set-down action itself works', !!carrier && seen.droppedBy === carrier.id, carrier ? `${carrier.id} set down ${carrier.inventory[0]}: ${seen.droppedBy === carrier.id ? 'seen' : 'not seen'}` : 'nobody was carrying anything');
check('the carry law holds (six or fewer)', seen.maxCarry <= 6, `max carried ${seen.maxCarry} over ${seen.states} states`);
check('knowledge passes between agents', seen.types.has('learn'));
check('materials are real-world things', seen.realItems > 0, `${seen.realItems} gathers of real materials`);
check('predictions are judged against the world', seen.types.has('hypothesis'), `${seen.hyps} hypotheses`);
await api('/api/control', { cmd: 'act', agent: 5, decision: { action: 'write_skill', skill_name: 'make sparks', steps: [{ action: 'gather', target: 'flint' }, { action: 'gather', target: 'pyrite' }, { action: 'combine', target: 'flint', with: 'pyrite', expect: 'sparks' }] } });
await api('/api/control', { cmd: 'act', agent: 5, decision: { action: 'use_skill', target: 'make sparks' } });
for (let i = 0; i < 30 && !seen.types.has('skill_done'); i++) await sleep(500);
// Agent 6 must hold flint to learn that it is not food.
await api('/api/control', { cmd: 'hold', agent: 6, items: ['flint'] });
await api('/api/control', { cmd: 'act', agent: 6, decision: { action: 'eat', target: 'flint' } });
check('strength drains and agents try to eat', seen.minEnergy < 0.9 && seen.eats > 0, `lowest strength ${seen.minEnergy.toFixed(2)}, ${seen.eats} meals tried`);
check('day turns to night', seen.maxDay > 0.8 && seen.minDay < 0.3, `daylight ${seen.minDay.toFixed(2)} to ${seen.maxDay.toFixed(2)}`);
// The sky panel: the day, what comes next and when, and the weather, readable at a glance.
const skyc = await page.evaluate(() => ({ now: document.querySelector('.skycard .now')?.textContent ?? '', when: document.querySelector('.skycard .when')?.textContent ?? '', storm: document.querySelector('.skycard .storm')?.textContent ?? '', dial: !!document.querySelector('.skycard svg .mark') }));
check('the sky panel shows the day, the time of day and a dial', /^Day \d+ · (Day|Dusk|Night|Dawn)/.test(skyc.now) && skyc.dial, skyc.now);
check('the sky panel says when night or dawn comes and when the next storm is due', /(Night|Dawn) in \d+/.test(skyc.when) && /Storm (in|now)/.test(skyc.storm), `${skyc.when} | ${skyc.storm}`);
check('the top bar keeps only controls', await page.evaluate(() => !document.querySelector('.top .progress') && !document.querySelector('.top .sky')));
// Tools matter: wood from a living tree cannot be gathered by hand, and can with an edge.
await api('/api/control', { cmd: 'goto', agent: 7, ground: 'grove' });
await api('/api/control', { cmd: 'hold', agent: 7, items: [] });
await api('/api/control', { cmd: 'act', agent: 7, decision: { action: 'gather', target: 'wood' } });
for (let i = 0; i < 10 && !seen.toolBlocked; i++) await sleep(300);
check('wood cannot be gathered without a tool', !!seen.toolBlocked);
await api('/api/control', { cmd: 'hold', agent: 7, items: ['flint flake'] }); seen.toolGiven = true;
await api('/api/control', { cmd: 'goto', agent: 7, ground: 'grove' });
await api('/api/control', { cmd: 'act', agent: 7, decision: { action: 'gather', target: 'wood' } });
for (let i = 0; i < 10 && !seen.woodWithTool; i++) await sleep(300);
check('with a flint flake, wood can be gathered', !!seen.woodWithTool);
// The night boar: it charges an agent caught in the open, and a spear drives it off.
// It charges whoever in the open is nearest, so each try picks an agent afresh: out in the open,
// out of any council, and standing apart from the others.
for (let i = 0; i < 40 && (seen.last?.agents ?? []).filter(a => a.council === null && !a.collapsed && !a.sheltered).length < 2; i++) await sleep(500);
const openApart = skip => {
  const all = seen.last?.agents ?? [];
  const apart = a => Math.min(...all.filter(o => o.id !== a.id).map(o => Math.hypot(o.x - a.x, o.z - a.z)));
  return all.filter(a => a.council === null && !a.collapsed && !a.sheltered && a.id !== skip).sort((a, b) => apart(b) - apart(a))[0]?.id;
};
let bitten;
for (let attempt = 0; attempt < 3 && bitten === undefined; attempt++) {
  const pick = openApart(); if (pick === undefined) { await sleep(1000); continue; }
  await api('/api/control', { cmd: 'hold', agent: pick, items: ['fruit'] });
  await api('/api/control', { cmd: 'boar', agent: pick });
  for (let i = 0; i < 20 && !(seen.charged ?? []).includes(pick); i++) await sleep(300);
  if ((seen.charged ?? []).includes(pick)) bitten = pick;
}
check('the boar charges an agent caught in the open', bitten !== undefined, `agent ${bitten}`);
check('the boar is drawn on the island while it is out', !!seen.last?.world?.boar);
check('the sky panel says the boar is out', await page.evaluate(() => /boar is out/i.test(document.querySelector('.skycard .threat')?.textContent ?? '')));
let speared;
for (let attempt = 0; attempt < 3 && speared === undefined; attempt++) {
  const pick = openApart(bitten); if (pick === undefined) { await sleep(1000); continue; }
  const before = (seen.charged ?? []).filter(id => id === pick).length;
  await api('/api/control', { cmd: 'hold', agent: pick, items: ['spear'] });
  await api('/api/control', { cmd: 'boar', agent: pick });
  for (let i = 0; i < 20 && !(seen.drove ?? []).includes(pick); i++) await sleep(300);
  if ((seen.drove ?? []).includes(pick) && (seen.charged ?? []).filter(id => id === pick).length === before) speared = pick;
}
check('a spear drives the boar off', speared !== undefined, `agent ${speared}`);
const placeInfo = await (await api('/api/places')).json();
check('agents explore and name places themselves', seen.types.has('explored') && seen.types.has('named') && placeInfo.regions.some(r => r.name), `${placeInfo.regions.filter(r => r.explored).length}/${placeInfo.regions.length} explored, ${placeInfo.regions.filter(r => r.name).length} named`);
check('the map panel shows their map', await page.evaluate(() => /explored/.test(document.querySelector('.map-score')?.textContent ?? '')));
// Deterministic disagreement: pick two agents who are awake and outside any council, clear the
// pair cooldown, teach the listener one result, and have the speaker contradict it beside them.
// Reserve two free agents atomically on the server: they stop thinking, and no other agent's
// council can recruit them while the fixture runs.
let free = [];
for (let i = 0; i < 40 && free.length < 2; i++) { free = (await (await api('/api/control', { cmd: 'reserve', count: 2 })).json()).reserved ?? []; if (free.length < 2) await sleep(500); }
const [listener, speaker] = free;
check('two agents are free for the disagreement fixture', free.length >= 2, `${free.length} reserved`);
await api('/api/control', { cmd: 'know', agent: listener, fact: 'flint + pyrite makes sparks' });
await api('/api/control', { cmd: 'meet', agent: speaker, to: listener });
const dBefore = (seen.disagreements ?? []).length, oBefore = (seen.opens ?? []).length;
await api('/api/control', { cmd: 'act', agent: speaker, decision: { action: 'wait', say: 'flint + pyrite makes nothing' } });
const fresh = () => (seen.disagreements ?? []).slice(dBefore).find(d => d.agent === listener && d.data?.pair === 'flint + pyrite');
const opened = () => (seen.opens ?? []).slice(oBefore).find(o => o.agent === listener && (o.data?.members ?? []).includes(speaker) && /flint \+ pyrite/.test(o.text));
for (let i = 0; i < 20 && !(fresh() && opened()); i++) await sleep(300);
check('a spoken claim that contradicts what a listener knows starts a council', !!fresh() && !!opened(), `listener ${listener}, speaker ${speaker}: ${fresh() ? 'disagreement' : 'no disagreement'}, ${opened() ? 'matching council with the speaker' : 'no matching council'}`);
check('the director steps in when nothing new is found, and says so', seen.types.has('director'));
check('first-try hits are counted per model (recitation)', !!seen.last?.progress?.recall && Object.keys(seen.last.progress.recall).length > 0, JSON.stringify(seen.last?.progress?.recall ?? {}));
// Survival is readable: strength as a number on every box, and a survival section in the inspector.
await page.waitForFunction(() => [...document.querySelectorAll('.card .str')].filter(e => /^\d+%$/.test(e.textContent ?? '')).length === 8, null, { timeout: 5000 }).catch(() => {});
check('every box shows strength as a number', await page.evaluate(() => [...document.querySelectorAll('.card .str')].filter(e => /^\d+%$/.test(e.textContent ?? '')).length === 8));
await selectCard(6);
await page.waitForFunction(() => /flint/.test(document.querySelector('.inspector .fd')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
const surv = await page.evaluate(() => ({ sv: document.querySelector('.inspector .sv')?.textContent ?? '', fd: document.querySelector('.inspector .fd')?.textContent ?? '', rules: document.querySelector('.inspector .rules')?.textContent ?? '' }));
check('the inspector shows strength and shelter', /\d+%/.test(surv.sv) && /sheltered|exposed|collapsed/.test(surv.sv), surv.sv);
check('the inspector shows what the agent has learned about food', /not food: .*flint/.test(surv.fd), surv.fd);
check('the survival rules are written on the page', /strength/.test(surv.rules) && /shelter/.test(surv.rules) && /collapse/.test(surv.rules));
await page.keyboard.press('Escape');
check('agents write and run skills', seen.types.has('skill_written') && seen.types.has('skill_run'), [...seen.types].filter(t => t.startsWith('skill') || t === 'learn_skill').join(','));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
// The day cycle (decision 58): the sun moves on the island's own clock, and sky, light, water and shadows follow it.
// One clock: the sun's height must agree with what the sky panel says. Uniforms only: no shader is rebuilt as the day turns.
const brightness = async () => {
  const png = await page.screenshot({ clip: { x: 520, y: 200, width: 360, height: 360 }, timeout: 120000 }).catch(() => null);
  if (!png) return -1;
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = 60; c.height = 60; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 60, 60);
    const d = ctx.getImageData(0, 0, 60, 60).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString('base64'));
};
const atPhase = async phase => {
  await api('/api/control', { cmd: 'time', phase });
  await page.waitForFunction(p => { const s = window.__SANDBOX__?.sun; return s && Math.abs(((s.phase - p + 1.5) % 1) - 0.5) < 0.03; }, phase, { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  const s = await page.evaluate(() => ({ sun: window.__SANDBOX__?.sun ?? null, programs: window.__SANDBOX__?.programs ?? -1, now: document.querySelector('.skycard .now')?.textContent ?? '' }));
  const light = await brightness();
  await shot(page, `${OUT}/day-${String(phase).replace('.', '_')}.png`);
  return { ...s, light };
};
// Pause holds the island's clock, so each reading is taken at the phase that was set, however slow the frames.
await api('/api/control', { cmd: 'pause', minds: 'scripted' });
const programs0 = await page.evaluate(() => window.__SANDBOX__?.programs ?? -1);
const noon = await atPhase(0), dusk = await atPhase(0.25), night = await atPhase(0.5), dawn = await atPhase(0.75);
const el = d => d.sun?.elevation ?? NaN;
check('the sun moves: high at noon, on the horizon at dusk and dawn, below it at night',
  el(noon) > 40 && Math.abs(el(dusk)) < 8 && Math.abs(el(dawn)) < 8 && el(night) < -30,
  `noon ${el(noon).toFixed(1)}, dusk ${el(dusk).toFixed(1)}, night ${el(night).toFixed(1)}, dawn ${el(dawn).toFixed(1)} degrees`);
check('the sun crosses the sky: it sets on the opposite side from where it rose',
  Number.isFinite(dusk.sun?.azimuth) && Math.abs(((dusk.sun.azimuth - dawn.sun.azimuth + 540) % 360) - 180) > 150,
  `dusk azimuth ${dusk.sun?.azimuth?.toFixed(0)}, dawn ${dawn.sun?.azimuth?.toFixed(0)}`);
check('one clock: the sky panel agrees with the sun', /· Day/.test(noon.now) && /· Dusk/.test(dusk.now) && /· Night/.test(night.now) && /· Dawn/.test(dawn.now) && el(noon) > 0 && el(night) < 0,
  [noon, dusk, night, dawn].map(d => d.now).join(' | '));
check('the island is brightest at noon, dimmer at dusk, darkest at night', noon.light > dusk.light && dusk.light > night.light && night.light >= 0,
  `mean light noon ${noon.light.toFixed(0)}, dusk ${dusk.light.toFixed(0)}, night ${night.light.toFixed(0)}`);
check('the day turns without rebuilding a shader', programs0 > 0 && [noon, dusk, night, dawn].every(d => d.programs === programs0),
  `pipelines ${programs0} then ${[noon, dusk, night, dawn].map(d => d.programs).join(', ')}`);
// No flash on reload: at night the page must already be at night when the loading screen lifts.
await atPhase(0.5);
await page.reload();
await page.waitForFunction(() => window.__SANDBOX__?.entered || document.querySelector('.loading-screen')?.dataset.state === 'limited', null, { timeout: 180000 }).catch(() => {});
await page.evaluate(() => document.querySelector('.loading-action')?.click()).catch(() => {});
await page.waitForFunction(() => window.__SANDBOX__?.entered, null, { timeout: 120000 }).catch(() => {});
const entry = await page.evaluate(() => window.__SANDBOX__?.sunAtEntry ?? null);
check('a reload at night opens at night, with no daylight flash', !!entry && entry.elevation < 0, entry ? `sun at ${entry.elevation.toFixed(1)} degrees when the page opened` : 'no reading');
await atPhase(0);
await api('/api/control', { cmd: 'start' });
check('no page errors after the day cycle', errors.length === 0, errors.slice(0, 2).join(' | '));

// Boats and the islet (decision 59). Boats are found, not given: the sea decides what floats and what crosses.
const isle = (await (await api('/api/places')).json()).islet;
check('a small island lies offshore, apart from the main island', !!isle && isle.nodes >= 30 && isle.apart === true,
  isle ? `${isle.nodes} walkable points, ${isle.gap?.toFixed(1)} units of open sea between` : 'none');
let crew = [];
for (let i = 0; i < 40 && crew.length < 2; i++) { crew = (await (await api('/api/control', { cmd: 'reserve', count: 2, ms: 120000 })).json()).reserved ?? []; if (crew.length < 2) await sleep(500); }
const [sailor, mate] = crew;
const agentNow = id => seen.last?.agents?.find(a => a.id === id);
const seaSince = n => (seen.sea ?? []).slice(n);
const sea = async (agent, decision, items, waitFor, ms = 15000) => {
  const n = (seen.sea ?? []).length;
  if (items) await api('/api/control', { cmd: 'hold', agent, items });
  await api('/api/control', { cmd: 'act', agent, decision });
  for (const until = Date.now() + ms; Date.now() < until && !seaSince(n).some(e => e.agent === agent && waitFor.includes(e.type));) await sleep(300);
  return seaSince(n).filter(e => e.agent === agent);
};
// Real recipes: driftwood lashed to a frame floats as a raft; pitch seals a raft into a boat.
await api('/api/control', { cmd: 'hold', agent: sailor, items: ['frame', 'driftwood'] });
await api('/api/control', { cmd: 'act', agent: sailor, decision: { action: 'combine', target: 'frame', with: 'driftwood' } }); await sleep(800);
const hasRaft = (agentNow(sailor)?.inventory ?? []).includes('raft');
await api('/api/control', { cmd: 'hold', agent: sailor, items: ['raft', 'pitch'] });
await api('/api/control', { cmd: 'act', agent: sailor, decision: { action: 'combine', target: 'raft', with: 'pitch' } }); await sleep(800);
check('driftwood lashed to a frame makes a raft, and pitch seals a raft into a boat', hasRaft && (agentNow(sailor)?.inventory ?? []).includes('boat'),
  `${hasRaft ? 'raft' : 'no raft'}, then ${(agentNow(sailor)?.inventory ?? []).join(', ')}`);
// Launching only works at the shore, and the sea decides: stone sinks, a lone log rolls you back in.
await api('/api/control', { cmd: 'goto', agent: sailor, ground: 'shore' });
const sank = await sea(sailor, { action: 'launch', target: 'stone' }, ['stone'], ['sank']);
check('a stone launched at the shore sinks and is gone', sank.some(e => e.type === 'sank') && !(agentNow(sailor)?.inventory ?? []).includes('stone'), sank.map(e => e.text).join(' | ') || 'nothing happened');
const e0 = agentNow(sailor)?.energy ?? 1;
const log = await sea(sailor, { action: 'launch', target: 'driftwood' }, ['driftwood'], ['launch', 'capsized']);
await sleep(800);
check('a lone log floats a moment and dumps the rider back ashore, wet', log.length > 0 && agentNow(sailor)?.island === 'main' && (agentNow(sailor)?.energy ?? 1) < e0,
  `${log.map(e => e.text).join(' | ') || 'nothing happened'}; on ${agentNow(sailor)?.island}, strength ${e0.toFixed(2)} to ${(agentNow(sailor)?.energy ?? 1).toFixed(2)}`);
// A raft crosses in calm weather; the first crossing is a milestone.
await api('/api/control', { cmd: 'storm', on: false });
await api('/api/control', { cmd: 'goto', agent: sailor, ground: 'shore' });
const crossing = await sea(sailor, { action: 'launch', target: 'raft' }, ['raft', 'fruit'], ['landfall'], 30000);
check('a raft carries its rider across to the islet in calm weather', crossing.some(e => e.type === 'landfall') && agentNow(sailor)?.island === 'islet',
  `${crossing.map(e => e.text).join(' | ') || 'nothing happened'}; now on ${agentNow(sailor)?.island}`);
check('the first sea crossing is a milestone', (seen.sea ?? []).some(e => e.type === 'milestone'));
// The islet has what the main island lacks.
await api('/api/control', { cmd: 'goto', agent: mate, ground: 'shore' });
await api('/api/control', { cmd: 'hold', agent: mate, items: [] });
await api('/api/control', { cmd: 'act', agent: mate, decision: { action: 'gather', target: 'obsidian' } }); await sleep(800);
const mainObsidian = (agentNow(mate)?.inventory ?? []).includes('obsidian');
await api('/api/control', { cmd: 'goto', agent: sailor, ground: 'shore', island: 'islet' });
await api('/api/control', { cmd: 'hold', agent: sailor, items: [] });
await api('/api/control', { cmd: 'act', agent: sailor, decision: { action: 'gather', target: 'obsidian' } }); await sleep(800);
check('obsidian is found on the islet and nowhere on the main island', !mainObsidian && (agentNow(sailor)?.inventory ?? []).includes('obsidian') && agentNow(sailor)?.island === 'islet',
  `main island: ${mainObsidian ? 'found' : 'none'}; islet: ${(agentNow(sailor)?.inventory ?? []).join(', ') || 'nothing'}`);
// A storm capsizes a raft and the sea keeps its cargo; a sealed boat rides it out.
await api('/api/control', { cmd: 'storm', on: true });
await api('/api/control', { cmd: 'goto', agent: mate, ground: 'shore' });
const tipped = await sea(mate, { action: 'launch', target: 'raft' }, ['raft', 'fruit'], ['capsized', 'landfall'], 30000);
await sleep(800);
check('a storm capsizes a raft: the cargo is lost and the rider washes back', tipped.some(e => e.type === 'capsized') && agentNow(mate)?.island === 'main' && !(agentNow(mate)?.inventory ?? []).includes('fruit'),
  `${tipped.map(e => e.text).join(' | ') || 'nothing happened'}; on ${agentNow(mate)?.island}, carrying ${(agentNow(mate)?.inventory ?? []).join(', ') || 'nothing'}`);
await api('/api/control', { cmd: 'goto', agent: mate, ground: 'shore' });
const rode = await sea(mate, { action: 'launch', target: 'boat' }, ['boat', 'fruit'], ['capsized', 'landfall'], 30000);
check('a sealed boat crosses even in a storm, cargo and all', rode.some(e => e.type === 'landfall') && agentNow(mate)?.island === 'islet' && (agentNow(mate)?.inventory ?? []).includes('fruit'),
  `${rode.map(e => e.text).join(' | ') || 'nothing happened'}; on ${agentNow(mate)?.island}`);
await api('/api/control', { cmd: 'storm', on: false });
// The boar is a main-island animal: woken as near the islet agent as the main island allows, it never reaches them.
const chargedBefore = (seen.charged ?? []).length;
await api('/api/control', { cmd: 'boar', agent: mate });
await sleep(3000);
const boarAt = seen.last?.world?.boar;
check('the boar never leaves the main island', !(seen.charged ?? []).slice(chargedBefore).includes(mate) && (!boarAt || Math.hypot(boarAt.x - isle.x, boarAt.z - isle.z) > isle.radius),
  boarAt ? `boar ${Math.hypot(boarAt.x - isle.x, boarAt.z - isle.z).toFixed(1)} units from the islet's centre` : 'boar asleep');
// The page draws the islet, and the eval stays honest.
const isletDrawn = await page.evaluate(() => window.__SANDBOX__?.islet ?? false);
check('the islet is drawn on the island page', isletDrawn === true);
await shot(page, `${OUT}/islet.png`);
seen.isletAgent = mate;

// Layout: at every width the camera and panel controls stay whole and on screen.
const clipped = [];
for (const width of [1400, 1200, 900, 640]) {
  await page.setViewportSize({ width, height: 820 }); await sleep(1500);
  const bad = await page.evaluate(() => [...document.querySelectorAll('.top .cam button, .top .run, .top .toggle-left, .top .toggle-right')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width < 20 || r.right > innerWidth || b.scrollWidth > b.clientWidth + 1; }).map(b => b.textContent));
  if (bad.length) clipped.push(`${width}: ${bad.join(', ')}`);
  // The whole page, not only the buttons: nothing runs off the side.
  const overflow = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
    for (const el of document.querySelectorAll('.top, .rail.left, .rail.right, .mode, .skycard')) {
      const r = el.getBoundingClientRect(); if (getComputedStyle(el).display !== 'none' && r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)) out.push(el.className);
    }
    return out;
  });
  if (overflow.length) clipped.push(`${width}: ${overflow.join(', ')}`);
  await shot(page, `${OUT}/layout-${width}.png`);
}
await page.setViewportSize({ width: 1400, height: 820 }); await sleep(1000);
check('the layout holds at 1400, 1200, 900 and 640 px', clipped.length === 0, clipped.join(' | '));
// A malformed model reply must not crash anything: odd types everywhere, including the prediction.
for (const decision of [{ action: 'combine', target: 'flint', with: 'pyrite', expect: { result: 'sparks' } }, { action: 42, expect: [1, 2] }, { thought: { x: 1 }, say: null, share: 'all', steps: 'x' }, null]) {
  await api('/api/control', { cmd: 'act', agent: 2, decision });
}
await sleep(1500);
const alive = await api('/api/usage').then(r => r.ok, () => false);
check('malformed model replies cannot crash the server', alive && !/act failed|TypeError/.test(serverLog), serverLog.match(/act failed.*|TypeError.*/)?.[0] ?? 'server up');
// Pause during a council: it closes cleanly instead of acting.
// Ask free agents in turn until one actually opens a council, then pause while it works.
const opensBefore = seen.councilOpens;
for (let k = 0; k < 8 && seen.councilOpens === opensBefore; k++) { await api('/api/control', { cmd: 'council', agent: k }); await sleep(300); }
await api('/api/control', { cmd: 'pause' });
for (let i = 0; i < 20 && !seen.adjourned; i++) await sleep(500);
check('Pause adjourns a council in progress', seen.adjourned, seen.adjourned ? 'adjourned' : 'no adjournment seen');
const checksBefore = seen.ledgerChecks;
await api('/api/control', { cmd: 'start' });
for (let i = 0; i < 40 && seen.ledgerChecks === checksBefore; i++) await sleep(500);
// Conservation is judged last, after councils (one with a deliberately malformed part) and a cancellation.
check('a malformed council part was really injected', seen.types.has('test_bad_part'));
check('a full ledger comparison ran after the cancellation', seen.ledgerChecks > checksBefore, `${seen.ledgerChecks - checksBefore} comparisons`);
check('items are conserved: never duplicated or lost, councils included', !seen.types.has('ledger_mismatch'), seen.ledger ?? 'ledger matched throughout');
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

// Restart: a collapsed agent must wake on the restored island clock, not hours later.
await api('/api/control', { cmd: 'act', agent: 7, decision: { action: 'rest' } });
await sleep(1000);
try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
await sleep(3000);
const saved = JSON.parse(readFileSync(join(STATE_DIR, `sandbox-seed-${process.env.SANDBOX_SEED ?? 1}.json`), 'utf8'));
saved.agents[7].collapsedUntil = (saved.simMs ?? 0) + 5000; saved.agents[7].energy = 0;
writeFileSync(join(STATE_DIR, `sandbox-seed-${process.env.SANDBOX_SEED ?? 1}.json`), JSON.stringify(saved));
const again = spawn('npx', ['vite-node', 'server/sandbox.ts'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, SANDBOX_PORT: String(PORT), MIND_MODE: 'scripted', SANDBOX_STATE_DIR: STATE_DIR, MAX_CALLS_PER_MIN: '0', COUNCIL_CALLS_PER_MIN: '0', SANDBOX_TEST: '1' } });
let againLog = ''; again.stdout.on('data', c => { againLog += c; }); again.stderr.on('data', c => { againLog += c; });
for (let i = 0; i < 60 && !againLog.includes('sandbox server on'); i++) await sleep(1000);
check('the island resumes after a restart', /resumed/.test(againLog), againLog.split('\n')[0]);
const afterIsle = (await (await api('/api/places')).json()).agents?.find?.(a => a.id === seen.isletAgent);
check('an agent on the islet is still there after a restart', afterIsle?.island === 'islet', `agent ${seen.isletAgent} on ${afterIsle?.island}`);
const watcher = await fetch(`http://localhost:${PORT}/api/events`); const wr = watcher.body.getReader();
// The save was written while the island ran: a restart must still wait for the owner to press Run.
let wbuf = '', firstState;
for (const until0 = Date.now() + 15000; !firstState && Date.now() < until0;) {
  const { value } = await Promise.race([wr.read(), sleep(2000).then(() => ({ value: undefined }))]);
  if (value) wbuf += new TextDecoder().decode(value);
  const m = wbuf.match(/event: state\ndata: (.*)\n\n/); if (m) firstState = JSON.parse(m[1]);
}
check('a restarted island waits for Run', firstState?.running === false, `running ${firstState?.running}`);
wbuf = '';
await api('/api/control', { cmd: 'start' });
let woke = false; const until = Date.now() + 40000;
// Only a live event for agent 7 counts: the hello replays saved history, which is ignored here.
while (!woke && Date.now() < until) {
  const { value } = await Promise.race([wr.read(), sleep(2000).then(() => ({ value: undefined }))]);
  if (value) wbuf += new TextDecoder().decode(value);
  let cut; while ((cut = wbuf.indexOf('\n\n')) >= 0) {
    const block = wbuf.slice(0, cut); wbuf = wbuf.slice(cut + 2);
    if (!block.startsWith('event: event')) continue;
    const ev = JSON.parse(block.slice(block.indexOf('data: ') + 6));
    if (ev.agent === 7 && /^wakes in .*empty-handed/.test(ev.text)) woke = true;
  }
}
check('a collapsed agent wakes on time after a restart', woke, woke ? 'woke' : 'still collapsed after 40 s');
wr.cancel().catch(() => {});
try { process.kill(-again.pid, 'SIGTERM'); } catch { again.kill('SIGTERM'); }

await browser.close(); await vite.close();
// npx starts the server as a child: end the whole process group so no old server outlives the run.
try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/summary.md`, `# Sandbox eval\n\n${results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`).join('\n')}\n`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
