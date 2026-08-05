/**
 * ============================================================================
 *  TRACK LAYOUT — bakes the active circuit definition into the station table
 * ============================================================================
 *  The centreline is authored as a *curvature schedule* rather than a list of
 *  points: a table of legs, each with a length and a heading change. Curvature
 *  is then box-blurred, which turns every constant-radius leg into a
 *  clothoid-like transition — the same trick real road engineers use, and the
 *  reason the circuit has no curvature pops when you drive it.
 *
 *  The leg turn angles were solved offline (min-norm Newton step on the two
 *  closure equations) so the loop shuts to under 5 cm without any hand-waving,
 *  and the curvature integral is renormalised to exactly -2π so the heading
 *  closes too. What is left is resampled to a uniform arc-length station table,
 *  which is what makes `t` genuinely arc-length parameterised.
 *
 *  Everything the rest of the game asks about the track — width, banking,
 *  shoulder surface, wall type, terrain profile — is baked into per-station
 *  typed arrays here so that `Track.probe()` is a table lookup and two lerps.
 * ============================================================================
 */
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { ACTIVE_TRACK, KERB_W } from './TrackDefs';

// The per-circuit data (legs, keyframe channels, zones, boost pads, spans)
// lives in TrackDefs.ts; this module bakes whichever definition is active.
// Physical constants shared across circuits are re-exported so the geometry
// builder keeps a single import site.
export {
  KERB_W, TUNNEL_CLEAR, TUNNEL_H, PARAPET_OFF, PARAPET_FACE, FASCIA_OFF,
  WALL_NONE, WALL_GUARDRAIL, WALL_ROCK, WALL_PARAPET, WALL_HEIGHT,
  TRACK_ID, TRACK_NAME, TRACKS, TRACK_STORAGE_KEY, ACTIVE_TRACK,
} from './TrackDefs';

// --- world constants shared with the geometry builder ---------------------
export const SEA_Y = 0;
/** drainage crown: the road crest sits this much above its edge */
export const CROWN = 0.09;

/**
 * Kerb cross-section, as lateral metres past the road edge (`KERB_QS`) and the
 * height above the road-edge plane at each (`KERB_HS`).
 *
 * Deliberately **piecewise-linear**, and deliberately not a smooth ramp. A kerb
 * that eases from road level to its crown over a third of a metre has no edge
 * anywhere on it, so a 14° key finds one continuous value across the whole band
 * and it reads as a painted stripe on flat ground — which is exactly how the
 * round-1 shots read. Splitting it into a steep face, a shallow bevel and a
 * flat crown gives three facets whose N·L differ by 2–3×, and `TrackGeometry`
 * duplicates vertices on every breakpoint so those creases stay hard.
 *
 * The face angle is the one number gameplay feels: 0.098 m over 0.16 m is 31°,
 * about as steep as a kart can cross at speed without the kerb turning into a
 * launch ramp.
 */
export const KERB_QS = [0, 0.06, 0.20, 0.26, 0.34, 0.62, 1.16, 1.30, 1.46, KERB_W];
export const KERB_HS = [0, 0, 0.086, 0.112, 0.133, 0.131, 0.122, 0.100, 0.012, -0.055];

/**
 * Ripple ridden on the kerb crown: amplitude in metres, wavelength in metres.
 *
 * Both moved when the road narrowed. The kerb used to be 1.6 m of a 26 m road —
 * 6% of the corridor, and comfortably sub-pixel at any distance, so nobody could
 * see that the ripple was being sampled at almost exactly Nyquist (a 3.2 m
 * wavelength against 1.5 m rings). At 1.6 m of a 13 m road it is 12% of the
 * corridor and it is the second-brightest thing in most frames, so the aliasing
 * that used to hide now reads as a crawling beat along the kerb.
 *
 * Fix is at both ends: `buildKerbs` halves its ring spacing to 1 m, and the
 * wavelength goes to 4.2 m. 4.2 samples per period instead of 2.1 — comfortably
 * clear of Nyquist — and the amplitude can go up 25% without the extra relief
 * turning into fizz.
 */
export const KERB_RIPPLE_A = 0.020;
export const KERB_RIPPLE_K = (2 * Math.PI) / 4.2;
/** vertical offset the kerb band ends on, so the shoulder joins it cleanly */
export const KERB_END = KERB_HS[KERB_HS.length - 1];
/**
 * Lateral bounds of the flat crown, named rather than indexed.
 *
 * Round 1 read them out of `KERB_QS` positionally, which quietly welded the
 * rumble-ripple mask to the *number of breakpoints* in the profile — add one
 * chamfer and the ripple silently moves onto the bevel and off the crown.
 *
 * The extra breakpoint at 0.20/0.26 is a 60 mm micro-chamfer over what used to
 * be a single 17.5° crease at the top of the steep inner face. That crease was
 * the sharpest thing on the whole cross-section, and at 60 m it resolves to a
 * one-pixel specular highlight running the length of the kerb, which is the
 * geometry half of the shimmer (§9.6: no hard unchamfered edges). The face angle
 * itself is unchanged at 31°, so nothing about how the kerb drives moves.
 */
