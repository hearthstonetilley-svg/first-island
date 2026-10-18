// Build eval: does the built site actually show a working island?
// Serves dist/ with `vite preview`, loads several seeds several times in headless Chromium and checks each load:
//   1. start-up finishes (label names a renderer) within the deadline, with no page errors
//   2. the frame is a real island scene: enough water, sky and land pixels, almost no black
//   3. live instanced agents are published by the drawing scene
//   4. warm-up frame times are measured and reported (gated only with EVAL_TIMING=strict, because headless
//      Chromium renders in software and its timings say nothing about real hardware)
// Writes eval-results/report.json and eval-results/summary.md, and screenshots of every load.
// Usage: npm run build && npm run eval    (EVAL_SEEDS=1,7  EVAL_RUNS=2  EVAL_TIMING=strict  EVAL_PORT=4182)
import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const SEEDS = (process.env.EVAL_SEEDS ?? '1,7,42,99,2026').split(',').map(Number);
const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const STRICT_TIMING = process.env.EVAL_TIMING === 'strict';
const PORT = Number(process.env.EVAL_PORT ?? 4179);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('EVAL_PORT must be a valid TCP port');
const START_DEADLINE_MS = 60_000; // CI software rendering takes 25 to 30 s
const SAMPLE_MS = 3_000;
const LOAD_CAP_MS = 150_000;
const OUT = 'eval-results';

// Pixel classes, judged in the page on a downscaled copy of the screenshot.
const MIN = { blue: 0.4, land: 0.01 };   // blue = water and sky together; their gradients overlap too much to split
const MAX = { black: 0.05, flat: 0.9 };   // flat = share of pixels within a few levels of the most common colour
const MODES = [
  { name: 'auto', query: '' },               // whatever the browser picks (WebGPU when available)
  { name: 'webgl2', query: '&renderer=webgl2' },
];

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const base = `http://localhost:${PORT}/`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu'],
});
mkdirSync(OUT, { recursive: true });

async function classifyPixels(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const w = 160, h = Math.round((img.height / img.width) * 160);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const n = { water: 0, sky: 0, land: 0, black: 0, flat: 0 };
    const hist = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    n.flat = Math.max(...hist.values());
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      const max = Math.max(r, g, bl);
      if (max < 18) n.black++;
      else if (bl > r + 25 && bl >= g && max < 235) n.water++;           // blues and teals
      else if (bl > r && g > r && max >= 150) n.sky++;                   // pale blue sky and haze
      else if ((g > bl && g >= r) || (r > bl + 20 && g > bl + 10)) n.land++; // greens, sand, rock warmth
    }
    const total = d.length / 4;
    n.blue = n.water + n.sky;
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v / total]));
  }, png.toString('base64'));
}

async function sampleFrames(page) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const times = []; let last = performance.now(); const end = last + ms;
    const tick = (t) => { times.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else resolve(times); };
    requestAnimationFrame(tick);
  }), SAMPLE_MS);
}

