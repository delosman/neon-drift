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
  // Waypoint-designed plan: an ELONGATED GP loop — nothing like the bay's
  // kidney. Long start straight, a fast multi-apex end loop, a shore straight
  // on the sea, a ridge notch, a banked west carousel, and the run home.
  legs: [
    [324, -25.98],  // v0  0.000 start straight
    [76, -43.68],   // v1  0.207 end loop in
    [73, -60.62],   // v2  0.256 end loop apex
    [82, -44.47],   // v3  0.303 end loop out
    [86, -11.90],   // v4  0.355 exit kink
    [128, 30.57],   // v5  0.411 shore straight (right drift)
    [69, 19.16],    // v6  0.492 shore kink
    [106, -48.12],  // v7  0.536 ridge notch in
    [85, -70.73],   // v8  0.604 notch apex
    [88, 43.57],    // v9  0.659 notch out (right)
    [74, -37.91],   // v10 0.715 carousel in
    [91, -35.81],   // v11 0.763 carousel apex
    [78, -53.24],   // v12 0.821 carousel out
    [90, -30.00],   // v13 0.871 chicane sweep
    [111, 8.07],    // v14 0.929 run home
  ],
  startHeading: 0,
  elevation: [
    [0.000, 3.5], [0.100, 4.2], [0.207, 5.0], [0.300, 6.5],
    [0.411, 3.4], [0.470, 2.8], [0.536, 4.0], [0.600, 9.0],
    [0.660, 14.0], [0.715, 17.0], [0.800, 13.0], [0.871, 8.0],
    [0.930, 5.0], [0.970, 3.8],
  ],
  halfWidth: [
    [0.000, 8.8], [0.090, 8.3], [0.207, 7.6], [0.260, 7.2],
    [0.320, 7.4], [0.411, 8.0], [0.490, 7.8], [0.536, 6.6],
    [0.600, 5.9], [0.660, 6.2], [0.715, 8.4], [0.800, 8.3],
    [0.871, 7.0], [0.930, 7.6], [0.970, 8.4],
  ],
  bank: [
    [0.000, 0], [0.120, 4], [0.207, 8], [0.260, 10], [0.320, 8],
    [0.380, 4], [0.411, 2], [0.470, -3], [0.500, -5],
    [0.536, 4], [0.600, 7], [0.660, 6],
    [0.715, 12], [0.760, 18], [0.820, 16],
    [0.871, -4], [0.900, -2], [0.950, 0],
  ],
  zones: [
    { t0: 0.000, fade: 0.016, name: 'start',
      nearL: [0, -0.4, 1.6], farL: 16, farDL: 110, rockL: 0.1, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.6, -3.4], farR: -6, farDR: 60, rockR: 0.25, shoulderR: 7, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.6,
      cobble: 0, kerb: 1 },
    { t0: 0.190, fade: 0.020, name: 'sweep',
      nearL: [0, -0.4, 2.0], farL: 20, farDL: 130, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.2,
      nearR: [-0.4, -1.8, -3.6], farR: -6, farDR: 55, rockR: 0.25, shoulderR: 5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.400, fade: 0.024, name: 'shore',
      nearL: [0, -0.5, 1.5], farL: 24, farDL: 130, rockL: 0.3, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_NONE, wallOffL: 0,
      nearR: [-0.4, -1.6, -3.0], farR: -6, farDR: 90, rockR: 0.05, shoulderR: 12, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.530, fade: 0.014, name: 'ridge',
      nearL: [0, 1.6, 14], farL: 50, farDL: 100, rockL: 0.95, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.4, -9, -28], farR: -7, farDR: 40, rockR: 0.9, shoulderR: 1.5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.705, fade: 0.016, name: 'carousel',
      nearL: [0, -0.4, 2.5], farL: 30, farDL: 140, rockL: 0.3, shoulderL: 8, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.6,
      nearR: [-1.0, -4.5, -15], farR: -7, farDR: 46, rockR: 0.5, shoulderR: 10, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.865, fade: 0.012, name: 'chicane',
      nearL: [0, -0.5, 1.8], farL: 18, farDL: 120, rockL: 0.2, shoulderL: 6, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 2.7,
      nearR: [-0.3, -1.4, -3.6], farR: -6, farDR: 100, rockR: 0.25, shoulderR: 6, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 2.7,
      cobble: 0, kerb: 1 },
    { t0: 0.925, fade: 0.008, name: 'return',
      nearL: [0, -0.4, 1.4], farL: 18, farDL: 120, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.8, -4.0], farR: -6, farDR: 80, rockR: 0.25, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 3.4,
      cobble: 0, kerb: 1 },
  ],
  tunnel: null,
  bridge: null,
  boostPads: [
    { t0: 0.4350, t1: 0.4520, lat: -2.9, hw: 1.9 },
    { t0: 0.4350, t1: 0.4520, lat: 2.9, hw: 1.9 },
    { t0: 0.3700, t1: 0.3870, lat: 0.0, hw: 2.4 },
    { t0: 0.9450, t1: 0.9620, lat: -3.0, hw: 2.0 },
    { t0: 0.9450, t1: 0.9620, lat: 3.0, hw: 2.0 },
  ],
  boxRows: [0.055, 0.160, 0.260, 0.350, 0.460, 0.570, 0.670, 0.780, 0.900],
  hoardingZones: [[0, 0.10], [0.70, 0.87]],
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
  // Waypoint-designed plan: a SWITCHBACK LADDER. Shore start, three stacked
  // hairpin rungs up the west face, a tunnel through the summit ridge, then
  // one long eastern plunge back to a seafront drag. The zigzag silhouette is
  // the point — nothing else on the roster looks remotely like it.
  legs: [
    [191, 25.69],    // v0  0.000 shore start
    [88, 41.79],     // v1  0.089 shore curve
    [74, 64.56],     // v2  0.130 climb-in
    [77, 43.70],     // v3  0.165 base turn
    [154, -46.55],   // v4  0.200 rung 1 (west)
    [55, -115.86],   // v5  0.272 hairpin L
    [155, 44.05],    // v6  0.297 rung 2 (east)
    [61, 119.51],    // v7  0.369 hairpin R
    [157, -26.20],   // v8  0.398 rung 3 (west)
    [77, -94.45],    // v9  0.471 summit turn
    [95, -43.95],    // v10 0.506 summit approach
    [160, -35.36],   // v11 0.550 SUMMIT TUNNEL ridge
    [108, -32.34],   // v12 0.624 ridge east
    [115, -12.84],   // v13 0.675 plunge begins
    [117, 11.89],    // v14 0.728 plunge kink
    [128, -53.94],   // v15 0.783 plunge sweeper
    [142, -30.36],   // v16 0.842 lower slope
    [140, -22.47],   // v17 0.908 seafront drag
    [57, -151.81],   // v18 0.974 final hook to the line
  ],
  startHeading: 3.81,
  elevation: [
    [0.000, 3.2], [0.089, 4.5], [0.130, 8.0], [0.165, 12.0],
    [0.200, 16.0], [0.245, 21.0], [0.272, 24.0], [0.297, 27.0],
    [0.340, 31.0], [0.369, 34.0], [0.398, 37.0], [0.440, 41.0],
    [0.471, 44.0], [0.506, 48.0], [0.550, 52.0], [0.585, 53.0],
    [0.624, 52.0], [0.675, 48.0], [0.720, 38.0], [0.783, 26.0],
    [0.842, 15.0], [0.908, 6.0], [0.955, 3.8],
  ],
  halfWidth: [
    [0.000, 8.8], [0.090, 8.2], [0.130, 7.4], [0.200, 6.6],
    [0.272, 5.9], [0.300, 6.2], [0.369, 5.9], [0.400, 6.2],
    [0.471, 6.0], [0.510, 6.4], [0.550, 6.0], [0.585, 6.0],
    [0.624, 6.6], [0.675, 7.2], [0.780, 8.0], [0.842, 8.2],
    [0.908, 8.6], [0.960, 8.8],
  ],
  bank: [
    [0.000, 0], [0.100, 5], [0.160, 6], [0.220, 4],
    [0.272, 12],   // left hairpin
    [0.300, 4], [0.340, -4],
    [0.383, -12],  // right hairpin, banked the other way
    [0.410, -4], [0.471, 6], [0.490, 10], [0.530, 6],
    [0.585, 4], [0.650, 4], [0.700, 8], [0.783, 10],
    [0.842, 8], [0.900, 4], [0.940, 6], [0.975, 10],
  ],
  zones: [
    { t0: 0.000, fade: 0.016, name: 'shore',
      nearL: [0, -0.4, 1.6], farL: 14, farDL: 110, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.6, -3.0], farR: -6, farDR: 70, rockR: 0.1, shoulderR: 10, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.125, fade: 0.014, name: 'approach',
      nearL: [0, 1.6, 12], farL: 44, farDL: 90, rockL: 0.85, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.0, -6, -18], farR: 2, farDR: 60, rockR: 0.7, shoulderR: 2, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.195, fade: 0.014, name: 'ladder',
      nearL: [0, 1.4, 11], farL: 52, farDL: 85, rockL: 0.85, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.0, -6, -18], farR: 12, farDR: 55, rockR: 0.75, shoulderR: 2, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.0,
      cobble: 0, kerb: 1 },
    { t0: 0.500, fade: 0.014, name: 'summit',
      nearL: [0, 2.0, 13], farL: 62, farDL: 85, rockL: 0.95, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [0, 1.4, 11], farR: 58, farDR: 85, rockR: 0.9, shoulderR: 5, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.558, fade: 0.012, name: 'tunnel',
      nearL: [0, 2.6, 15], farL: 64, farDL: 90, rockL: 1, shoulderL: 3, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: TUNNEL_CLEAR - 0.15,
      nearR: [0, 1.0, 10], farR: 60, farDR: 90, rockR: 1, shoulderR: 3, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: TUNNEL_CLEAR - 0.15,
      cobble: 0, kerb: 1 },
    { t0: 0.620, fade: 0.014, name: 'ridge',
      nearL: [0, 1.6, 12], farL: 58, farDL: 85, rockL: 0.9, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.2, -7, -22], farR: 8, farDR: 50, rockR: 0.85, shoulderR: 1.8, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.670, fade: 0.016, name: 'plunge',
      nearL: [0, 1.4, 11], farL: 40, farDL: 90, rockL: 0.8, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.0, -6, -18], farR: 2, farDR: 60, rockR: 0.6, shoulderR: 2.5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.0,
      cobble: 0, kerb: 1 },
    { t0: 0.900, fade: 0.014, name: 'drag',
      nearL: [0, -0.4, 1.5], farL: 12, farDL: 100, rockL: 0.15, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.6, -3.0], farR: -6, farDR: 70, rockR: 0.1, shoulderR: 10, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
  ],
  tunnel: [0.565, 0.612],
  bridge: null,
  boostPads: [
    { t0: 0.0500, t1: 0.0670, lat: -2.9, hw: 1.9 },
    { t0: 0.0500, t1: 0.0670, lat: 2.9, hw: 1.9 },
    { t0: 0.8000, t1: 0.8170, lat: 0.0, hw: 2.6 },
    { t0: 0.9550, t1: 0.9720, lat: -3.0, hw: 2.0 },
    { t0: 0.9550, t1: 0.9720, lat: 3.0, hw: 2.0 },
  ],
  boxRows: [0.100, 0.180, 0.310, 0.420, 0.520, 0.640, 0.730, 0.860, 0.930],
  hoardingZones: [[0, 0.09], [0.67, 0.85]],
};

