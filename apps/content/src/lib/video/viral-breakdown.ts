/**
 * What Gemini writes down about a saved video, and the words for it.
 *
 * Shared because the breakdown is drawn in two places: under the player on a
 * Viral project and in the editor's Copy panel. The roles and
 * their labels live here so the two can never disagree about what "agitation"
 * is called.
 */

/** The parts a short video is split into, in the order they usually appear. */
export const SEGMENT_ROLES = [
  "hook",
  "problem",
  "agitation",
  "solution",
  "proof",
  "cta",
  "other",
] as const

export type SegmentRole = (typeof SEGMENT_ROLES)[number]

/** What each part is called on screen. "cta" is not a word anybody says. */
export const segmentRoleLabels: Record<SegmentRole, string> = {
  hook: "Hook",
  problem: "Problem",
  agitation: "Twist of the knife",
  solution: "Solution",
  proof: "Proof",
  cta: "The ask",
  other: "Other",
}

export type ViralBreakdown = {
  /** Every line spoken or shown on screen, in order, each said once. */
  transcript: { startMs: number; endMs: number; text: string }[]
  /** The narrative parts, covering the whole video with no gaps. */
  segments: {
    role: SegmentRole
    startMs: number
    endMs: number
    summary: string
  }[]
  /** Where the picture cuts. Real cuts, never equal slices. */
  scenes: { startMs: number; endMs: number }[]
}

/** "0:04" from 4,200 milliseconds, for a timecode beside a line. */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, "0")}`
}

/** A video's opening, as the Hooks board lists it. */
export type HookLine = {
  startMs: number
  endMs: number
  /** The lines said or shown during the hook, in order, joined by spaces. */
  text: string
}

/**
 * The words of a video's hook: every transcript line that is said or shown
 * while the hook part runs, including a line that starts just before it or
 * runs on after it. The transcript holds speech and on-screen text alike, so
 * a video with no speech gives its captions. Null when the breakdown has no
 * hook part, or nothing is said or shown during it.
 *
 * Shared because the Hooks board reads it now, and the pace and "what the
 * winners share" tasks (viral 17 and 18) read the same opening.
 */
export function hookLine(breakdown: ViralBreakdown): HookLine | null {
  const hook = breakdown.segments.find((segment) => segment.role === "hook")
  if (!hook) return null
  const text = breakdown.transcript
    .filter((line) => line.startMs < hook.endMs && line.endMs > hook.startMs)
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join(" ")
  return text ? { startMs: hook.startMs, endMs: hook.endMs, text } : null
}

/**
 * `?at=` from an address: where the open video starts, in whole milliseconds
 * under 24 hours. Anything else is dropped, so the player starts at 0.
 */
export function readStartMs(value: unknown): number | undefined {
  const ms = Number(value)
  return Number.isInteger(ms) && ms > 0 && ms < 86_400_000 ? ms : undefined
}
