import type { Removal } from './Removals';

/**
 * BAKED removals — the shipped kill list, keyed by track id.
 *
 * Produced by the in-game editor (`?editor=1`): fly the track, click the
 * things that should not be there, press X to export, and paste the JSON
 * here. Every placement in this game is deterministic, so a position banned
 * here is banned in every build on every machine. See Removals.ts.
 */
export const BAKED_REMOVALS: Record<string, Removal[]> = {};
