/**
 * ============================================================================
 *  Removals — the persistent kill list behind the track editor.
 * ============================================================================
 *  Nothing in this world is hand-placed: every prop is generated at boot by
 *  the dressers. But generation is DETERMINISTIC — the same object lands at
 *  the same world coordinates every boot — so "delete that thing" can be
 *  recorded as a BANNED POSITION and enforced at build time: any placement
 *  whose origin falls inside a banned sphere simply never happens.
 *
 *  Enforcement taps sit at the three chokepoints everything flows through:
 *  InstSet.add (instanced props), GeoAccum.add in world space (merged
 *  masonry/timber), and the Foliage entry points (trees, bushes, tufts).
 *
 *  Two layers, merged per track:
 *    - BAKED_REMOVALS (removals-data.ts) — checked in, ships in the build;
 *    - localStorage 'kr.removals'        — the editor's working set, local
 *      to this machine, applied on the next boot.
 *  The editor's X key exports the merged set as JSON for baking.
 */
import { ACTIVE_TRACK } from './TrackDefs';
import { BAKED_REMOVALS } from './removals-data';

export interface Removal {
  /** world position of the banned placement */
  p: [number, number, number];
  /** ban radius, metres */
  r: number;
  /** mesh/set name at capture time — for humans reading the file */
  n?: string;
}

/** `?editor=1` — the click-to-delete mode. Scenery also reads this to skip
 *  the static merge so every prop stays individually pickable. */
export const EDITOR_ON = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('editor');

const KEY = 'kr.removals';

function loadLocal(): Record<string, Removal[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

const local = loadLocal();
/** the active track's merged list — what enforcement actually checks */
const active: Removal[] = [
  ...(BAKED_REMOVALS[ACTIVE_TRACK.id] ?? []),
  ...(local[ACTIVE_TRACK.id] ?? []),
];

/** Is a placement at (x,y,z) banned? Called from the build chokepoints. */
export function isRemoved(x: number, y: number, z: number): boolean {
  for (let i = 0; i < active.length; i++) {
    const e = active[i];
    const dx = x - e.p[0], dy = y - e.p[1], dz = z - e.p[2];
    if (dx * dx + dy * dy + dz * dz < e.r * e.r) return true;
  }
  return false;
}

export function removalCount(): number {
  return active.length;
}

/**
 * Does an axis-aligned box overlap any ban sphere? The accumulator pieces
 * use this rather than the origin test: a wall's origin sits at its FOOT,
 * so a click banning the middle of its face would otherwise miss it on the
 * rebuild — the editor's one job is that clicking a thing removes the thing.
 */
export function isRemovedBox(
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean {
  for (let i = 0; i < active.length; i++) {
    const e = active[i];
    const cx = Math.max(minX, Math.min(e.p[0], maxX)) - e.p[0];
    const cy = Math.max(minY, Math.min(e.p[1], maxY)) - e.p[1];
    const cz = Math.max(minZ, Math.min(e.p[2], maxZ)) - e.p[2];
    if (cx * cx + cy * cy + cz * cz < e.r * e.r) return true;
  }
  return false;
}

/** Editor: ban a position on the active track. Persists immediately. */
export function addRemoval(e: Removal) {
  (local[ACTIVE_TRACK.id] ??= []).push(e);
  active.push(e);
  try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* private mode */ }
}

/** Editor: undo the most recent LOCAL removal (baked ones need a re-bake). */
export function undoRemoval(): Removal | null {
  const mine = local[ACTIVE_TRACK.id];
  if (!mine || !mine.length) return null;
  const e = mine.pop()!;
  const i = active.lastIndexOf(e);
  if (i >= 0) active.splice(i, 1);
  try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* private mode */ }
  return e;
}

/** Editor: the full merged set (all tracks), pretty-printed for baking. */
export function exportRemovals(): string {
  const merged: Record<string, Removal[]> = {};
  for (const k of new Set([...Object.keys(BAKED_REMOVALS), ...Object.keys(local)])) {
    const rows = [...(BAKED_REMOVALS[k] ?? []), ...(local[k] ?? [])];
    if (rows.length) merged[k] = rows;
  }
  return JSON.stringify(merged, null, 2);
}
