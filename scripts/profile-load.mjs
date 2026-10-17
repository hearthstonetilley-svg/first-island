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
const profile = await mkdtemp(join(tmpdir(), 'island-profile-'));
const browser = spawn(values.chrome, [
  '--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--window-size=1280,800', '--no-first-run',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });
let socket;
const pending = new Map();
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
    } else if (message.method === 'Runtime.consoleAPICalled') {
      const args = message.params.args.map((arg) => arg.value);
      if (args[0] === '[island-debug] frame') {
        const frame = JSON.parse(args[1]);
        if (frame.frame % 100 === 0) process.stdout.write(`frame ${frame.frame}: ${frame.intervalMs?.toFixed(1)} ms (${frame.quality})\n`);
      } else if (args[0] === '[island-debug] first frame' || args[0] === '[island-debug] summary') {
        process.stdout.write(`${args[0]} ${args[1]}\n`);
      }
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const url = new URL(values.url);
  url.searchParams.set('seed', values.seed);
  url.searchParams.set('debug', '1');
  url.searchParams.set('post', values.post);
  if (values.renderer) url.searchParams.set('renderer', values.renderer);
  await send('Page.navigate', { url: url.toString() });
  let report;
  let label = '';
  for (let seconds = 0; seconds < 1200; seconds += 1) {
    await delay(1000);
    const evaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({report:window.__ISLAND_DEBUG__,label:document.querySelector('.label')?.textContent})`, returnByValue: true });
    const data = JSON.parse(evaluation.result.value ?? '{}');
    label = data.label ?? '';
    if (/initialization (failed|timed out)|unavailable/.test(label)) throw new Error(label);
    if (data.report?.frames.length >= targetFrames) { report = data.report; break; }
  }
  if (!report) throw new Error('Profile did not finish within 1200 polling attempts');
  report.capture = { viewport: [1280, 800], deviceScaleFactor: 1, softwareRenderer: true, coldBrowserProfile: true, label };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  const image = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(screenshot, Buffer.from(image.data, 'base64'));
  process.stdout.write(`Saved ${output} and ${screenshot}\n`);
} finally {
  socket?.close();
  browser.kill('SIGTERM');
}
