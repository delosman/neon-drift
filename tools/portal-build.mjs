/**
 * Portal build — ONE self-contained index.html.
 *
 *   npm run build          # emits dist/ then dist-portal/
 *   npm run probe:embed    # proves it boots from four URL shapes
 *
 * WHY. Two portal deployments failed before this, each frozen on the boot
 * curtain's "starting up" — the text index.html paints before any module
 * parses, so it always means the bundle never executed:
 *
 *   1. Served from a subpath with NO trailing slash (`/play/neon`), the
 *      browser resolved `./assets/index-<hash>.js` against the PARENT
 *      directory and 404'd it (reproduced by tools/embed-probe.mjs).
 *   2. A runtime path resolver fixed that, and VIVERSE still 404'd BOTH the
 *      js and the css from a per-app subdomain — it does not serve the zip's
 *      `assets/` subfolder at all.
 *
 * No path arithmetic survives a host that will not serve a subdirectory, so
 * this build has nothing to serve but the document: bundle, stylesheet and
 * manifest are inlined and the browser makes exactly one request. Nothing in
 * this game loads from disk at runtime — every texture, mesh and sound is
 * generated in code — so one file is the whole program.
 *
 * INLINING RULES, both learned the hard way:
 *
 *   - The bundle is spliced in VERBATIM. An earlier version "escaped" `<!--`
 *     to `<\!--`, which is invalid JS outside a string literal, and shipped a
 *     parse error. Only two sequences can genuinely hurt and both are
 *     asserted below rather than escaped: `</script` (ends the element) and
 *     `<!--` followed by `<script` (HTML's double-escaped state, where
 *     `</script>` stops closing).
 *   - Every replacement takes a FUNCTION, never a string. `String.replace`
 *     expands `$&`, `$'` and `` $` `` in a string replacement, and a minified
 *     bundle is full of `$` — that spliced chunks of the document into the
 *     middle of the JS.
 *
 * Each step asserts it actually changed the document, so a silently-missed
 * replacement fails the build instead of shipping a file that 404s.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(root, 'dist');
const OUT = join(root, 'dist-portal');

let html = readFileSync(join(DIST, 'index.html'), 'utf8');
const asset = (href) => join(DIST, href.replace(/^\.?\//, ''));

/** Replace exactly one match, and prove it happened. */
function mustReplace(re, make, label) {
  const before = html;
  html = html.replace(re, () => make());
  if (html === before) throw new Error(`portal-build: nothing replaced for ${label} (pattern did not match)`);
}

// --- 1. the module bundle --------------------------------------------------
const RE_JS = /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i;
const jsm = html.match(RE_JS);
if (!jsm) throw new Error('portal-build: no module <script src> in dist/index.html');
const js = readFileSync(asset(jsm[1]), 'utf8').replace(/\n?\/\/# sourceMappingURL=.*$/m, '');

const nClose = (js.match(/<\/script/gi) || []).length;
const nOpen = (js.match(/<script/gi) || []).length;
const nComment = (js.match(/<!--/g) || []).length;
if (nClose) throw new Error(`portal-build: bundle has ${nClose} '</script' — would close the tag early`);
if (nComment && nOpen) throw new Error(`portal-build: bundle has '<!--' and '<script' — HTML double-escape hazard`);

mustReplace(RE_JS, () => `<script type="module">\n${js}\n</script>`, 'module bundle');

// --- 2. the stylesheet -----------------------------------------------------
const RE_CSS = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i;
const cssm = html.match(RE_CSS);
if (cssm) {
  const css = readFileSync(asset(cssm[1]), 'utf8');
  if (/<\/style/i.test(css)) throw new Error("portal-build: css contains '</style'");
  mustReplace(RE_CSS, () => `<style>${css}</style>`, 'stylesheet');
}

// --- 3. the manifest, as a data URI ---------------------------------------
const RE_MAN = /<link[^>]*rel="manifest"[^>]*href="([^"]+)"[^>]*\/?>/i;
const manm = html.match(RE_MAN);
if (manm) {
  let tag = '';
  try {
    const b64 = Buffer.from(readFileSync(asset(manm[1]), 'utf8')).toString('base64');
    tag = `<link rel="manifest" href="data:application/manifest+json;base64,${b64}">`;
  } catch { /* no manifest on disk: drop the link rather than ship a 404 */ }
  mustReplace(RE_MAN, () => tag, 'manifest');
}

// --- 4. prove it is self-contained ----------------------------------------
const left = [...html.matchAll(/(?:src|href)="(?!data:|https?:|#)([^"]+)"/gi)].map((m) => m[1]);
if (left.length) throw new Error(`portal-build: still references ${[...new Set(left)].join(', ')}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
console.log(`portal build -> dist-portal/index.html  ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB, 0 subresources`);