export const KERB_CROWN0 = 0.34;
export const KERB_CROWN1 = 1.16;

/** how far the fine shoulder ribbon reaches past the kerb, metres */
export const SKIRT_W = 26;
export const CHECKPOINTS = 32;
/** station spacing of the baked centreline, metres */
export const STATION_DS = 0.5;

/**
 * Zone ids are indices into the active def's `zones` table, resolved by name
 * so a circuit that lacks a section simply never matches. 255 is "not on this
 * circuit" — `cl.zone` is a Uint8Array, so no baked station can ever equal it
 * on a track with a sane zone count.
 */
const zoneId = (name: string): number => {
  const i = ACTIVE_TRACK.zones.findIndex((z) => z.name === name);
  return i >= 0 ? i : 255;
};
export const Z_TUNNEL = zoneId('tunnel');
export const Z_BEACH = zoneId('beach');

/** Tunnel span, exported so the geometry builder and fog logic agree. */
export const HAS_TUNNEL = ACTIVE_TRACK.tunnel !== null;
export const TUNNEL_T0 = ACTIVE_TRACK.tunnel?.[0] ?? -1;
export const TUNNEL_T1 = ACTIVE_TRACK.tunnel?.[1] ?? -1;
/** Bridge span. */
export const HAS_BRIDGE = ACTIVE_TRACK.bridge !== null;
export const BRIDGE_T0 = ACTIVE_TRACK.bridge?.[0] ?? -1;
export const BRIDGE_T1 = ACTIVE_TRACK.bridge?.[1] ?? -1;

// ---------------------------------------------------------------------------
//  Structure clearances, measured OUTWARD FROM THE ROAD EDGE (`halfWidth`).
//
//  Every one of these used to be a magic number sitting in TrackGeometry, which
//  was survivable while the road was 26 m across because a metre either way
//  disappeared into the acreage. It is not survivable now: the kerb corridor is
//  1.6 m, and a parapet placed 1.9 m out has its inner face 1.28 m out — i.e.
//  *inside* the corridor the physics is happily letting karts drive on. They
//  live here so the wall table below, the collision offsets and the meshes are
//  all derived from one number apiece.
// ---------------------------------------------------------------------------
// TUNNEL_CLEAR / TUNNEL_H / PARAPET_OFF / PARAPET_FACE / FASCIA_OFF moved to
// TrackDefs.ts (the zone tables reference them) and are re-exported above.

// ---------------------------------------------------------------------------
//  The standing grid.
//
//  Authored once, here, because three places need to agree about it exactly:
//  `Track.buildStartGrid` (where the karts stand), `buildMarkings` (the painted
//  slot boxes) and the start-line checker (which scrubs its paint thin in the
//  two launch corridors). Round 3 had the numbers copy-pasted into all three,
//  and the lateral offset was additionally clamped against the road width, so
//  narrowing the road silently walked the karts off their own painted boxes.
//
//  A kart is ~1.7 m across the tyres and ~2.1 m long. ±3.2 m puts 1.8 m of
//  clear air between the two cars of a row and leaves 3.6 m from the outer tyre
//  to the kerb on an 8.8 m half-width start straight — close enough that eight
//  karts read as a *pack* rather than as a car park, which was the point.
// ---------------------------------------------------------------------------
export const GRID_LAT = 3.2;
/** metres between rows, and how far the outside car of each row is set back */
export const GRID_ROW_DS = 8.0;
export const GRID_STAGGER = 4.0;
/** pole position's distance behind the start line */
export const GRID_BACK0 = 11;
/** painted slot box: half-length and half-width, metres */
export const GRID_BOX_HL = 1.7;
export const GRID_BOX_HW = 1.25;

/** Slot `k` of the grid; index 0 is pole. Distance is *behind* the line. */
export function gridSlot(k: number): { back: number; lat: number } {
  const row = k >> 1, col = k & 1;
  return {
    back: GRID_BACK0 + row * GRID_ROW_DS + col * GRID_STAGGER,
    lat: (col === 0 ? -1 : 1) * GRID_LAT,
  };
}

