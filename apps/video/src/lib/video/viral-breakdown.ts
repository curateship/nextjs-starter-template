/**
 * What Gemini writes down about a saved video, and the words for it.
 *
 * Shared because the breakdown is drawn in two places: the research
 * dashboard's right panel and the Viral page's detail window. The roles and
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