async function evaluateLoad(page, mode, seed, run, r) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().replace(/\s+/g, ' ').slice(0, 160)); });
  const t0 = Date.now();
  await page.goto(`${base}?seed=${seed}${mode.query}`);
  // Ready means the loading screen reached `complete` (or there is no loading screen and the label names a renderer).
  // On slow devices the loader stops at `limited` and offers an Enter button; the eval presses it and records that.
  const loaderState = () => page.evaluate(() => {
    const el = document.querySelector('.loading-screen');
    if (!el) return /WebGPU|WebGL2/.test(document.querySelector('.label')?.textContent ?? '') ? 'complete' : 'loading';
    return el.getAttribute('data-state') ?? 'loading';
  });
  const waitFor = async (states) => {
    const end = Date.now() + START_DEADLINE_MS;
    while (Date.now() < end) { const st = await loaderState(); if (states.includes(st)) return st; await page.waitForTimeout(250); }
    return await loaderState();
  };
  let state = await waitFor(['complete', 'limited', 'error']);
  if (state === 'limited') {
    r.enteredManually = true;
    await page.click('.loading-screen button').catch(() => {});
    state = await waitFor(['complete', 'error']);
  }
  if (state === 'complete') {
    r.startMs = Date.now() - t0;
    await page.waitForTimeout(1500); // let the fade finish
    r.renderer = /WebGPU/.test(await page.textContent('.label').catch(() => '')) ? 'WebGPU' : 'WebGL2';
  } else {
    const shown = await page.evaluate(() => (document.querySelector('.loading-screen')?.textContent ?? document.querySelector('.label')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140));
    r.failures.push(`start-up ended in state "${state}" within ${START_DEADLINE_MS / 1000} s: ${shown}`);
  }
  if (!r.failures.length) {
    const frames = await sampleFrames(page);
    const sorted = [...frames].sort((a, b) => a - b);
    r.frames = { count: frames.length, medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
      worstMs: +sorted[sorted.length - 1].toFixed(1), over50: frames.filter((f) => f > 50).length };
    if (STRICT_TIMING && r.frames.medianMs > 25) r.failures.push(`median frame ${r.frames.medianMs} ms > 25 ms`);
    r.agentCount = Number(await page.locator('.simulation-hud').getAttribute('data-rendered-agents'));
    if (!Number.isInteger(r.agentCount) || r.agentCount < 1 || r.agentCount > 1000) r.failures.push(`invalid rendered agent count: ${r.agentCount}`);
    const png = await page.screenshot({ path: `${OUT}/${mode.name}-seed-${seed}-run-${run}.png`, timeout: 75_000 });
    r.pixels = await classifyPixels(page, png);
    for (const [k, v] of Object.entries(MIN)) if (r.pixels[k] < v) r.failures.push(`too little ${k}: ${(r.pixels[k] * 100).toFixed(1)}% < ${v * 100}%`);
    if (r.pixels.flat > MAX.flat) r.failures.push(`blank frame: ${(r.pixels.flat * 100).toFixed(0)}% of pixels are one flat colour`);
    if (r.pixels.black > MAX.black) r.failures.push(`too much black: ${(r.pixels.black * 100).toFixed(1)}% > ${MAX.black * 100}%`);
  }
  if (errors.length) r.failures.push(`page errors: ${errors.join(' | ').slice(0, 300)}`);
}

const results = [];
for (const mode of MODES) for (const seed of SEEDS) {
  for (let run = 1; run <= RUNS; run++) {
    const r = { mode: mode.name, seed, run, ok: true, failures: [] };
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let timer;
    const cap = new Promise((resolve) => { timer = setTimeout(() => resolve('cap'), LOAD_CAP_MS); });
    const outcome = await Promise.race([
      evaluateLoad(page, mode, seed, run, r).catch((e) => { r.failures.push(`eval error: ${String(e.message ?? e).split('\n')[0].slice(0, 160)}`); }),
      cap,
    ]);
    clearTimeout(timer);
    if (outcome === 'cap') r.failures.push(`load exceeded the ${LOAD_CAP_MS / 1000} s cap`);
    r.ok = r.failures.length === 0;
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${mode.name} seed ${seed} run ${run}` + (r.ok ? ` ${r.renderer} start ${r.startMs} ms${r.enteredManually ? ' (slow device: pressed Enter)' : ''}` : `: ${r.failures.join('; ')}`));
    await page.close().catch(() => {});
  }
}
await browser.close();
await new Promise((resolve) => server.httpServer.close(resolve));

const passed = results.filter((r) => r.ok).length;
const pct = (x) => (x * 100).toFixed(0) + '%';
const lines = [
  `# Build eval: ${passed}/${results.length} loads passed`, '',
  `Modes ${MODES.map((m) => m.name).join(', ')}; seeds ${SEEDS.join(', ')}; ${RUNS} loads each. Timing ${STRICT_TIMING ? 'gated' : 'reported only (software rendering)'}.`, '',
  '| mode | seed | run | result | renderer | agents | start ms | median frame ms | blue | land | black | flat |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.mode} | ${r.seed} | ${r.run} | ${r.ok ? 'pass' : 'FAIL: ' + r.failures.join('; ')} | ${r.renderer ?? '-'}${r.enteredManually ? ' (Enter)' : ''} | ${r.agentCount ?? '-'} | ${r.startMs ?? '-'} | ${r.frames?.medianMs ?? '-'} | ${r.pixels ? pct(r.pixels.blue) : '-'} | ${r.pixels ? pct(r.pixels.land) : '-'} | ${r.pixels ? pct(r.pixels.black) : '-'} | ${r.pixels ? pct(r.pixels.flat) : '-'} |`),
];
writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1));
writeFileSync(`${OUT}/summary.md`, lines.join('\n') + '\n');
console.log(`\n${passed}/${results.length} loads passed. Summary: ${OUT}/summary.md`);
process.exit(passed === results.length ? 0 : 1);
