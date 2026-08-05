/**
 * ============================================================================
 *  Track definitions — the data that makes one circuit different from another
 * ============================================================================
 *  `TrackLayout.ts` bakes whatever definition is ACTIVE here into the station
 *  table the rest of the game runs on. Everything a layout is allowed to vary
 *  lives on `TrackDef`; everything physical that must agree across tracks
 *  (kerb cross-section, tunnel bore clearance, parapet faces) stays a plain
 *  constant so collision and meshes can never disagree between circuits.
 *
 *  The active track is chosen at module-evaluation time — before `Track` is
 *  constructed at `main.ts` module scope — from `?track=` first, then
 *  `localStorage`. The track-select screen writes the localStorage key and
 *  reloads; boot is already behind the loading curtain, so a reload reads as
 *  an intentional transition rather than a failure.
 * ============================================================================
 */
import { Surface } from '../types';

// --- physical constants shared by every circuit ----------------------------
/** lateral width of the kerb band, sitting OUTSIDE `halfWidth` */
export const KERB_W = 1.6;
/** Half-width the tunnel bore springs from: road edge + kerb + a reveal. */
export const TUNNEL_CLEAR = KERB_W + 0.8;
/** Crown height of the bore above the road plane. */
export const TUNNEL_H = 7.6;
/** Outer plane of the bridge parapet; its coping chamfers 0.62 m back inboard. */
export const PARAPET_OFF = KERB_W + 0.70;
/** Inboard face of that parapet — what a kart actually hits. */
export const PARAPET_FACE = PARAPET_OFF - 0.62;
/** Deck fascia / spandrel wall, just outboard of the parapet. */
export const FASCIA_OFF = PARAPET_OFF + 0.12;

// wall kinds
export const WALL_NONE = 0;
export const WALL_GUARDRAIL = 1;
export const WALL_ROCK = 2;
export const WALL_PARAPET = 3;
export const WALL_HEIGHT = [0, 0.92, 4.5, 1.15];

export type Keys = [number, number][];

/**
 * Per-zone terrain + furniture description.
 *   near[]  : vertical offset from the shoulder edge at q = 0 / 3 / 12 metres
 *   far     : absolute world height the land settles at, far from the road
 *   farD    : distance over which it gets there
 *   rock    : 0..1 rockiness, drives triplanar rock blending in the material
 */
export interface ZoneDef {
  t0: number;
  fade: number;
  name: string;
  nearL: [number, number, number];
  farL: number;
  farDL: number;
  rockL: number;
  shoulderL: number;
  surfL: Surface;
  wallL: number;
  wallOffL: number;
  nearR: [number, number, number];
  farR: number;
  farDR: number;
  rockR: number;
  shoulderR: number;
  surfR: Surface;
  wallR: number;
  wallOffR: number;
  /** 0 = tarmac, 1 = cobblestone */
  cobble: number;
  /** kerbs suppressed on the bridge deck */
  kerb: number;
}

export interface TrackDef {
  id: string;
  name: string;
  /** boot progress label for the scenery pass */
  dressLabel: string;
  /** which set of bespoke scenery dressers runs — see Scenery.init */
  kit: 'coastal' | 'gridline';
  /**
   * Race length in laps. 1 makes the event a SPRINT: one standing-start run
   * from the line back round to it, presented without a lap counter. The
   * engine's closed-loop invariants (cyclic centreline, checkpoints, AI line)
   * are untouched — a sprint is a race that ends after the first tour.
   */
  laps: number;
  /** [length metres, heading change degrees] (negative = left) */
  legs: [number, number][];
  startHeading: number;
  elevation: Keys;
  halfWidth: Keys;
  bank: Keys;
  zones: ZoneDef[];
  /** tunnel / bridge spans in t, or null when the circuit has none */
  tunnel: [number, number] | null;
  bridge: [number, number] | null;
  boostPads: { t0: number; t1: number; lat: number; hw: number }[];
  /** rows of item boxes around the lap, avoiding the boost strips */
  boxRows: number[];
  /** t-ranges where sponsor hoardings run dense */
  hoardingZones: [number, number][];
}

