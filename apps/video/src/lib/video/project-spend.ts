import { featureLabel } from "@/lib/video/ai-budget"

/**
 * What one project has spent on AI, and the limit that stops it (see
 * `workspace/docs/project-first.md`). Shared by the server, which adds it up
 * and refuses a call, and the browser, which shows it.
 */

/** A limit above this many dollars is a typing mistake, not a budget. */
export const PROJECT_SPEND_LIMIT_MAX_DOLLARS = 100_000

export type ProjectSpend = {
  total_cents: number
  /** Biggest first, one line per tool. */
  by_tool: { label: string; cents: number }[]
  /** Null means the project has no limit. */
  limit_cents: number | null
}

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
  viral_keyword_ideas: "Keyword ideas",
  viral_topic_match: "Topic match",
  viral_breakdown: "Breakdowns",
}

export function projectSpendToolLabel(feature: string) {
  return TOOL_LABELS[feature] ?? featureLabel(feature)
}

/** "$4.50" from 450 cents. */
export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

const LIMIT_MESSAGE_START = "This project has spent"

/**
 * The sentence a refused call ends with. It carries the three numbers, so the
 * person can see the sum: what is spent, what the next step costs, and the
 * limit it would pass.
 */
export function projectSpendLimitMessage({
  spentCents,
  nextCents,
  limitCents,
}: {
  spentCents: number
  nextCents: number
  limitCents: number
}) {
  const next =
    nextCents > 0 ? `, and this costs about ${formatCents(nextCents)}` : ""
  return `${LIMIT_MESSAGE_START} ${formatCents(spentCents)} of its ${formatCents(limitCents)} limit${next}. Raise the limit in the project's settings.`
}

export function isProjectSpendLimitMessage(message: string) {
  return message.startsWith(LIMIT_MESSAGE_START)
}

/** Dollars typed into Project settings, as cents; empty is no limit. */
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
