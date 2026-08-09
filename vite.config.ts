import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Short commit hash + build time, stamped onto the title screen. Exists
// because a stale browser-cached bundle once sent a whole debugging session
// chasing objects that were already fixed on disk — with the stamp visible,
// "which build am I actually looking at?" takes one glance to answer.
function buildTag(): string {
  let hash = 'dev';
  try {
    hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // not a git checkout (e.g. a bare deploy) — the timestamp still dates it
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${hash} · ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default defineConfig({
  // Relative base so the build works when VIVERSE (or any host) serves it
  // from a subpath rather than the domain root.
  base: './',
  define: { __BUILD_TAG__: JSON.stringify(buildTag()) },
  // no-store on BOTH local servers. A browser-cached index.html silently
  // re-served a week's worth of fixed bugs today — three "it's still broken"
  // reports against a build that was provably clean on disk. Local serving
  // never needs HTTP caching; the asset hashes exist for real deployments.
  server: { port: 5173, strictPort: true, host: true, headers: { 'Cache-Control': 'no-store' } },
  preview: { headers: { 'Cache-Control': 'no-store' } },
  build: { target: 'es2022', sourcemap: true },
});