// ---------------------------------------------------------------------------
// The leg table.  [length metres, heading change degrees]  (negative = left)
// Authored per circuit in TrackDefs.ts; baked from whichever def is active.
// ---------------------------------------------------------------------------
const LEGS: [number, number][] = ACTIVE_TRACK.legs;
const PLAN_LENGTH = LEGS.reduce((s, [len]) => s + len, 0);
const START_HEADING = ACTIVE_TRACK.startHeading * THREE.MathUtils.DEG2RAD;

// ---------------------------------------------------------------------------
// Keyframed channels.  All cyclic Catmull-Rom in t so the seam at the start
// line is C1 — a crease in the elevation right under the start banner is the
// kind of thing that gets a frame thrown back at you.
// ---------------------------------------------------------------------------
type Keys = [number, number][];

const ELEVATION: Keys = ACTIVE_TRACK.elevation;
const HALF_WIDTH: Keys = ACTIVE_TRACK.halfWidth;
const BANK: Keys = ACTIVE_TRACK.bank;

// Per-zone terrain + furniture: authored per circuit in TrackDefs.ts.
// The ZoneDef shape (and the reasoning behind the wall offsets) lives there.
import type { ZoneDef } from './TrackDefs';
export type { ZoneDef };
export const ZONES: ZoneDef[] = ACTIVE_TRACK.zones;

/** Boost strips, authored per circuit against its own widths. */
export const BOOST_PADS: { t0: number; t1: number; lat: number; hw: number }[] =
  ACTIVE_TRACK.boostPads;

/** Item-box rows around the lap, avoiding the boost strips. */
export const BOX_ROWS: number[] = ACTIVE_TRACK.boxRows;

/** Race length in laps; 1 = a sprint (see TrackDefs). */
export const RACE_LAPS: number = ACTIVE_TRACK.laps;

// ---------------------------------------------------------------------------
// Cyclic Catmull-Rom over keyframes
// ---------------------------------------------------------------------------
function cyclic(keys: Keys, t: number): number {
  const n = keys.length;
  t -= Math.floor(t);
  let i = n - 1;
  for (let k = 0; k < n; k++) if (keys[k][0] <= t) i = k; else break;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  // unwrap the parameter so spans that cross the seam still increase
  let x0 = k0[0], x1 = k1[0], x2 = k2[0], x3 = k3[0];
  if (x1 > t) x1 -= 1;
  while (x0 > x1) x0 -= 1;
  while (x2 < x1) x2 += 1;
  while (x3 < x2) x3 += 1;
  const u = (t - x1) / (x2 - x1);
  // non-uniform (centripetal-ish) Catmull-Rom tangents in value space
  const m1 = (k2[1] - k0[1]) / (x2 - x0) * (x2 - x1);
  const m2 = (k3[1] - k1[1]) / (x3 - x1) * (x2 - x1);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1[1] + (u3 - 2 * u2 + u) * m1
       + (-2 * u3 + 3 * u2) * k2[1] + (u3 - u2) * m2;
}

/**
 * Cyclic **monotone** cubic Hermite (Fritsch–Carlson) over keyframes.
 *
 * Catmull-Rom is the right interpolant for elevation and banking: it wants to
 * overshoot slightly, and that overshoot is what turns a keyed crest into a
 * crest with a shoulder on it. It is the wrong interpolant for road width.
 *
 * A tangent taken from the neighbours can send the curve *outside* the interval
 * its two keys bracket, which on this channel means a stretch of road that is
 * wider than either keyframe asked for — a bulge — or narrower, a pinch. On the
 * cliff traverse, where the schedule falls 6.4 → 5.7 → 5.4 in quick succession,
 * plain Catmull-Rom undershoots 5.4 by around 15 cm and then comes back, so the
 * ledge has a waist in it that nobody authored and that the kerbs, the edge
 * lines, the skirt and the barriers all faithfully reproduce.
 *
 * Fritsch–Carlson zeroes the tangent at every local extremum and takes the
 * harmonic mean of the two secants elsewhere. The result is still C1 — no
 * crease, nothing to snap as the player drives through it — but the curve is
 * confined to the box its keys bracket, so the width the table says is the
 * width the road is.
 */
function cyclicMonotone(keys: Keys, t: number): number {
  const n = keys.length;
  t -= Math.floor(t);
  let i = n - 1;
  for (let k = 0; k < n; k++) if (keys[k][0] <= t) i = k; else break;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  let x0 = k0[0], x1 = k1[0], x2 = k2[0], x3 = k3[0];
  if (x1 > t) x1 -= 1;
  while (x0 > x1) x0 -= 1;
  while (x2 < x1) x2 += 1;
  while (x3 < x2) x3 += 1;
  const h = x2 - x1;
  const d0 = (k1[1] - k0[1]) / (x1 - x0);
  const d1 = (k2[1] - k1[1]) / h;
  const d2 = (k3[1] - k2[1]) / (x3 - x2);
  // harmonic mean of the bracketing secants; zero wherever they disagree in
  // sign, which is exactly the condition for a local extremum
  const hm = (a: number, b: number) => (a * b <= 0 ? 0 : (2 * a * b) / (a + b));
  const m1 = hm(d0, d1), m2 = hm(d1, d2);
  const u = (t - x1) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1[1] + (u3 - 2 * u2 + u) * h * m1
       + (-2 * u3 + 3 * u2) * k2[1] + (u3 - u2) * h * m2;
}

