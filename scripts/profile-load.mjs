// Real-time profiling using the installed headless Chromium and its DevTools protocol.
// Unlike --virtual-time-budget, this preserves real requestAnimationFrame intervals.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const { values } = parseArgs({ options: {
  step: { type: 'string' }, seed: { type: 'string', default: '1' },
  case: { type: 'string', default: '' }, post: { type: 'string', default: '1' },
  frames: { type: 'string', default: '600' },
  'capture-stage': { type: 'string' }, 'enter-slow': { type: 'boolean', default: false },
  'capture-fade': { type: 'boolean', default: false },
  'disable-graphics': { type: 'boolean', default: false },
  width: { type: 'string', default: '1280' }, height: { type: 'string', default: '800' },
  quality: { type: 'string' }, shadow: { type: 'string' }, pixelRatio: { type: 'string' },
  renderer: { type: 'string', default: '' }, url: { type: 'string', default: 'http://localhost:5173/' },
  chrome: { type: 'string', default: join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome') },
} });
if (!/^\d{3}$/.test(values.step ?? '') || !/^\d+$/.test(values.seed) || !/^[a-z0-9-]*$/.test(values.case)) {
  throw new Error('Use --step NNN [--seed N] [--case label] [--post 0] [--renderer webgl2]');
}
const targetFrames = Number(values.frames);
if (!Number.isInteger(targetFrames) || targetFrames < 1 || targetFrames > 600) throw new Error('frames must be 1..600');
const prefix = `${values.step}${values.case ? `-${values.case}` : ''}`;
const screenshot = `docs/iterations/${prefix}-seed-${values.seed}.png`;
const output = `docs/iterations/${prefix}-profile-seed-${values.seed}.json`;
for (const file of [screenshot, output]) {
  if (await access(file).then(() => true, () => false)) throw new Error(`Refusing to overwrite ${file}`);
}
const width = Number(values.width); const height = Number(values.height);
if (!(width >= 320 && width <= 3840 && height >= 240 && height <= 2160)) throw new Error('Invalid capture size');
const profile = await mkdtemp(join(tmpdir(), 'island-profile-'));
const browser = spawn(values.chrome, [
  '--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', `--window-size=${width},${height}`, '--no-first-run',
  ...(values['disable-graphics'] ? ['--disable-webgl', '--disable-webgpu'] : []),
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });
let socket;
const pending = new Map();
const errors = [];
let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  let port;
  for (let tries = 0; tries < 200; tries += 1) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await delay(100); }
  }
  if (!port) throw new Error('Chrome debugging endpoint did not start');
  const pages = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const page = pages.find((entry) => entry.type === 'page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled') {
      const args = message.params.args.map((arg) => arg.value);
      if (message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      if (args[0] === '[island-debug] frame') {
        const frame = JSON.parse(args[1]);
        if (frame.frame % 100 === 0) process.stdout.write(`frame ${frame.frame}: ${frame.intervalMs?.toFixed(1)} ms (${frame.quality})\n`);
      } else if (args[0] === '[island-debug] first frame' || args[0] === '[island-debug] summary' || args[0] === '[island-debug] quality') {
        process.stdout.write(`${args[0]} ${args[1]}\n`);
      }
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const url = new URL(values.url);
  url.searchParams.set('seed', values.seed);
  url.searchParams.set('debug', '1');
  url.searchParams.set('post', values.post);
  if (values.renderer) url.searchParams.set('renderer', values.renderer);
  for (const key of ['quality', 'shadow', 'pixelRatio']) if (values[key]) url.searchParams.set(key, values[key]);
  await send('Page.navigate', { url: url.toString() });
  let report;
  let label = '';
  let manuallyEntered = false;
  let captureState;
  const stageTarget = values['capture-stage'];
  for (let seconds = 0; seconds < 1200; seconds += 1) {
    await delay(stageTarget ? 30 : 500);
    const evaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({report:window.__ISLAND_DEBUG__,label:document.querySelector('.label')?.textContent,fps:document.querySelector('.fps')?.textContent,loading:{state:document.querySelector('.loading-screen')?.dataset.state,stage:document.querySelector('.loading-screen')?.dataset.stage,status:document.querySelector('.loading-status')?.textContent,percent:document.querySelector('progress')?.value},canvasOpacity:getComputedStyle(document.querySelector('canvas')).opacity})`, returnByValue: true });
    const data = JSON.parse(evaluation.result.value ?? '{}');
    label = data.label ?? '';
    if (stageTarget !== 'error' && (data.fps === 'renderer unavailable' || /initialization (failed|timed out)|warm-up timed out|unavailable/.test(label))) throw new Error(label);
    captureState = data.loading;
    if (stageTarget && (data.loading?.stage === stageTarget || data.loading?.state === stageTarget)) {
      report = data.report; break;
    }
    if (!stageTarget && data.loading?.state === 'limited' && values['enter-slow'] && !manuallyEntered) {
      await send('Runtime.evaluate', { expression: "document.querySelector('.loading-action').click()" });
      manuallyEntered = true;
      if (values['capture-fade']) {
        const paused = await send('Runtime.evaluate', { expression: `(async () => {
          const until = performance.now() + 2000;
          while (!document.querySelector('.is-leaving') && performance.now() < until) await new Promise(r => setTimeout(r, 20));
          for (const animation of document.getAnimations()) {
            if (animation.effect?.target?.matches('canvas,.loading-screen')) { animation.pause(); animation.currentTime = 425; }
          }
          return { opacity: document.querySelector('.loading-screen') ? getComputedStyle(document.querySelector('.loading-screen')).opacity : null };
        })()`, awaitPromise: true, returnByValue: true });
        const fading = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`docs/iterations/${prefix}-fade-seed-${values.seed}.png`, Buffer.from(fading.data, 'base64'));
        await writeFile(`docs/iterations/${prefix}-fade-capture-seed-${values.seed}.json`, JSON.stringify({cssTransitionPausedAtMs:425,...paused.result.value}) + '\n');
        await send('Runtime.evaluate', { expression: "document.getAnimations().forEach(a => a.play())" });
      }
    }
    if (data.report?.frames.length && seconds % 10 === 0) await writeFile(output, JSON.stringify(data.report, null, 2) + '\n');
    if (!stageTarget && data.report?.frames.length >= targetFrames && !data.loading?.state) { report = data.report; break; }
  }
  if (!report) throw new Error('Profile did not finish within 1200 polling attempts');
  report.capture = { viewport: [width, height], deviceScaleFactor: 1, softwareRenderer: true, coldBrowserProfile: true, label, consoleErrors: errors, manuallyEntered, loading: captureState };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  const image = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(screenshot, Buffer.from(image.data, 'base64'));
  process.stdout.write(`Saved ${output} and ${screenshot}\n`);
} finally {
  socket?.close();
  browser.kill('SIGTERM');
}
