/**
 * ============================================================================
 *  Speed class — the engine-class (CC) system.
 * ============================================================================
 *  Three classes in the kart-racer tradition: 50cc is the gentle tour, 100cc
 *  is the game exactly as it was tuned, 150cc is the answer to "the current
 *  speed feels slow at times".
 *
 *  Resolved ONCE at module scope, the same pattern as ACTIVE_TRACK: the
 *  multiplier feeds `BASE_TOP_SPEED` in types.ts, and everything downstream —
 *  kart caps, the AI's ceiling, shell speeds, engine pitch, the camera's
 *  speed-normalised rush, the HUD dial — derives from that one constant, so
 *  the whole game scales coherently instead of the player outrunning their
 *  own red shells. Changing class from the menu therefore writes
 *  localStorage and reloads behind the boot curtain, exactly like a track
 *  swap; nothing ever rescales mid-session.
 *
 *  The multipliers are deliberately asymmetric. +16% is a real step up that
 *  still leaves the AI's corner solving inside the grip budget it was tuned
 *  against (gated: autoplay full-race passes at 150 on the twistiest
 *  circuits); -15% reads as relaxed without making the drift ladder
 *  unreachable on short straights.
 */

export const CC_OPTIONS = [50, 100, 150] as const;
export type SpeedClass = (typeof CC_OPTIONS)[number];

const CC_MULS: Record<SpeedClass, number> = { 50: 0.85, 100: 1.0, 150: 1.16 };

function resolve(): SpeedClass {
  try {
    const q = new URLSearchParams(location.search).get('cc');
    const fromQ = q !== null ? parseInt(q, 10) : NaN;
    if (CC_OPTIONS.includes(fromQ as SpeedClass)) {
      localStorage.setItem('kr.cc', String(fromQ));
      return fromQ as SpeedClass;
    }
    const s = parseInt(localStorage.getItem('kr.cc') || '', 10);
    if (CC_OPTIONS.includes(s as SpeedClass)) return s as SpeedClass;
  } catch {
    // storage unavailable (private mode, sandboxed iframe) — default below
  }
  return 100;
}

/** The class this session is running. */
export const ACTIVE_CC: SpeedClass = resolve();
/** Global speed multiplier the class implies. 1.0 at 100cc by construction. */
export const CC_MUL: number = CC_MULS[ACTIVE_CC];