// ===========================================================================
//  SUNSET BAY CIRCUIT — the original coastal layout, tables verbatim
// ===========================================================================
const SUNSET_BAY: TrackDef = {
  id: 'sunset-bay',
  name: 'Vice Bay Circuit',
  dressLabel: 'dressing the bay',
  kit: 'coastal',
  laps: 3,
  legs: [
    [160, -13.85],  // 0.000 start straight — harbour boulevard
    [192, -102.06], // 0.100 harbour sweep
    [70, -44.48],   // 0.220 village ess A (left)
    [60, 40.84],    // 0.264 village ess B (right)
    [66, -44.12],   // 0.301 village ess C (left, off-camber)
    [60, -20.79],   // 0.343 village ess D (left)
    [90, -21.02],   // 0.380 cliff traverse A
    [74, -4.13],    // 0.436 cliff traverse B
    [60, -17.70],   // 0.482 cliff traverse C
    [128, -21.13],  // 0.520 tunnel
    [110, -2.81],   // 0.600 beach descent A
    [114, -21.15],  // 0.669 beach descent B
    [192, -170.85], // 0.740 banked coastal 180
    [60, 42.32],    // 0.860 bridge approach
    [84, 11.22],    // 0.897 bridge span
    [80, 24.47],    // 0.950 return to the line
  ],
  startHeading: 45,
  elevation: [
    [0.000, 3.0], [0.100, 3.6], [0.220, 7.0], [0.300, 15.0],
    [0.380, 29.0], [0.440, 41.5], [0.500, 38.0], [0.560, 33.0],
    [0.600, 28.0], [0.660, 16.0], [0.720, 5.5], [0.800, 14.0],
    // the run off the bridge flattens out well before the line so the standing
    // grid is level rather than stacked down a 14% slope
    [0.860, 24.0], [0.900, 19.5], [0.935, 14.5], [0.962, 9.0],
    [0.982, 4.6], [0.995, 3.15],
  ],
  halfWidth: [
    [0.000, 8.8],   // start straight — the pack launches eight-up, needs the room
    [0.070, 8.6],
    [0.140, 8.1],   // harbour sweep, tightening
    [0.210, 7.5],
    [0.270, 7.0],   // village: terraced houses press in on both sides
    [0.330, 6.8],
    [0.380, 6.4],   // cliff traverse begins
    [0.440, 5.7],
    [0.480, 5.4],   // narrowest point of the circuit — 10.8 m of ledge
    [0.521, 5.9],   // tunnel mouth opens back out a little
    [0.560, 6.3],
    [0.620, 6.9],   // beach descent, fast, opening
    [0.700, 7.6],
    [0.760, 8.8],   // banked coastal 180 — the money shot, and a real passing lane
    [0.830, 8.7],
    [0.880, 7.2],   // bridge approach pinches
    [0.930, 7.0],   // bridge deck, between the parapets
    [0.968, 8.2],   // back onto the harbour front
  ],
  bank: [
    [0.000, 0], [0.070, 0], [0.130, 7], [0.170, 9.5], [0.210, 5],
    [0.240, 4], [0.265, 5],
    [0.283, -6],   // village ess B is a right-hander: bank the correct way
    [0.312, -4],   // ...and ess C is a LEFT-hander held at negative bank:
    [0.330, -4],   //    genuinely off-camber, exactly as the bible asks
    [0.348, 0], [0.366, 4], [0.400, 3], [0.440, 2], [0.482, 3],
    [0.520, 4], [0.560, 5], [0.600, 3], [0.660, 2], [0.700, 6],
    [0.735, 12], [0.775, 20], [0.820, 20], [0.848, 12], [0.870, 2],
    [0.893, -5], [0.925, -3], [0.958, -6], [0.985, -2],
  ],
  zones: [
    { t0: 0.000, fade: 0.016, name: 'start',
      nearL: [0, -0.4, 1.6], farL: 16, farDL: 110, rockL: 0.1, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.6, -3.4], farR: -6, farDR: 60, rockR: 0.25, shoulderR: 7, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.6,
      cobble: 0, kerb: 1 },
    { t0: 0.100, fade: 0.016, name: 'harbour',
      nearL: [0, -0.4, 2.0], farL: 22, farDL: 130, rockL: 0.12, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.8, -3.6], farR: -6, farDR: 50, rockR: 0.3, shoulderR: 5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.220, fade: 0.020, name: 'village',
      nearL: [0, -0.5, 2.6], farL: 34, farDL: 120, rockL: 0.2, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_GUARDRAIL, wallOffL: 2.7,
      nearR: [-0.3, -1.4, -4.0], farR: -6, farDR: 130, rockR: 0.3, shoulderR: 5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.7,
      cobble: 1, kerb: 1 },
    { t0: 0.380, fade: 0.014, name: 'cliff',
      nearL: [0, 1.6, 14], farL: 64, farDL: 100, rockL: 0.95, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.4, -9, -32], farR: -7, farDR: 38, rockR: 0.95, shoulderR: 1.5, surfR: Surface.Dirt, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.521, fade: 0.013, name: 'tunnel',
      // 0.15 m inboard of the bore wall, so the collision catches a kart before
      // the camera can see it kiss the rock rather than 1.4 m early as before
      nearL: [0, 2.6, 15], farL: 54, farDL: 90, rockL: 1, shoulderL: 3, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: TUNNEL_CLEAR - 0.15,
      nearR: [0, 1.0, 10], farR: 40, farDR: 90, rockR: 1, shoulderR: 3, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: TUNNEL_CLEAR - 0.15,
      cobble: 0, kerb: 1 },
    { t0: 0.600, fade: 0.024, name: 'beach',
      nearL: [0, -0.5, 1.5], farL: 26, farDL: 130, rockL: 0.35, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_NONE, wallOffL: 0,
      nearR: [-0.4, -1.6, -3.0], farR: -6, farDR: 90, rockR: 0.05, shoulderR: 12, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.740, fade: 0.016, name: 'banked',
      nearL: [0, -0.4, 2.5], farL: 34, farDL: 140, rockL: 0.3, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.6,
      nearR: [-1.0, -4.5, -15], farR: -7, farDR: 46, rockR: 0.55, shoulderR: 10, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.860, fade: 0.012, name: 'approach',
      nearL: [0, -0.5, 1.0], farL: 22, farDL: 120, rockL: 0.3, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_NONE, wallOffL: 0,
      nearR: [-0.5, -2.0, -6], farR: -7, farDR: 90, rockR: 0.45, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.893, fade: 0.006, name: 'bridge',
      // PARAPET_FACE, not a hand-typed 1.7: the old number put the collision
      // plane 0.4 m OUTBOARD of the stone the kart can see, so on a narrow deck
      // karts visibly buried a corner in the parapet before anything stopped them
      nearL: [-1.5, -9, -20], farL: -6, farDL: 46, rockL: 0.8, shoulderL: 0.6, surfL: Surface.Dirt, wallL: WALL_PARAPET, wallOffL: PARAPET_FACE,
      nearR: [-1.5, -9, -20], farR: -6, farDR: 46, rockR: 0.8, shoulderR: 0.6, surfR: Surface.Dirt, wallR: WALL_PARAPET, wallOffR: PARAPET_FACE,
      cobble: 0.55, kerb: 0 },
    { t0: 0.950, fade: 0.008, name: 'return',
      nearL: [0, -0.4, 1.4], farL: 18, farDL: 120, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.8, -4.0], farR: -6, farDR: 80, rockR: 0.25, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 3.4,
      cobble: 0, kerb: 1 },
  ],
  tunnel: [0.521, 0.599],
  bridge: [0.893, 0.950],
  boostPads: [
    { t0: 0.5380, t1: 0.5555, lat: -2.9, hw: 1.9 },
    { t0: 0.5380, t1: 0.5555, lat: 2.9, hw: 1.9 },
    { t0: 0.5720, t1: 0.5895, lat: 0.0, hw: 2.6 },
    { t0: 0.9575, t1: 0.9740, lat: -3.1, hw: 2.2 },
    { t0: 0.9575, t1: 0.9740, lat: 3.1, hw: 2.2 },
  ],
  boxRows: [0.052, 0.148, 0.246, 0.336, 0.428, 0.505, 0.646, 0.712, 0.802, 0.906],
  hoardingZones: [[0, 0.105], [0.455, 0.605]],
};

