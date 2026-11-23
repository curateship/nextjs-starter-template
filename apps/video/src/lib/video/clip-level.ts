/**
 * Even loudness between clips (`workspace/docs/even-out-clip-volume.md`):
 * every file from the Media panel arrives on the timeline set to play at one
 * loudness, so a quiet clip and a loud clip of the same voice sound alike.
 * Tyler, 4 Nov 2026: "Every clip, automatic".
 *
 * The file is measured once, in LUFS, the loudness unit the export's own
 * levelling uses, and the clip keeps `levelDb`, the change that brings it to
 * the target. Its volume slider still works on top of that.
 */

/**
 * The loudness each clip is brought to. Below the export's -14 so a raised
 * clip has room before its peaks clip, and the export's own levelling lifts
 * the finished mix the rest of the way.
 */
export const LEVEL_TARGET_LUFS = -18
/** A near-silent file raised further than this would turn into hiss. */
export const MAX_LEVEL_RAISE_DB = 12
export const MIN_LEVEL_DB = -40
/** A change smaller than this can't be heard, so the clip is left as it is. */
const SMALLEST_LEVEL_DB = 0.5

/** The change that brings a file measured at `lufs` to the target, or nothing. */
export function levelDbFor(lufs: number | null | undefined): number | undefined {
  if (typeof lufs !== "number" || !Number.isFinite(lufs)) return undefined
  const change = Math.min(MAX_LEVEL_RAISE_DB, Math.max(MIN_LEVEL_DB, LEVEL_TARGET_LUFS - lufs))
  if (Math.abs(change) < SMALLEST_LEVEL_DB) return undefined
  return Math.round(change * 10) / 10
}

/** The clip's levelling as a multiplier of its sound. 1 is unchanged. */
export function levelGain(clip: { levelDb?: number }) {
  const db = clip.levelDb
  return typeof db === "number" && Number.isFinite(db) ? 10 ** (db / 20) : 1
}

/**
 * What the preview can play of it. A browser plays a file at most as loud as
 * it was recorded, so a raise is heard only in the export. A lowering is
 * heard in both.
 */
export function previewLevelGain(clip: { levelDb?: number }) {
  return Math.min(1, levelGain(clip))
}

/** The export's stage for it, or nothing for a clip left as recorded. */
export function levelFilter(clip: { levelDb?: number }): string[] {
  const db = clip.levelDb
  return typeof db === "number" && Number.isFinite(db) && db !== 0 ? [`volume=${db}dB`] : []
}
