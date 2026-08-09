/**
 * Road-obstruction audit: is anything standing ON the carriageway?
 *
 *   node tools/road-audit.mjs --track summit-sprint [--pad 1.2]
 *
 * Samples the centreline every metre into a spatial hash, then tests every
 * instance of every InstancedMesh against the road corridor IN 3D: an
 * instance within (halfWidth + pad) laterally of any station whose height is
 * within ±3 m of its own is standing on that road. The 3D part is the point:
 * an XZ-only test (which is what the placement guard's single global probe
 * amounts to) coin-flips on self-adjacent layouts — a point on the upper
 * ramp of a stacked switchback is equally XZ-near to both legs, and probing
 * the lower one answers for the wrong road entirely.
 *
 * Reports offenders by set name with sample positions. Legitimately-spanning
 * sets (banners, bunting, gulls, tunnel lights) will appear if their y sits
 * inside the ±3 m band — read the names, not just the counts.
 */
import puppeteer from 'puppeteer';
import { startVite } from './vite-server.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const TRACK = arg('track', 'summit-sprint');
const PAD = parseFloat(arg('pad', '1.2'));

const server = await startVite(5173);
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle',
    ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=640,360'],
});
try {
  const page = await browser.newPage();
  // nomerge keeps static sets instanced so this audit can see every instance
  // — merged bakes are opaque, and merged bakes are where the last on-road
  // boulder hid.
  await page.goto(`http://127.0.0.1:5173/?track=${TRACK}&quality=low&scaler=off&debug=nomerge`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__gameReady === true', { timeout: 90000 });

  const report = await page.evaluate((pad) => {
    const ctx = window.__ctx, T = window.__THREE;
    const track = ctx.track;
    const L = track.length;
    // --- road corridor: stations every metre in a 16 m spatial hash --------
    const CELL = 16;
    const grid = new Map();
    const st = [];
    for (let d = 0; d < L; d += 1) {
      const s = track.sampleByDistance(d);
      const i = st.length;
      st.push(s.pos.x, s.pos.y, s.pos.z, s.halfWidth);
      const key = `${Math.floor(s.pos.x / CELL)},${Math.floor(s.pos.z / CELL)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)).push(i);
    }
    const onRoad = (x, y, z) => {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const b = grid.get(`${cx + dx},${cz + dz}`);
        if (!b) continue;
        for (const i of b) {
          const o = i * 4;
          const dy = y - st[o + 1];
          if (dy < -1.0 || dy > 3.0) continue;   // under the deck / flying over
          const ex = x - st[o], ez = z - st[o + 2];
          if (Math.hypot(ex, ez) < st[o + 3] + pad) return true;
        }
      }
      return false;
    };
    // --- every instance of every instanced set -----------------------------
    const m2 = new T.Matrix4(), m = new T.Matrix4(), p = new T.Vector3();
    const out = {};
    const hit = (k, x, y, z) => {
      (out[k] ??= { count: 0, samples: [] });
      out[k].count++;
      if (out[k].samples.length < 3) out[k].samples.push([x, y, z].map((v) => +v.toFixed(1)));
    };
    // Track infrastructure that legitimately IS the corridor, and overhead
    // spans. Everything else — including the merged static bakes — gets its
    // VERTICES tested, because merged geometry has no instances to test and
    // merged geometry is where the last two rounds of offenders hid.
    const INFRA = /road|kerb|shoulder|wall|guardrail|parapet|tunnel|bridge|terrain|ground|sea|water|sky|cloud|backdrop|verge|shadow|decal|banner|bunting|arch|gantry|start|gate|fx-|trail|minimap/i;
    ctx.scene.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m2);
          m.multiplyMatrices(o.matrixWorld, m2);
          p.setFromMatrixPosition(m);
          if (!onRoad(p.x, p.y, p.z)) continue;
          hit(o.name || '(unnamed inst)', p.x, p.y, p.z);
        }
        return;
      }
      const name = o.name || '(unnamed)';
      if (INFRA.test(name)) return;
      const pos = o.geometry.getAttribute('position');
      if (!pos) return;
      // every 5th vertex: a 3 m wall face still lands dozens of samples
      for (let i = 0; i < pos.count; i += 5) {
        p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
        if (!onRoad(p.x, p.y, p.z)) continue;
        hit('MESH ' + name, p.x, p.y, p.z);
      }
    });
    return out;
  }, PAD);

  console.log(`instances inside the road corridor (pad ${PAD} m) on ${TRACK}:`);
  const rows = Object.entries(report).sort((a, b) => b[1].count - a[1].count);
  if (!rows.length) console.log('  none');
  for (const [name, r] of rows) {
    console.log(`  ${name.padEnd(26)} n=${String(r.count).padEnd(5)} eg ${JSON.stringify(r.samples[0])}`);
  }
} finally {
  await browser.close();
  await server.stop();
}