// ===========================================================================
//  NEON HORIZON GP — fast, flowing, and built for the synthwave dusk
//
//  Leg turns were min-norm Newton-solved against the same blur + renormalise +
//  integrate pipeline `buildCenterline` runs (residual 1 cm before the shear),
//  so the loop closes exactly the way Sunset Bay's does. Character: a long
//  left sweeper onto an esplanade, a dive to a shoreline straight at sea
//  level, a ridge climb with a rock wall, a high banked carousel overlooking
//  the water, and an off-camber chicane onto the run home. No tunnel, no
//  bridge — open sky the whole lap.
// ===========================================================================
const NEON_HORIZON: TrackDef = {
  id: 'neon-horizon',
  name: 'Neon Horizon GP',
  dressLabel: 'stringing the neon',
  kit: 'gridline',
  laps: 3,
  legs: [
    [230, -16.95],  // 0.000 start straight
    [110, -100.03], // 0.163 T1 sweeping left
    [190, -22.23],  // 0.241 esplanade
    [85, -74.65],   // 0.376 T2 diving to the shore
    [180, 8.17],    // 0.436 shore straight, sea level
    [60, 59.91],    // 0.564 T3 right flick into the climb
    [75, -35.89],   // 0.606 T4 over the crest
    [95, -86.23],   // 0.660 carousel A — banked, high over the water
    [90, -76.44],   // 0.727 carousel B
    [70, 47.72],    // 0.791 chicane in (right, off-camber)
    [55, -49.09],   // 0.840 chicane out (left)
    [170, -27.67],  // 0.879 run home
  ],
  startHeading: 45,
  elevation: [
    [0.000, 4.0], [0.080, 4.6], [0.160, 5.5], [0.240, 4.2],
    [0.320, 3.4], [0.400, 2.8], [0.500, 3.0], [0.560, 5.5],
    [0.620, 12.0], [0.680, 20.0], [0.730, 24.0], [0.790, 18.0],
    [0.840, 12.0], [0.890, 8.0], [0.940, 5.6], [0.980, 4.4],
  ],
  halfWidth: [
    [0.000, 8.8],   // eight-up standing start
    [0.070, 8.4],
    [0.160, 7.6],   // T1
    [0.240, 7.4],
    [0.300, 7.8],   // esplanade breathes
    [0.376, 7.6],
    [0.440, 7.2],   // shore straight
    [0.500, 7.4],
    [0.560, 6.6],   // pinching into the climb
    [0.600, 5.9],
    [0.640, 5.7],   // narrowest — the ridge ledge
    [0.700, 6.8],
    [0.730, 8.6],   // carousel — wide, banked, a passing lane
    [0.800, 8.5],
    [0.840, 7.4],   // chicane
    [0.880, 6.8],
    [0.920, 7.2],
    [0.960, 8.2],   // back to the line
  ],
  bank: [
    [0.000, 0], [0.100, 8], [0.160, 4], [0.200, 6], [0.300, 2],
    [0.400, 3], [0.440, 5], [0.520, 2], [0.600, 6], [0.660, 4],
    [0.710, 10], [0.750, 20], [0.800, 20], [0.830, 8],
    [0.845, -4],   // chicane entry is a right-hander held off-camber
    [0.865, -2], [0.890, 3], [0.930, 0], [0.970, 0],
  ],
  zones: [
    { t0: 0.000, fade: 0.016, name: 'start',
      nearL: [0, -0.4, 1.6], farL: 16, farDL: 110, rockL: 0.1, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.6, -3.4], farR: -6, farDR: 60, rockR: 0.25, shoulderR: 7, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.6,
      cobble: 0, kerb: 1 },
    { t0: 0.160, fade: 0.020, name: 'sweep',
      nearL: [0, -0.4, 2.0], farL: 20, farDL: 130, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.2,
      nearR: [-0.4, -1.8, -3.6], farR: -6, farDR: 55, rockR: 0.25, shoulderR: 5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.360, fade: 0.024, name: 'shore',
      nearL: [0, -0.5, 1.5], farL: 24, farDL: 130, rockL: 0.3, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_NONE, wallOffL: 0,
      nearR: [-0.4, -1.6, -3.0], farR: -6, farDR: 90, rockR: 0.05, shoulderR: 12, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.590, fade: 0.014, name: 'ridge',
      nearL: [0, 1.6, 14], farL: 55, farDL: 100, rockL: 0.95, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.4, -9, -28], farR: -7, farDR: 40, rockR: 0.9, shoulderR: 1.5, surfR: Surface.Dirt, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.715, fade: 0.016, name: 'carousel',
      nearL: [0, -0.4, 2.5], farL: 32, farDL: 140, rockL: 0.3, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.6,
      nearR: [-1.0, -4.5, -15], farR: -7, farDR: 46, rockR: 0.5, shoulderR: 10, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.845, fade: 0.012, name: 'chicane',
      nearL: [0, -0.5, 1.8], farL: 20, farDL: 120, rockL: 0.2, shoulderL: 6, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 2.7,
      nearR: [-0.3, -1.4, -3.6], farR: -6, farDR: 100, rockR: 0.25, shoulderR: 6, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 2.7,
      cobble: 0, kerb: 1 },
    { t0: 0.905, fade: 0.008, name: 'return',
      nearL: [0, -0.4, 1.4], farL: 18, farDL: 120, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.8, -4.0], farR: -6, farDR: 80, rockR: 0.25, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 3.4,
      cobble: 0, kerb: 1 },
  ],
  tunnel: null,
  bridge: null,
  boostPads: [
    { t0: 0.2900, t1: 0.3070, lat: -2.9, hw: 1.9 },
    { t0: 0.2900, t1: 0.3070, lat: 2.9, hw: 1.9 },
    { t0: 0.5050, t1: 0.5220, lat: 0.0, hw: 2.6 },
    { t0: 0.9450, t1: 0.9620, lat: -3.0, hw: 2.0 },
    { t0: 0.9450, t1: 0.9620, lat: 3.0, hw: 2.0 },
  ],
  boxRows: [0.055, 0.150, 0.245, 0.345, 0.445, 0.545, 0.645, 0.755, 0.870],
  hoardingZones: [[0, 0.105], [0.68, 0.80]],
};

