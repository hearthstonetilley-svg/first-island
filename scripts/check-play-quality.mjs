// Observe the real render loop: no completion fences in readiness/play, high
// quality through loading/fade, and quality changes only after the overlay leaves.
// Run after building; timing on SwiftShader is evidence about this test host only.
import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
const { values } = parseArgs({ options: { step: { type: 'string' } } });
if (!/^\d{3}$/.test(values.step ?? '')) throw new Error('Use --step NNN');
const prefix = `docs/iterations/${values.step}`;
for (const suffix of ['readiness-seed-42.png', 'entered-high-seed-42.png', 'play-quality-seed-42.png', 'play-quality.json']) {
  if (await access(`${prefix}-${suffix}`).then(() => true, () => false)) throw new Error('Refusing to overwrite evidence');
}
const server = await preview({ preview: { port: 4181, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  const evidence = window.__playCheck = { fences: [], checks: [], overlayGoneAtMs: null };
  function fence(kind) {
    evidence.fences.push({ kind, atMs: performance.now(), stage: document.querySelector('.loading-screen')?.dataset.stage ?? 'playing' });
  }
  const glFence = WebGL2RenderingContext.prototype.fenceSync;
  WebGL2RenderingContext.prototype.fenceSync = function(...args) { fence('WebGL2'); return glFence.apply(this, args); };
  if (typeof GPUQueue !== 'undefined') {
    const gpuFence = GPUQueue.prototype.onSubmittedWorkDone;
    GPUQueue.prototype.onSubmittedWorkDone = function(...args) { fence('WebGPU'); return gpuFence.apply(this, args); };
  }
  const observer = new MutationObserver(() => {
    const report = window.__ISLAND_DEBUG__;
    if (!report) return;
    const overlay = document.querySelector('.loading-screen');
    if (overlay || evidence.overlayGoneAtMs === null) {
      evidence.checks.push({ atMs: performance.now(), overlay: !!overlay, state: overlay?.dataset.state,
        quality: document.querySelector('.fps')?.textContent, changes: report.qualityChanges.length,
        pixelRatio: report.scene.pixelRatio, ao: report.scene.ao });
    }
    if (!overlay && report.loading.entry && evidence.overlayGoneAtMs === null) evidence.overlayGoneAtMs = performance.now();
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
});
try {
  await page.goto('http://localhost:4181/?seed=42&renderer=webgl2&debug=1');
  await page.waitForFunction(() => document.querySelector('.loading-screen.is-measuring'));
  const measuring = await page.evaluate(() => {
    const canvas = getComputedStyle(document.querySelector('canvas'));
    const overlay = getComputedStyle(document.querySelector('.loading-screen'));
    return { canvasOpacity: canvas.opacity, canvasTransition: canvas.transitionDuration,
      background: overlay.backgroundImage, backgroundColor: overlay.backgroundColor,
      backdropFilter: overlay.backdropFilter, filter: overlay.filter,
      decoration: getComputedStyle(document.querySelector('.loading-screen'), '::before').display };
  });
  assert.equal(measuring.canvasOpacity, '1');
  assert.equal(measuring.canvasTransition, '0s');
  assert.equal(measuring.background, 'none');
  assert.equal(measuring.backdropFilter, 'none');
  assert.equal(measuring.filter, 'none');
  assert.equal(measuring.decoration, 'none');
  await page.screenshot({ path: `${prefix}-readiness-seed-42.png` });
  await page.waitForFunction(() => ['limited', 'complete', 'error'].includes(document.querySelector('.loading-screen')?.dataset.state), {}, { timeout: 30000 });
  const state = await page.locator('.loading-screen').getAttribute('data-state');
  assert.notEqual(state, 'error');
  if (state === 'limited') await page.locator('.loading-action').click();
  await page.waitForFunction(() => !document.querySelector('.loading-screen'));
  const entry = await page.evaluate(() => structuredClone(window.__ISLAND_DEBUG__));
  assert.equal(entry.qualityChanges.length, 0);
  assert.equal(entry.scene.pixelRatio, 1);
  assert.equal(entry.scene.ao, true);
  await page.screenshot({ path: `${prefix}-entered-high-seed-42.png` });
  await page.waitForTimeout(8000);
  const result = await page.evaluate(() => ({ trace: window.__playCheck, report: window.__ISLAND_DEBUG__, fps: document.querySelector('.fps').textContent }));
  assert.equal(result.trace.fences.filter(f => ['settling', 'playing'].includes(f.stage)).length, 0);
  assert(result.trace.fences.length > 0, 'Instrumentation must observe the one-time warm-up fences');
  assert(result.trace.checks.filter(check => check.overlay).every(check => check.changes === 0), 'Loading/fade must never change quality');
  const firstPlayFrame = result.report.frames.find(frame => frame.elapsedMs > result.trace.overlayGoneAtMs - result.report.loading.enteredAtMs + 2000);
  // A slow test host should adapt only after real play; a fast host may stay high.
  if (result.report.qualityChanges.length) {
    assert(firstPlayFrame, 'Quality changes require a complete post-overlay play window');
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: `${prefix}-play-quality-seed-42.png` });
  await writeFile(`${prefix}-play-quality.json`, JSON.stringify({ measuring, entry: { qualityChanges: entry.qualityChanges, scene: entry.scene }, ...result, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ measuring, entryQuality: entry.qualityChanges, playChanges: result.report.qualityChanges, fences: result.trace.fences.length, errors }));
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
