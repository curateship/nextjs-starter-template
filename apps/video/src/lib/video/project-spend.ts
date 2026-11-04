import { featureLabel } from "@/lib/video/ai-budget"

/**
 * What one video, or one Viral project, has spent on AI, and the limit that
 * stops it (see `workspace/docs/project-first.md`). Shared by the server,
 * which adds it up and refuses a call, and the browser, which shows it.
 */

/** A limit above this many dollars is a typing mistake, not a budget. */
export const PROJECT_SPEND_LIMIT_MAX_DOLLARS = 100_000

export type ProjectSpend = {
  total_cents: number
  /** Biggest first, one line per tool. */
  by_tool: { label: string; cents: number }[]
  /** Null means there is no limit. */
  limit_cents: number | null
}

/**
 * A video's spend, plus what every video in its project has spent together,
 * which the editor shows on hover (Tyler, 1 Nov 2026).
 */
export type VideoSpend = ProjectSpend & { project_total_cents: number }

/** The tool names on the AI meter, in the words the spend line uses. */
const TOOL_LABELS: Record<string, string> = {
  "video-image-generation": "Pictures",
  "video-generation": "AI clips",
  caption_generation: "Captions",
  jump_cut_analysis: "Tighten",
  hook_variants: "Hook",
  voiceover: "Voice",
  translation: "Another language",
  translation_voice: "Another language voice",
  script_check: "Script check",
  brief_script: "Brief script",
  broll_phrases: "B-roll phrases",
  broll_transcript: "B-roll transcript",
  viral_keyword_ideas: "Keyword ideas",
  viral_topic_match: "Topic match",
  viral_breakdown: "Breakdowns",
  blur_follow: "Blur that follows",
  blur_faces: "Find faces",
  thumbnail_ideas: "Thumbnail ideas",
  thumbnail_titles: "Thumbnail titles",
  thumbnail_check: "Thumbnail check",
  thumbnail_copy_style: "Copy a style",
  thumbnail_translate: "Thumbnail translation",
}

export function projectSpendToolLabel(feature: string) {
  return TOOL_LABELS[feature] ?? featureLabel(feature)
}

/** "$4.50" from 450 cents. */
export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

/** What the limit belongs to: a video in the editor, or a Viral project. */
export type SpendSubject = "video" | "project"

/**
 * The sentence a refused call ends with. It carries the numbers, so the
 * person can see the sum: what is spent, what shots still being made will
 * add when they arrive, what the next step costs, and how far short the
 * limit falls.
 */
export function projectSpendLimitMessage({
  spentCents,
  generatingCents = 0,
  nextCents,
  limitCents,
  subject = "video",
}: {
  spentCents: number
  generatingCents?: number
  nextCents: number
  limitCents: number
  subject?: SpendSubject
}) {
  const generating =
    generatingCents > 0
      ? `, shots still being made will add ${formatCents(generatingCents)}`
      : ""
  const short = spentCents + generatingCents + nextCents - limitCents
  const next =
    nextCents > 0
      ? `, and this costs about ${formatCents(nextCents)}, so the limit is ${formatCents(short)} short`
      : ""
  return `This ${subject} has spent ${formatCents(spentCents)} of its ${formatCents(limitCents)} limit${generating}${next}. Raise the limit in the ${subject}'s settings.`
}

export function isProjectSpendLimitMessage(message: string) {
  return /^This (video|project) has spent /.test(message)
}

/** Dollars typed into a spend limit box, as cents; empty is no limit. */
export function parseSpendLimit(value: string): number | null {
  const cleaned = value.trim().replace(/^\$/, "")
  if (!cleaned) return null
  const dollars = Number(cleaned)
  if (
    !Number.isFinite(dollars) ||
    dollars <= 0 ||
    dollars > PROJECT_SPEND_LIMIT_MAX_DOLLARS
  ) {
    throw new Error(
      `Type the limit in dollars, more than $0 and at most $${PROJECT_SPEND_LIMIT_MAX_DOLLARS.toLocaleString()}, or leave it empty for no limit.`
    )
  }
  return Math.round(dollars * 100)
}
