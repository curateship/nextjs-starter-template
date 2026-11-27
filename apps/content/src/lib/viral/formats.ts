import type { AnalysisPieces } from "@/lib/viral/analysis"
import { segmentRoleLabels, type SegmentRole } from "@/lib/viral/viral-breakdown"

/**
 * Saved formats (`workspace/docs/library.md`): a winning structure kept from
 * an analysis, such as "mistake hook, three tips, the ask", with each part's
 * rough length. Library → Formats writes a new script from one with no
 * source video. Formats belong to the person, not to one project.
 */

export type FormatPart = {
  role: SegmentRole
  /** About how long the part ran in the original, in seconds. */
  seconds: number
  /** What the part does, from the analysis's "Why it works". */
  summary: string
}

export type ViralFormat = {
  id: string
  name: string
  parts: FormatPart[]
  sourceTitle: string | null
  sample: boolean
  createdAt: string
}

export type FormatScript = {
  id: string
  formatId: string
  projectId: string | null
  projectName: string | null
  idea: string
  script: AnalysisPieces["script"]
  createdAt: string
}

export const FORMAT_NAME_MAX = 120
export const FORMAT_PARTS_MAX = 30
export const FORMAT_SUMMARY_MAX = 2_000
export const FORMAT_IDEA_MAX = 500

/** The meter name for a script written from a format. */
export const FORMAT_SCRIPT_FEATURE = "viral_format_script"

/** "Hook, Problem, Solution, The ask": a format named by its parts when nobody named it. */
export function partsName(parts: Pick<FormatPart, "role">[]): string {
  return parts.map((part) => segmentRoleLabels[part.role]).join(", ").slice(0, FORMAT_NAME_MAX)
}

/**
 * The format an analysis holds: the script's parts in order, each with its
 * length and what the matching part of "Why it works" says it does.
 */
export function formatFromAnalysis(pieces: AnalysisPieces): FormatPart[] {
  const why = [...pieces.whyItWorks.parts]
  return pieces.script.slice(0, FORMAT_PARTS_MAX).map((part) => {
    const index = why.findIndex((one) => one.role === part.role)
    const summary = index >= 0 ? why.splice(index, 1)[0].summary : ""
    return { role: part.role, seconds: Math.max(0, Math.round(part.seconds)), summary: summary.slice(0, FORMAT_SUMMARY_MAX) }
  })
}
