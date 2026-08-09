/**
 * Lap sweep: drive a full lap on autopilot at the PLAYER'S quality tier and
 * screenshot the chase camera at a fixed cadence — then build a contact sheet.
 *
 *   node tools/lap-sweep.mjs --track summit-sprint [--quality high] [--every 1.6]
 *
 * Exists because three rounds of corridor mathematics kept declaring a road
 * clean that the player kept photographing objects on. The corridor test
 * answers "is anything standing in the carriageway volume"; this answers the
 * question that actually matters — "what does the player SEE for the whole
 * of a lap" — with no sampling theory between the instrument and the answer.
 * Frames land in shots/lap-<track>/ plus sheet.png at 4 columns.
 */
import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite } from './vite-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const TRACK = arg('track', 'summit-sprint');
const QUALITY = arg('quality', 'high');
const EVERY = parseFloat(arg('every', '1.6'));
const OUT = join(root, 'shots', 'lap-' + TRACK);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await startVite(5173);
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle',
    ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--window-size=1280,720'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(
    `http://127.0.0.1:5173/?track=${TRACK}&quality=${QUALITY}&no=ssao,dof&scaler=off`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__gameReady === true', { timeout: 90000 });
  await page.evaluate(() => {
    const ctx = window.__ctx;
    ctx.race.autoDrive = true;
    ctx.race.start();
  });
  await page.waitForFunction(() => {
    const ctx = window.__ctx;
    const k = ctx.race?.karts?.find?.((q) => q.isPlayer) ?? ctx.race?.karts?.[0];
    return ctx.race?.state === 2 && k && (Math.abs(k.velocity.x) + Math.abs(k.velocity.z)) > 4;
  }, { timeout: 30000, polling: 250 });

  // One full lap, measured by the player's own t wrapping past its start.
  const t0 = await page.evaluate(() => {
    const ctx = window.__ctx;
    const k = ctx.race.karts.find((q) => q.isPlayer) ?? ctx.race.karts[0];
    return k.t;
  });
  let wrapped = false;
  let shot = 0;
  const started = Date.now();
  let prevT = t0;
  while (Date.now() - started < 240000) {
    await new Promise((r) => setTimeout(r, EVERY * 1000));
    const t = await page.evaluate(() => {
      const ctx = window.__ctx;
      const k = ctx.race.karts.find((q) => q.isPlayer) ?? ctx.race.karts[0];
      return k.t;
    });
    await page.screenshot({ path: join(OUT, `f${String(shot).padStart(3, '0')}-t${t.toFixed(3)}.png`) });
    shot++;
    if (prevT > 0.85 && t < 0.15) wrapped = true;
    if (wrapped && t > Math.min(t0, 0.98)) break;
    prevT = t;
  }
  console.log(`${shot} frames -> ${OUT}`);
} finally {
  await browser.close();
  await server.stop();
}

// contact sheet: 4 columns at quarter scale, via python/PIL (already used by
// this repo's plotting scripts)
execFileSync('python', ['-c', `
import os, math
from PIL import Image
d = r'''${OUT}'''
fs = sorted(f for f in os.listdir(d) if f.startswith('f') and f.endswith('.png'))
if fs:
    im0 = Image.open(os.path.join(d, fs[0]))
    w, h = im0.width // 4, im0.height // 4
    cols = 4
    rows = math.ceil(len(fs) / cols)
    sheet = Image.new('RGB', (cols * w, rows * h), (10, 8, 14))
    for i, f in enumerate(fs):
        im = Image.open(os.path.join(d, f)).resize((w, h), Image.LANCZOS)
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(os.path.join(d, 'sheet.png'))
    print('sheet:', os.path.join(d, 'sheet.png'), len(fs), 'frames')
`], { stdio: 'inherit' });