// ---------------------------------------------------------------------------
// Baked centreline
// ---------------------------------------------------------------------------
export interface Centerline {
  count: number;
  length: number;
  ds: number;
  /** centreline position */
  px: Float32Array; py: Float32Array; pz: Float32Array;
  /** unit tangent */
  tx: Float32Array; ty: Float32Array; tz: Float32Array;
  /** banked normal ("up" of the road surface) */
  nx: Float32Array; ny: Float32Array; nz: Float32Array;
  /** banked binormal (road "right"); lateral offsets are measured along this */
  bx: Float32Array; by: Float32Array; bz: Float32Array;
  /** unbanked, essentially horizontal right — used for walls and terrain */
  hx: Float32Array; hy: Float32Array; hz: Float32Array;
  half: Float32Array;
  bank: Float32Array;
  /** signed curvature, 1/m (negative = turning left) */
  curv: Float32Array;
  /** lateral offset of the idealised racing line, metres */
  race: Float32Array;
  // --- zone-resolved, cross-faded ---
  nearL0: Float32Array; nearL1: Float32Array; nearL2: Float32Array;
  nearR0: Float32Array; nearR1: Float32Array; nearR2: Float32Array;
  farL: Float32Array; farDL: Float32Array; rockL: Float32Array;
  farR: Float32Array; farDR: Float32Array; rockR: Float32Array;
  shoulderL: Float32Array; shoulderR: Float32Array;
  surfL: Uint8Array; surfR: Uint8Array;
  wallL: Uint8Array; wallR: Uint8Array;
  wallOffL: Float32Array; wallOffR: Float32Array;
  cobble: Float32Array;
  kerb: Float32Array;
  zone: Uint8Array;
}

// ---------------------------------------------------------------------------
//  Corner detection
// ---------------------------------------------------------------------------

/**
 * One telegraphed corner: where it turns, which way, and how hard.
 *
 * ===========================================================================
 *  WHY THIS EXISTS, AND WHY THE OLD THRESHOLD WAS A BUG
 * ===========================================================================
 * `TrackGeometry` used to find corners with `Math.abs(cl.curv[i]) > 0.0125`,
 * pick the first station over that line and then lock out the next 150 m. On
 * *this* layout that gate fires in exactly one place. The leg table is authored
 * as heading changes, the schedule is box-blurred over 30 m to make clothoids,
 * and the curvature integral is then renormalised to exactly −2π, so what the
 * station table actually carries is:
 *
 *     harbour sweep      0.0091   (R 110 m)
 *     village esses      0.0099 – 0.0117
 *     cliff traverse     0.0109 – 0.0115
 *     beach descent      0.0040 – 0.0054
 *     banked coastal 180 0.0153   (R 65 m)   ← the only thing over 0.0125
 *     bridge approach    0.0121
 *     return             0.0053
 *
 * i.e. the entire corner-telegraph feature — braking boards, rumble strips,
 * sponsor paint, direction chevron — shipped on one corner out of nine, and
 * that one is at t≈0.76 where none of the review frames were taken. That is the
 * whole of the "no read-ahead cue anywhere" finding: the cues exist, the
 * detector never fires.
 *
 * So the gate is now a *radius* the layout actually contains (≈240 m), and the
 * detector is a proper segmentation rather than a first-past-the-post scan:
 * runs of constant turn direction, merged across short transitions, split into
 * roughly equal-heading-change pieces so a 260 m continuous left gets three
 * telegraphs rather than one, and pruned to a minimum spacing so two of them
 * never fight for the same stretch of road.
 */
export interface Corner {
  /** arc length of the mark point, metres */
  d: number;
  /** arc length where this corner's segment starts / ends */
  d0: number; d1: number;
  /** +1 turns right, −1 turns left. The *outside* of the corner is `-sign`. */
  sign: number;
  /** peak |curvature| through the segment, 1/m */
  k: number;
  /** heading change across the segment, radians */
  turn: number;
}

/** |curvature| a corner has to reach to be worth telegraphing (R ≈ 240 m) */
const CORNER_GATE = 0.0042;
/** a corner has to bend this far (radians) before it gets furniture — ~15° */
const CORNER_MIN_TURN = 0.26;
/** metres of sub-gate road that count as a transition rather than a straight */
const CORNER_MERGE = 26;
/** heading change per telegraph — a longer bend gets more than one (50°) */
const CORNER_PER = 0.87;
/** two marks closer than this collapse to the stronger of the pair */
const CORNER_MIN_GAP = 70;

