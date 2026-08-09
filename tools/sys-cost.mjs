/**
 * Per-system CPU attribution — where does the loop's JS actually go?
 *
 *   node tools/sys-cost.mjs [--track sunset-bay] [--quality low] [--secs 20]
 *
 * Boots with `?debug=systems` (main.ts wraps each system's update/lateUpdate
 * and the GL submission in timers, EMA'd per key), hands the player to the AI,
 * races for `--secs`, and prints the table sorted by cost. Real-GPU flags for
 * the same reason fps-bench refuses SwiftShader: under a software rasteriser
 * the `pipeline.render` bucket measures CPU rasterisation, not submission.
 *
 * These are EMA milliseconds on THIS machine's CPU — use them for the ranking
 * and the ratios, not as phone-absolute numbers.
 */
import puppeteer from 'puppeteer';
import { startVite } from './vite-server.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const TRACK = arg('track', 'sunset-bay');
const QUALITY = arg('quality', 'low');
const SECS = parseFloat(arg('secs', '20'));

const server = await startVite(5173);
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle',
    ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--window-size=640,360'],
});
try {
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:5173/?track=${TRACK}&quality=${QUALITY}&scaler=off&debug=systems`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__gameReady === true', { timeout: 90000 });
  await page.evaluate(() => {
    const ctx = window.__ctx;
    ctx.race.autoDrive = true;
    ctx.race.start();
  });
  // countdown is 4.4s; wait for genuine racing + a little settle
  await page.waitForFunction(() => {
    const ctx = window.__ctx;
    const k = ctx.race?.karts?.[0];
    return ctx.race?.state === 2 && k && (Math.abs(k.velocity.x) + Math.abs(k.velocity.z)) > 4;
  }, { timeout: 30000, polling: 250 });
  await new Promise((r) => setTimeout(r, SECS * 1000));

  const cost = await page.evaluate(() => window.__sysCost());
  const total = Object.values(cost).reduce((a, b) => a + b, 0);
  console.log(`per-system CPU (EMA ms) after ${SECS}s racing on ${TRACK} @ ${QUALITY}:`);
  for (const [k, v] of Object.entries(cost)) {
    if (v < 0.005) continue;
    console.log(`  ${k.padEnd(26)} ${v.toFixed(3).padStart(7)} ms   ${(100 * v / total).toFixed(1).padStart(5)}%`);
  }
  console.log(`  ${'TOTAL'.padEnd(26)} ${total.toFixed(3).padStart(7)} ms`);
} finally {
  await browser.close();
  await server.stop();
}
