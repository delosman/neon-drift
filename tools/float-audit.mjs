/**
 * Float audit: boot a track headless, then flag every INSTANCED prop whose
 * instance origin hangs far above the terrain under it, grouped by set name.
 * For hunting the "trees floating in the sky" class of placement bug that a
 * screenshot critic can see and a gameplay gate cannot.
 *
 *   node tools/float-audit.mjs --track summit-sprint [--above 6]
 *
 * Legitimately-airborne sets (gulls, cables, bunting, arches) will appear in
 * the report — the point is the NUMBERS AND NAMES, not a pass/fail: a cypress
 * set with n>0 at 40 m is a bug; 'gull' at 30 m is a bird.
 */
import puppeteer from 'puppeteer';
import { startVite } from './vite-server.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const TRACK = arg('track', 'summit-sprint');
const ABOVE = parseFloat(arg('above', '6'));

const server = await startVite(5173);
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle',
    ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=640,360'],
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:5173/?track=${TRACK}&quality=low&scaler=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__gameReady === true', { timeout: 90000 });

  const report = await page.evaluate((above) => {
    const ctx = window.__ctx, T = window.__THREE;
    const m2 = new T.Matrix4(), m = new T.Matrix4(), p = new T.Vector3();
    const out = {};
    ctx.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.visible) return;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m2);
        m.multiplyMatrices(o.matrixWorld, m2);
        p.setFromMatrixPosition(m);
        const g = ctx.track.groundAt(p.x, p.z);
        const h = p.y - g;
        if (h > above) {
          const k = o.name || '(unnamed)';
          (out[k] ??= { count: 0, maxH: 0, samples: [] });
          out[k].count++;
          out[k].maxH = Math.max(out[k].maxH, h);
          if (out[k].samples.length < 3) {
            out[k].samples.push([p.x, p.y, p.z, g].map((v) => +v.toFixed(1)));
          }
        }
      }
    });
    return out;
  }, ABOVE);

  console.log(`floating instances (> ${ABOVE} m above terrain) on ${TRACK}:`);
  const rows = Object.entries(report).sort((a, b) => b[1].count - a[1].count);
  if (!rows.length) console.log('  none');
  for (const [name, r] of rows) {
    console.log(`  ${name.padEnd(28)} n=${String(r.count).padEnd(5)} maxH=${r.maxH.toFixed(1).padEnd(7)} eg [x,y,z,ground]=${JSON.stringify(r.samples[0])}`);
  }
} finally {
  await browser.close();
  await server.stop();
}