export function findCorners(cl: Centerline): Corner[] {
  const n = cl.count, ds = cl.ds;
  const sgn = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    sgn[i] = Math.abs(cl.curv[i]) > CORNER_GATE ? (cl.curv[i] < 0 ? -1 : 1) : 0;
  }
  // Walk from a straight, so no corner ever straddles the seam of the array and
  // gets reported as two half corners with the start line between them.
  let start = 0;
  while (start < n && sgn[start] !== 0) start++;
  if (start >= n) return [];

  // maximal runs of one turn direction, in walk coordinates from `start`
  const runs: { a: number; b: number; sign: number }[] = [];
  for (let c = 0; c < n;) {
    const s = sgn[(start + c) % n];
    if (s === 0) { c++; continue; }
    let e = c;
    while (e < n && sgn[(start + e) % n] === s) e++;
    runs.push({ a: c, b: e, sign: s });
    c = e;
  }
  // an ess transition dips under the gate for a few metres; that is one corner
  // easing into the next, not a straight, and splitting there would put a set of
  // braking boards in the middle of a direction change
  const merged: { a: number; b: number; sign: number }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.sign === r.sign && (r.a - last.b) * ds < CORNER_MERGE) last.b = r.b;
    else merged.push({ a: r.a, b: r.b, sign: r.sign });
  }

  const out: Corner[] = [];
  for (const r of merged) {
    let total = 0;
    for (let c = r.a; c < r.b; c++) total += Math.abs(cl.curv[(start + c) % n]) * ds;
    if (total < CORNER_MIN_TURN) continue;
    const parts = Math.max(1, Math.min(4, Math.round(total / CORNER_PER)));
    const seg = total / parts;
    // Marked at the *middle* of each segment's heading change, not at the peak
    // of |curv|. On a constant-radius bend — which is most of this layout after
    // the blur — every station is the peak, so a peak-pick collapses all three
    // marks of the banked 180 onto its first station.
    let acc = 0, p = 0, kMax = 0, mark = -1, segA = r.a;
    for (let c = r.a; c < r.b; c++) {
      const k = Math.abs(cl.curv[(start + c) % n]);
      if (k > kMax) kMax = k;
      acc += k * ds;
      if (mark < 0 && acc >= seg * (p + 0.5)) mark = c;
      if (acc >= seg * (p + 1) - 1e-9 || c === r.b - 1) {
        if (mark < 0) mark = c;
        out.push({
          d: ((start + mark) % n) * ds,
          d0: ((start + segA) % n) * ds,
          d1: ((start + c) % n) * ds,
          sign: r.sign, k: kMax, turn: seg,
        });
        p++; kMax = 0; mark = -1; segA = c + 1;
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  const keep: Corner[] = [];
  for (const c of out) {
    const last = keep[keep.length - 1];
    if (last && c.d - last.d < CORNER_MIN_GAP) {
      if (c.k > last.k) keep[keep.length - 1] = c;
      continue;
    }
    keep.push(c);
  }
  return keep;
}

/** smoothstep; `a > b` is legal and gives a descending ramp */
function ss(a: number, b: number, x: number): number {
  if (b === a) return x < a ? 0 : 1;
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

function circularBoxBlur(src: Float64Array, n: number, halfCells: number, passes: number): Float64Array {
  let a = src;
  const inv = 1 / (2 * halfCells + 1);
  for (let p = 0; p < passes; p++) {
    const b = new Float64Array(n);
    let acc = 0;
    for (let i = -halfCells; i <= halfCells; i++) acc += a[((i % n) + n) % n];
    for (let i = 0; i < n; i++) {
      b[i] = acc * inv;
      acc -= a[((i - halfCells) % n + n) % n];
      acc += a[((i + halfCells + 1) % n + n) % n];
    }
    a = b;
  }
  return a;
}

export function buildCenterline(): Centerline {
  // ---- pass 1: integrate a smoothed curvature schedule in the XZ plane ----
  const DS0 = 0.25;
  const N0 = Math.round(PLAN_LENGTH / DS0);
  const raw = new Float64Array(N0);
  {
    let s = 0;
    for (const [len, turn] of LEGS) {
      const k = (turn * THREE.MathUtils.DEG2RAD) / len;
      const i0 = Math.round(s / DS0), i1 = Math.round((s + len) / DS0);
      for (let i = i0; i < i1; i++) raw[i] = k;
      s += len;
    }
  }
  const kap = circularBoxBlur(raw, N0, Math.round(30 / DS0 / 2), 2);
  let ksum = 0;
  for (let i = 0; i < N0; i++) ksum += kap[i] * DS0;
  const kscale = (-2 * Math.PI) / ksum; // exact 360° of left turn per lap

  const X = new Float64Array(N0 + 1), Z = new Float64Array(N0 + 1);
  {
    let th = START_HEADING, x = 0, z = 0;
    for (let i = 0; i < N0; i++) {
      X[i] = x; Z[i] = z;
      x += Math.cos(th) * DS0;
      z += Math.sin(th) * DS0;
      th += kap[i] * kscale * DS0;
    }
    X[N0] = x; Z[N0] = z;
    // Residual closure is a couple of centimetres; shear it away so the loop
    // is exactly closed rather than "closed enough".
    for (let i = 0; i <= N0; i++) {
      const f = i / N0;
      X[i] -= x * f; Z[i] -= z * f;
    }
  }
  const Y = new Float64Array(N0 + 1);
  for (let i = 0; i <= N0; i++) {
    const u = (i / N0) % 1;
    // macro profile + two periodic octaves so nothing is flat for long
    Y[i] = cyclic(ELEVATION, u)
      + 0.74 * Math.sin(u * Math.PI * 2 * 7 + 0.9)
      + 0.33 * Math.sin(u * Math.PI * 2 * 13 + 2.4);
  }

  // ---- pass 2: resample uniformly by true 3D arc length ------------------
  const cum = new Float64Array(N0 + 1);
  for (let i = 1; i <= N0; i++) {
    const dx = X[i] - X[i - 1], dy = Y[i] - Y[i - 1], dz = Z[i] - Z[i - 1];
    cum[i] = cum[i - 1] + Math.hypot(dx, dy, dz);
  }
  const length = cum[N0];
  const count = Math.round(length / STATION_DS);
  const ds = length / count;

  const c: any = { count, length, ds };
  const f32 = (n = count) => new Float32Array(n);
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'nx', 'ny', 'nz', 'bx', 'by', 'bz',
    'hx', 'hy', 'hz', 'half', 'bank', 'curv', 'race', 'nearL0', 'nearL1', 'nearL2',
    'nearR0', 'nearR1', 'nearR2', 'farL', 'farDL', 'rockL', 'farR', 'farDR', 'rockR',
    'shoulderL', 'shoulderR', 'wallOffL', 'wallOffR', 'cobble', 'kerb']) c[k] = f32();
  for (const k of ['surfL', 'surfR', 'wallL', 'wallR', 'zone']) c[k] = new Uint8Array(count);
  const cl = c as Centerline;

  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = i * ds;
    while (cursor < N0 - 1 && cum[cursor + 1] < target) cursor++;
    const seg = cum[cursor + 1] - cum[cursor];
    const f = seg > 1e-9 ? (target - cum[cursor]) / seg : 0;
    cl.px[i] = X[cursor] + (X[cursor + 1] - X[cursor]) * f;
    cl.py[i] = Y[cursor] + (Y[cursor + 1] - Y[cursor]) * f;
    cl.pz[i] = Z[cursor] + (Z[cursor + 1] - Z[cursor]) * f;
  }

  // ---- tangents (central difference on the closed loop) ------------------
  for (let i = 0; i < count; i++) {
    const a = (i - 1 + count) % count, b = (i + 1) % count;
    let dx = cl.px[b] - cl.px[a], dy = cl.py[b] - cl.py[a], dz = cl.pz[b] - cl.pz[a];
    const inv = 1 / Math.hypot(dx, dy, dz);
    cl.tx[i] = dx * inv; cl.ty[i] = dy * inv; cl.tz[i] = dz * inv;
  }

  // ---- rotation-minimising frame (double reflection, Wang et al.) --------
  // Frenet frames flip at inflection points; on a track with esses that would
  // roll the entire game world over. Parallel transport does not.
  const refX = new Float64Array(count), refY = new Float64Array(count), refZ = new Float64Array(count);
  {
    // seed the transported vector with the horizontal right of station 0
    let rx = -cl.tz[0], ry = 0, rz = cl.tx[0];
    let inv = 1 / Math.hypot(rx, ry, rz);
    rx *= inv; ry *= inv; rz *= inv;
    for (let i = 0; i < count; i++) {
      refX[i] = rx; refY[i] = ry; refZ[i] = rz;
      const j = (i + 1) % count;
      const v1x = cl.px[j] - cl.px[i], v1y = cl.py[j] - cl.py[i], v1z = cl.pz[j] - cl.pz[i];
      const c1 = v1x * v1x + v1y * v1y + v1z * v1z;
      if (c1 < 1e-12) continue;
      let d = (2 / c1) * (v1x * rx + v1y * ry + v1z * rz);
      const rlx = rx - d * v1x, rly = ry - d * v1y, rlz = rz - d * v1z;
      d = (2 / c1) * (v1x * cl.tx[i] + v1y * cl.ty[i] + v1z * cl.tz[i]);
      const tlx = cl.tx[i] - d * v1x, tly = cl.ty[i] - d * v1y, tlz = cl.tz[i] - d * v1z;
      const v2x = cl.tx[j] - tlx, v2y = cl.ty[j] - tly, v2z = cl.tz[j] - tlz;
      const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
      if (c2 < 1e-12) { rx = rlx; ry = rly; rz = rlz; continue; }
      d = (2 / c2) * (v2x * rlx + v2y * rly + v2z * rlz);
      rx = rlx - d * v2x; ry = rly - d * v2y; rz = rlz - d * v2z;
      inv = 1 / Math.hypot(rx, ry, rz);
      rx *= inv; ry *= inv; rz *= inv;
    }
    // Transport around a closed loop leaves a residual twist. Measure it at
    // the seam and unwind it linearly so the frame is continuous through the
    // start line.
    const r0x = refX[0], r0y = refY[0], r0z = refZ[0];
    const tX = cl.tx[0], tY = cl.ty[0], tZ = cl.tz[0];
    // component of the returned frame against the seed, about the tangent
    const upx = tY * r0z - tZ * r0y, upy = tZ * r0x - tX * r0z, upz = tX * r0y - tY * r0x;
    const cosA = rx * r0x + ry * r0y + rz * r0z;
    const sinA = rx * upx + ry * upy + rz * upz;
    const resid = Math.atan2(sinA, cosA);
    for (let i = 0; i < count; i++) {
      const a = -resid * (i / count);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ux = cl.ty[i] * refZ[i] - cl.tz[i] * refY[i];
      const uy = cl.tz[i] * refX[i] - cl.tx[i] * refZ[i];
      const uz = cl.tx[i] * refY[i] - cl.ty[i] * refX[i];
      refX[i] = refX[i] * ca + ux * sa;
      refY[i] = refY[i] * ca + uy * sa;
      refZ[i] = refZ[i] * ca + uz * sa;
    }
  }

  // ---- widths, banking, banked frame, curvature --------------------------
  for (let i = 0; i < count; i++) {
    const t = i / count;
    cl.half[i] = cyclicMonotone(HALF_WIDTH, t);
    const b = cyclic(BANK, t) * THREE.MathUtils.DEG2RAD;
    cl.bank[i] = b;

    // Unbanked frame. The horizontal-reference right vector is the correct
    // choice for a road: it is exactly rotation-minimising (zero roll by
    // construction), it cannot flip the way a Frenet binormal does at an
    // inflection, and — unlike parallel transport — it never drifts out of
    // horizontal, which matters because the terrain sweeps laterally along it
    // and a 14° drift tears a 6 m step into the shoulder. Parallel transport
    // is kept as the fallback for a tangent close to vertical, where the
    // horizontal reference degenerates; this circuit never gets there, but a
    // future loop-the-loop would.
    let hx: number, hy: number, hz: number;
    if (Math.abs(cl.ty[i]) < 0.985) {
      hx = -cl.tz[i]; hy = 0; hz = cl.tx[i];
      const inv = 1 / Math.hypot(hx, hz);
      hx *= inv; hz *= inv;
    } else {
      hx = refX[i]; hy = refY[i]; hz = refZ[i];
    }
    cl.hx[i] = hx; cl.hy[i] = hy; cl.hz[i] = hz;
    const n0x = hy * cl.tz[i] - hz * cl.ty[i];
    const n0y = hz * cl.tx[i] - hx * cl.tz[i];
    const n0z = hx * cl.ty[i] - hy * cl.tx[i];
    const cb = Math.cos(b), sb = Math.sin(b);
    // rotate about the tangent: right gains +up as bank goes positive
    cl.bx[i] = hx * cb + n0x * sb;
    cl.by[i] = hy * cb + n0y * sb;
    cl.bz[i] = hz * cb + n0z * sb;
    cl.nx[i] = n0x * cb - hx * sb;
    cl.ny[i] = n0y * cb - hy * sb;
    cl.nz[i] = n0z * cb - hz * sb;
  }
  for (let i = 0; i < count; i++) {
    const a = (i - 1 + count) % count, b = (i + 1) % count;
    // signed curvature about world up, matching the leg-table convention
    const t1x = cl.tx[a], t1z = cl.tz[a], t2x = cl.tx[b], t2z = cl.tz[b];
    const cross = t1x * t2z - t1z * t2x;
    const dot = t1x * t2x + t1z * t2z;
    cl.curv[i] = Math.atan2(cross, dot) / (2 * ds);
  }

  // ---- idealised racing line: outside-in-outside falls out of smoothing --
  {
    const rawLat = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const k = cl.curv[i];
      const strength = Math.min(1, Math.abs(k) * 140);
      rawLat[i] = Math.sign(k) * strength * cl.half[i] * 0.52;
    }
    const sm = circularBoxBlur(rawLat, count, Math.round(46 / ds), 2);
    for (let i = 0; i < count; i++) cl.race[i] = sm[i];
  }

  // ---- zone-resolved terrain / furniture ---------------------------------
  const nz = ZONES.length;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    // find the owning zone and the cross-fade partner
    let zi = nz - 1;
    for (let k = 0; k < nz; k++) if (ZONES[k].t0 <= t) zi = k; else break;
    const nextI = (zi + 1) % nz;
    const nextT0 = nextI === 0 ? 1 : ZONES[nextI].t0;
    let a = zi, b = zi, w = 0;
    const fIn = ZONES[zi].fade, fOut = ZONES[nextI].fade;
    if (t < ZONES[zi].t0 + fIn) {
      a = (zi - 1 + nz) % nz; b = zi;
      w = ss(ZONES[zi].t0 - fIn, ZONES[zi].t0 + fIn, t);
    } else if (t > nextT0 - fOut) {
      a = zi; b = nextI;
      w = ss(nextT0 - fOut, nextT0 + fOut, t);
    }
    const A = ZONES[a], B = ZONES[b];
    const mix = (x: number, y: number) => x + (y - x) * w;
    cl.zone[i] = w < 0.5 ? a : b;
    cl.nearL0[i] = mix(A.nearL[0], B.nearL[0]);
    cl.nearL1[i] = mix(A.nearL[1], B.nearL[1]);
    cl.nearL2[i] = mix(A.nearL[2], B.nearL[2]);
    cl.nearR0[i] = mix(A.nearR[0], B.nearR[0]);
    cl.nearR1[i] = mix(A.nearR[1], B.nearR[1]);
    cl.nearR2[i] = mix(A.nearR[2], B.nearR[2]);
    cl.farL[i] = mix(A.farL, B.farL); cl.farDL[i] = mix(A.farDL, B.farDL);
    cl.farR[i] = mix(A.farR, B.farR); cl.farDR[i] = mix(A.farDR, B.farDR);
    cl.rockL[i] = mix(A.rockL, B.rockL); cl.rockR[i] = mix(A.rockR, B.rockR);
    cl.shoulderL[i] = mix(A.shoulderL, B.shoulderL);
    cl.shoulderR[i] = mix(A.shoulderR, B.shoulderR);
    cl.cobble[i] = mix(A.cobble, B.cobble);
    cl.kerb[i] = mix(A.kerb, B.kerb);
    const dom = w < 0.5 ? A : B;
    cl.surfL[i] = dom.surfL; cl.surfR[i] = dom.surfR;
    // A wall either exists or it does not — blending its lateral offset while
    // both ends agree on the type is fine, but never blend the type itself.
    if (A.wallL === B.wallL) { cl.wallL[i] = A.wallL; cl.wallOffL[i] = mix(A.wallOffL, B.wallOffL); }
    else { cl.wallL[i] = dom.wallL; cl.wallOffL[i] = dom.wallOffL; }
    if (A.wallR === B.wallR) { cl.wallR[i] = A.wallR; cl.wallOffR[i] = mix(A.wallOffR, B.wallOffR); }
    else { cl.wallR[i] = dom.wallR; cl.wallOffR[i] = dom.wallOffR; }
  }

  return cl;
}

// ---------------------------------------------------------------------------
// Terrain detail noise — shared verbatim by the mesh builder and by probe(),
// which is the only way the two can agree to the millimetre.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(1907240611);
const noiseA = createNoise2D(rnd);
const noiseB = createNoise2D(rnd);
const noiseC = createNoise2D(rnd);

/**
 * Detail displacement added on top of the macro heightfield.
 * `q` is metres from the road shoulder, `rock` the local rockiness.
 */
export function terrainDetail(x: number, z: number, q: number, rock: number): number {
  const amp = ss(3, 34, q);
  if (amp <= 0) return 0;
  const a = noiseA(x * 0.0125, z * 0.0125) * 3.1;
  const b = noiseB(x * 0.041, z * 0.041) * 0.85;
  // ridged octave, only where the ground is rocky — gives cliffs their fracture
  const rr = 1 - Math.abs(noiseC(x * 0.026, z * 0.026));
  const c = (rr * rr - 0.45) * 5.2 * rock;
  return amp * (a + b + c);
}

export { ss as smoothstep };
