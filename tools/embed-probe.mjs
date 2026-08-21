/**
 * Embed probe: does the built game boot the way a HOST serves it?
 *
 *   node tools/embed-probe.mjs
 *
 * VIVERSE (like itch, CrazyGames, any portal) serves an uploaded zip from a
 * SUBPATH and embeds it in an IFRAME on their own origin. Both differ from
 * `vite preview` at the site root, and either can break a build that is
 * perfectly healthy locally. This serves dist/ four ways and reports, for
 * each, whether the bundle executed at all — plus every console error,
 * page error and failed request.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(root, process.env.PROBE_DIR || 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.map': 'application/json' };

/** serve dist under /play/<id>/ so the subpath case is real */
const game = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/embed') {
    const src = url.searchParams.get('src') || '';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><body style="margin:0"><iframe src="${src}" style="width:100vw;height:100vh;border:0"></iframe>`);
    return;
  }
  // a host that serves the app WITHOUT a trailing slash: /play/neon -> index
  if (p === '/play/neon') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(DIST, 'index.html'))); return; }
  p = p.replace(/^\/play\/neon\/?/, '/');
  const f = join(DIST, p === '/' ? 'index.html' : p);
  if (!existsSync(f) || !f.startsWith(DIST)) { res.writeHead(404); res.end('404 ' + p); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => game.listen(8801, r));

/** the "portal" origin that embeds the game in an iframe */
const portal = createServer((req, res) => {
  const src = new URL(req.url, 'http://x').searchParams.get('src') || '';
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><html><body style="margin:0;background:#111">
    <iframe src="${src}" style="width:100vw;height:100vh;border:0"
      allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"></iframe></body></html>`);
});
await new Promise((r) => portal.listen(8802, r));

const CASES = [
  { name: 'root, direct            ', url: 'http://127.0.0.1:8801/' },
  { name: 'subpath WITH slash      ', url: 'http://127.0.0.1:8801/play/neon/' },
  { name: 'subpath NO slash        ', url: 'http://127.0.0.1:8801/play/neon' },
  { name: 'iframe same-origin      ', url: 'http://127.0.0.1:8801/embed?src=' + encodeURIComponent('/play/neon/') },
  { name: 'iframe X-origin NO slash', url: 'http://127.0.0.1:8802/?src=' + encodeURIComponent('http://localhost:8801/play/neon') },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle',
    ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1000,650'],
});
try {
  for (const c of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 650 });
    const errs = [], fails = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message || e).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    page.on('requestfailed', (r) => fails.push(r.url().slice(-60) + ' ' + (r.failure()?.errorText ?? '')));
    page.on('response', (r) => { if (r.status() >= 400) fails.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let booted = false;
    try {
      await page.waitForFunction(() => {
        const w = window.frames.length ? window.frames[0] : window;
        try { return w.__gameReady === true; } catch { return false; }
      }, { timeout: 45000, polling: 500 });
      booted = true;
    } catch { /* stayed on the curtain */ }
    // what does the boot curtain say now?
    const step = await page.evaluate(() => {
      const d = window.frames.length ? window.frames[0].document : document;
      try { return d.querySelector('.boot-step')?.textContent ?? '(no curtain)'; } catch { return '(cross-origin)'; }
    }).catch(() => '(unreadable)');
    let lit = '';
    if (step === '(unreadable)' || step === '(cross-origin)') {
      const buf = await page.screenshot({ encoding: 'base64' });
      lit = ' pixels=' + (await page.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = 160; c.height = 100;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 100);
        const d = g.getImageData(0, 0, 160, 100).data; let sum = 0, mn = 255, mx = 0;
        for (let i = 0; i < d.length; i += 4) { const v = (d[i]+d[i+1]+d[i+2])/3; sum += v; if (v<mn) mn=v; if (v>mx) mx=v; }
        return 'mean' + Math.round(sum / (d.length/4)) + ' spread' + Math.round(mx-mn);
      }, buf));
    }
    console.log(`${c.name} boot=${booted ? 'OK ' : 'HUNG'}  curtain="${step}"${lit}`);
    for (const f of [...new Set(fails)].slice(0, 3)) console.log('      FAILED REQ:', f);
    for (const e of [...new Set(errs)].slice(0, 3)) console.log('      ERR:', e);
    await page.close();
  }
} finally {
  await browser.close();
  game.close();
  portal.close();
}
