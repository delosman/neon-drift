/**
 * Portal build — a dist/ that survives however a host chooses to serve it.
 *
 *   npm run build:portal     # -> dist-portal/  (upload this to VIVERSE)
 *
 * THE BUG THIS EXISTS FOR, measured with tools/embed-probe.mjs:
 *
 *   root, direct              boot=OK
 *   subpath WITH slash        boot=OK
 *   subpath NO slash          boot=HUNG   curtain="starting up"
 *
 * A portal serves an uploaded zip from a subpath, and some serve the app at
 * `/play/neon` with NO TRAILING SLASH. The browser then resolves the build's
 * relative `./assets/index-<hash>.js` against the PARENT directory —
 * `/play/assets/index-<hash>.js` — which 404s. Not one line of the game
 * executes, so the boot curtain (painted by index.html before any module
 * parses) sits on "starting up" forever. `base` cannot fix this: the
 * ambiguity is in the host's URL shape, not in ours, and the absolute path
 * is unknowable at build time.
 *
 * So the subresource URLs are resolved AT RUNTIME by a tiny classic script
 * that runs before anything else and knows the one thing the build cannot:
 * `location.pathname`. A last segment containing a dot is a file (assets sit
 * beside it); anything else is a directory URL the host stripped the slash
 * from (assets sit under it).
 *
 * Inlining the bundle into the HTML was tried first and rejected: the
 * minified bundle contains `<!--`, which cannot be escaped into a
 * `<script>` body without either corrupting the JS (a parse error, verified)
 * or hand-parsing string literals. This keeps hashed filenames, HTTP
 * caching and sourcemaps intact.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(root, 'dist');
const OUT = join(root, 'dist-portal');

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

const grab = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`portal-build: no ${what} found in dist/index.html`);
  html = html.replace(re, '');
  return m[1].replace(/^\.?\//, '');
};
const js = grab(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i, 'module script');
const css = grab(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i, 'stylesheet');
let manifest = null;
const mm = html.match(/<link[^>]*rel="manifest"[^>]*href="([^"]+)"[^>]*>/i);
if (mm) {
  manifest = mm[1].replace(/^\.?\//, '');
  html = html.replace(/<link[^>]*rel="manifest"[^>]*href="[^"]+"[^>]*>/i, '');
}

// Classic script (not a module) so it executes immediately and in order.
const boot = `<script>
/* Portal path resolver — see tools/portal-build.mjs. The host may serve this
   page at /x/y/, at /x/y (no slash) or as /x/y/index.html; only the running
   page knows which, so the asset URLs are built here rather than baked. */
(function () {
  var p = location.pathname;
  var last = p.slice(p.lastIndexOf('/') + 1);
  var dir = last === '' ? p : (last.indexOf('.') >= 0 ? p.slice(0, p.lastIndexOf('/') + 1) : p + '/');
  function tag(name, attrs) {
    var e = document.createElement(name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    document.head.appendChild(e);
  }
  tag('link', { rel: 'stylesheet', href: dir + ${JSON.stringify(css)} });${manifest ? `
  tag('link', { rel: 'manifest', href: dir + ${JSON.stringify(manifest)} });` : ''}
  tag('script', { type: 'module', src: dir + ${JSON.stringify(js)} });
})();
</script>`;

html = html.replace('</head>', boot + '\n  </head>');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(DIST, OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
console.log('portal build -> dist-portal/  (runtime path resolver installed)');
console.log('  js:', js, '\n  css:', css, manifest ? '\n  manifest: ' + manifest : '');