// ===========================================================================
//  VAPOR CANYON — the fork's own design: over, under, and along the gorge
//
//  The only circuit that uses BOTH signature structures. Start high on the
//  mesa rim, dive through a DESCENDING tunnel bored into the canyon wall,
//  run flat-out along the river inlet at the bottom, climb the far face into
//  a banked carousel cut into the rock, then cross back over the whole
//  canyon on the bridge at 32 m before the drop to the line. Leg turns
//  min-norm Newton-solved (residual 8 mm) like every other circuit.
// ===========================================================================
const VAPOR_CANYON: TrackDef = {
  id: 'vapor-canyon',
  name: 'Vapor Canyon',
  dressLabel: 'carving the canyon',
  kit: 'gridline',
  laps: 3,
  // Waypoint-designed plan: a DUMBBELL. Two lobes — the low canyon-floor loop
  // east, the high mesa-rim loop west — joined by two parallel straights
  // through the waist. The tunnel dives into the east lobe; the bridge
  // carries the north neck back across the gorge at height; the karts on the
  // other neck are visible across the waist all lap long.
  legs: [
    [216, 42.53],    // v0  0.000 start straight, the south neck (right-hand drift)
    [107, -35.49],   // v1  0.121 TUNNEL DIVE in
    [101, -57.37],   // v2  0.181 tunnel bend
    [105, -42.49],   // v3  0.238 east lobe descent
    [87, -40.40],    // v4  0.297 canyon floor
    [102, -49.57],   // v5  0.346 floor apex
    [101, -47.09],   // v6  0.403 floor exit
    [102, 50.53],    // v7  0.460 climb hook (right)
    [216, 35.79],    // v8  0.517 north neck — the BRIDGE back across
    [98, -27.87],    // v9  0.639 west lobe in
    [95, -57.55],    // v10 0.694 rim bend
    [92, -48.96],    // v11 0.747 carousel
    [91, -44.34],    // v12 0.798 carousel apex
    [92, -45.34],    // v13 0.849 carousel exit
    [87, -35.83],    // v14 0.901 rim out
    [89, 43.55],     // v15 0.950 final hook to the line
  ],
  startHeading: 0,
  elevation: [
    [0.000, 26.0], [0.060, 26.2], [0.121, 25.0], [0.150, 22.0],
    [0.181, 18.0], [0.238, 12.0], [0.297, 8.5], [0.360, 7.0],
    [0.420, 6.5], [0.440, 7.5], [0.480, 13.0], [0.517, 20.0],
    [0.545, 24.0], [0.600, 24.5], [0.639, 24.0], [0.700, 25.0],
    [0.760, 27.0], [0.830, 28.0], [0.900, 27.0], [0.950, 26.3],
  ],
  halfWidth: [
    [0.000, 8.8], [0.090, 8.2], [0.121, 7.2], [0.160, 6.6],
    [0.200, 6.6], [0.238, 7.0], [0.297, 7.4], [0.360, 8.0],
    [0.420, 8.2], [0.460, 7.6], [0.517, 7.2], [0.545, 7.0],
    [0.600, 7.0], [0.639, 7.6], [0.700, 8.2], [0.760, 8.4],
    [0.830, 8.3], [0.900, 7.9], [0.950, 8.6],
  ],
  bank: [
    [0.000, 0], [0.100, 3], [0.140, 6], [0.200, 7], [0.250, 9],
    [0.300, 10], [0.360, 12], [0.420, 10],
    [0.460, -8], [0.490, -8],   // the climb hook is a right-hander
    [0.517, 0], [0.600, 0], [0.639, 4],
    [0.700, 12], [0.760, 18], [0.830, 16], [0.900, 10],
    [0.945, 2], [0.965, -7], [0.990, -1],
  ],
  zones: [
    { t0: 0.000, fade: 0.016, name: 'mesa',
      nearL: [0, -0.4, 1.6], farL: 26, farDL: 120, rockL: 0.2, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.3, -1.2, -2.6], farR: 24, farDR: 120, rockR: 0.3, shoulderR: 7, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 3.6,
      cobble: 0, kerb: 1 },
    { t0: 0.112, fade: 0.010, name: 'wall',
      nearL: [0, 1.6, 12], farL: 56, farDL: 90, rockL: 0.9, shoulderL: 6, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.2, -8, -24], farR: 6, farDR: 55, rockR: 0.85, shoulderR: 1.5, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.125, fade: 0.012, name: 'tunnel',
      nearL: [0, 2.6, 15], farL: 58, farDL: 90, rockL: 1, shoulderL: 3, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: TUNNEL_CLEAR - 0.15,
      nearR: [0, 1.0, 10], farR: 54, farDR: 90, rockR: 1, shoulderR: 3, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: TUNNEL_CLEAR - 0.15,
      cobble: 0, kerb: 1 },
    { t0: 0.200, fade: 0.014, name: 'canyon',
      nearL: [0, 1.6, 13], farL: 54, farDL: 85, rockL: 0.95, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-1.2, -7, -22], farR: 4, farDR: 45, rockR: 0.85, shoulderR: 1.8, surfR: Surface.Dirt, wallR: WALL_GUARDRAIL, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.290, fade: 0.020, name: 'river',
      nearL: [0, 1.2, 10], farL: 30, farDL: 80, rockL: 0.6, shoulderL: 5, surfL: Surface.Dirt, wallL: WALL_ROCK, wallOffL: 2.9,
      nearR: [-0.4, -1.6, -3.0], farR: -6, farDR: 70, rockR: 0.1, shoulderR: 11, surfR: Surface.Sand, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.450, fade: 0.014, name: 'climb',
      nearL: [-1.2, -8, -24], farL: 4, farDL: 50, rockL: 0.85, shoulderL: 1.5, surfL: Surface.Dirt, wallL: WALL_GUARDRAIL, wallOffL: 3.0,
      nearR: [0, 1.6, 12], farR: 52, farDR: 90, rockR: 0.9, shoulderR: 6, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.542, fade: 0.006, name: 'bridge',
      nearL: [-1.5, -9, -20], farL: 4, farDL: 46, rockL: 0.8, shoulderL: 0.6, surfL: Surface.Dirt, wallL: WALL_PARAPET, wallOffL: PARAPET_FACE,
      nearR: [-1.5, -9, -20], farR: 4, farDR: 46, rockR: 0.8, shoulderR: 0.6, surfR: Surface.Dirt, wallR: WALL_PARAPET, wallOffR: PARAPET_FACE,
      cobble: 0.55, kerb: 0 },
    { t0: 0.601, fade: 0.010, name: 'rim',
      nearL: [-0.8, -4, -12], farL: 6, farDL: 70, rockL: 0.6, shoulderL: 6, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.2,
      nearR: [0, -0.4, 1.5], farR: 26, farDR: 100, rockR: 0.35, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_NONE, wallOffR: 0,
      cobble: 0, kerb: 1 },
    { t0: 0.680, fade: 0.014, name: 'carousel',
      nearL: [-1.0, -5, -16], farL: 6, farDL: 60, rockL: 0.7, shoulderL: 8, surfL: Surface.Dirt, wallL: WALL_GUARDRAIL, wallOffL: 3.0,
      nearR: [0, 2.0, 14], farR: 58, farDR: 85, rockR: 0.95, shoulderR: 6, surfR: Surface.Dirt, wallR: WALL_ROCK, wallOffR: 2.9,
      cobble: 0, kerb: 1 },
    { t0: 0.940, fade: 0.010, name: 'return',
      nearL: [0, -0.4, 1.4], farL: 26, farDL: 120, rockL: 0.2, shoulderL: 7, surfL: Surface.Grass, wallL: WALL_GUARDRAIL, wallOffL: 3.4,
      nearR: [-0.4, -1.8, -4.0], farR: 25, farDR: 100, rockR: 0.25, shoulderR: 7, surfR: Surface.Grass, wallR: WALL_GUARDRAIL, wallOffR: 3.4,
      cobble: 0, kerb: 1 },
  ],
  tunnel: [0.128, 0.194],
  bridge: [0.548, 0.596],
  boostPads: [
    { t0: 0.3600, t1: 0.3770, lat: -2.9, hw: 1.9 },
    { t0: 0.3600, t1: 0.3770, lat: 2.9, hw: 1.9 },
    { t0: 0.6200, t1: 0.6370, lat: 0.0, hw: 2.6 },
    { t0: 0.0450, t1: 0.0620, lat: -3.0, hw: 2.0 },
    { t0: 0.0450, t1: 0.0620, lat: 3.0, hw: 2.0 },
  ],
  boxRows: [0.075, 0.170, 0.250, 0.330, 0.410, 0.500, 0.630, 0.720, 0.810, 0.900],
  hoardingZones: [[0, 0.10], [0.63, 0.80]],
};

// ===========================================================================
//  Registry + active-track resolution
// ===========================================================================
export const TRACKS: TrackDef[] = [SUNSET_BAY, NEON_HORIZON, SUMMIT_SPRINT, VAPOR_CANYON];

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