// ===========================================================================
//  SUMMIT SPRINT — one lap, flat out, over the mountain
//
//  A point-to-point event on a closed loop: a 2.17 km journey raced ONCE from
//  a standing start. Seafront boulevard, a long left onto the lower ramp, two
//  hairpin switchbacks climbing the face, a tunnel bored through the summit at
//  54 m, then a plunging sweeper, a banked seafront curve and a flat-out drag
//  back to the line. Leg turns min-norm Newton-solved (residual 2 cm) like the
//  other circuits.
// ===========================================================================
const SUMMIT_SPRINT: TrackDef = {
  id: 'summit-sprint',
  name: 'Summit Sprint',
  dressLabel: 'carving the summit',
  kit: 'gridline',
  laps: 1,
  legs: [
    [300, -15.48],  // 0.000 start boulevard on the seafront
    [110, -88.78],  // 0.138 T1 long left onto the lower ramp
    [180, 12.54],   // 0.189 lower ramp, gentle right drift
    [85, -146.32],  // 0.272 switchback 1 (left hairpin)
    [150, 8.94],    // 0.311 ramp 2
    [85, 148.39],   // 0.380 switchback 2 (right hairpin)
    [140, -8.84],   // 0.419 ramp 3
    [90, -65.61],   // 0.484 summit approach left
    [130, -13.04],  // 0.525 SUMMIT TUNNEL through the peak
    [190, -92.33],  // 0.585 plunging descent sweeper left
    [100, 38.43],   // 0.673 right flick mid-descent
    [220, -66.46],  // 0.719 banked seafront curve
    [90, -45.35],   // 0.820 harbour kink
    [300, -37.81],  // 0.862 finish drag
  ],
  startHeading: 45,
  elevation: [
    [0.000, 4.0], [0.070, 4.6], [0.140, 6.0], [0.200, 11.0],
    [0.270, 18.0], [0.310, 24.0], [0.380, 32.0], [0.420, 38.0],
    [0.480, 46.0], [0.525, 52.0], [0.555, 54.0], [0.585, 52.5],
    [0.640, 44.0], [0.700, 32.0], [0.760, 20.0], [0.820, 11.0],
    [0.870, 7.0], [0.930, 4.6], [0.975, 4.0],
  ],
  halfWidth: [
    [0.000, 8.8],   // eight-up standing start
    [0.080, 8.4],
    [0.140, 7.8],   // T1
    [0.200, 7.2],
    [0.270, 6.6],   // switchback 1 pinches
    [0.310, 6.2],
    [0.350, 6.6],
    [0.419, 6.2],   // switchback 2
    [0.460, 6.4],
    [0.500, 6.0],   // summit approach
    [0.527, 5.9],   // tunnel bore
    [0.560, 6.1],
    [0.590, 6.6],   // out of the mountain, opening
    [0.640, 7.6],
    [0.700, 8.0],
    [0.740, 8.4],   // banked seafront — the passing lane
    [0.820, 8.2],
    [0.862, 7.2],   // harbour kink
    [0.910, 7.6],
    [0.960, 8.4],   // the drag to the line
  ],
  bank: [
    [0.000, 0], [0.090, 6], [0.150, 8], [0.210, 4],
    [0.290, 10],   // switchback 1 is a left: banked in
    [0.335, 2],
    [0.395, -10],  // switchback 2 is a right: banked the other way
    [0.445, 2], [0.490, 5], [0.545, 4], [0.610, 8],
    [0.655, 12],   // plunging sweeper carries real bank
    [0.695, -6],   // right flick, briefly off-camber
    [0.740, 16], [0.790, 18], [0.835, 8], [0.875, 5],
    [0.930, 2], [0.975, 0],
  ],
  zones: [
    { t0: 0.000, fade: 0.016, name: 'start',
      nearL: [0, -0.4, 1.6], farL: 16, farDL: 110, rockL: 0.1, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.6, -3.4], farR: -6, farDR: 60, rockR: 0.25, shoulderR: 7, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.6,
      cobble: 0, kerb: 1 },
    { t0: 0.140, fade: 0.020, name: 'coast',
      nearL: [0, 0.4, 4.0], farL: 30, farDL: 110, rockL: 0.45, shoulderL: 6, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.0,
      nearR: [-0.5, -2.2, -5.0], farR: -6, farDR: 70, rockR: 0.35, shoulderR: 5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.270, fade: 0.016, name: 'switchbacks',
      nearL: [0, 1.6, 13], farL: 60, farDL: 90, rockL: 0.9, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.2, -8, -26], farR: -7, farDR: 60, rockR: 0.85, shoulderR: 1.5, surfR: Surface.Dirt, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.484, fade: 0.014, name: 'summit',
      nearL: [0, 2.0, 14], farL: 66, farDL: 90, rockL: 0.95, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [0, 1.0, 8], farR: 60, farDR: 90, rockR: 0.9, shoulderR: 4, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.525, fade: 0.013, name: 'tunnel',
      nearL: [0, 2.6, 15], farL: 62, farDL: 90, rockL: 1, shoulderL: 3, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: TUNNEL_CLEAR - 0.15,
      nearR: [0, 1.0, 10], farR: 58, farDR: 90, rockR: 1, shoulderR: 3, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: TUNNEL_CLEAR - 0.15,
      cobble: 0, kerb: 1 },
    { t0: 0.588, fade: 0.016, name: 'descent',
      nearL: [0, 1.4, 12], farL: 54, farDL: 100, rockL: 0.85, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.2, -7, -22], farR: -7, farDR: 55, rockR: 0.8, shoulderR: 2.0, surfR: Surface.Dirt, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.719, fade: 0.018, name: 'seafront',
      nearL: [0, -0.4, 2.5], farL: 26, farDL: 130, rockL: 0.3, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.6,
      nearR: [-0.8, -3.5, -10], farR: -6, farDR: 80, rockR: 0.2, shoulderR: 10, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.862, fade: 0.012, name: 'harbour',
      nearL: [0, -0.5, 1.8], farL: 20, farDL: 120, rockL: 0.2, shoulderL: 6, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 2.7,
      nearR: [-0.3, -1.4, -3.6], farR: -6, farDR: 90, rockR: 0.25, shoulderR: 6, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.7,
      cobble: 0, kerb: 1 },
    { t0: 0.930, fade: 0.008, name: 'return',
      nearL: [0, -0.4, 1.4], farL: 18, farDL: 120, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.8, -4.0], farR: -6, farDR: 80, rockR: 0.25, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 3.4,
      cobble: 0, kerb: 1 },
  ],
  tunnel: [0.527, 0.582],
  bridge: null,
  boostPads: [
    { t0: 0.5320, t1: 0.5490, lat: -2.9, hw: 1.9 },
    { t0: 0.5320, t1: 0.5490, lat: 2.9, hw: 1.9 },
    { t0: 0.6360, t1: 0.6530, lat: 0.0, hw: 2.6 },
    { t0: 0.9360, t1: 0.9530, lat: -3.0, hw: 2.0 },
    { t0: 0.9360, t1: 0.9530, lat: 3.0, hw: 2.0 },
  ],
  boxRows: [0.055, 0.160, 0.250, 0.345, 0.440, 0.510, 0.615, 0.690, 0.775, 0.885],
  hoardingZones: [[0, 0.10], [0.70, 0.84]],
};

// ===========================================================================
//  Registry + active-track resolution
// ===========================================================================
export const TRACKS: TrackDef[] = [SUNSET_BAY, NEON_HORIZON, SUMMIT_SPRINT];

export const TRACK_STORAGE_KEY = 'kr.track';

function resolveActive(): TrackDef {
  let id: string | null = null;
  try {
    id = new URLSearchParams(location.search).get('track');
    if (!id) id = localStorage.getItem(TRACK_STORAGE_KEY);
  } catch {
    // SSR / privacy mode — fall through to the default
  }
  return TRACKS.find((t) => t.id === id) ?? SUNSET_BAY;
}

export const ACTIVE_TRACK: TrackDef = resolveActive();
export const TRACK_ID = ACTIVE_TRACK.id;
export const TRACK_NAME = ACTIVE_TRACK.name;
