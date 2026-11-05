import type { SegmentRole } from "@/lib/viral/viral-breakdown"

/**
 * What Analyse with AI writes about one saved video, for one topic
 * (`workspace/docs/ai-analysis.md`). Tyler, 4 Nov 2026, picked all four:
 * "Why it works", "Script for my topic", "3 to 5 more ideas",
 * "Title + hashtags". Shared because the right panel, the vault and Send to
 * Video all read the same shape.
 */
export type AnalysisPieces = {
  whyItWorks: {
    /** What the opening does to stop the scroll. */
    hook: string
    /** Each part of the original in order, and what it does. */
    parts: { role: SegmentRole; summary: string }[]
    /** What made it spread. */
    whySpread: string
  }
  /** The same parts in the same order, written for the topic. */
  script: { role: SegmentRole; seconds: number; words: string }[]
  /** 3 to 5 more video ideas in the same style. */
  ideas: { idea: string; hook: string }[]
  title: { title: string; caption: string; hashtags: string[] }
}

export const ANALYSIS_TOPIC_MAX = 500
export const ANALYSIS_NOTES_MAX = 20_000

/** The meter names, one per piece, so the costs can be read apart. */
export const ANALYSIS_FEATURES = {
  breakdown: "viral_breakdown",
  whyItWorks: "viral_why_it_works",
  script: "viral_script",
  ideas: "viral_ideas",
  title: "viral_title",
} as const

/** The whole script as one block of text, the way Copy and Send to Video hand it on. */
export function scriptText(script: AnalysisPieces["script"], labels: Record<SegmentRole, string>): string {
  return script.map((part) => `${labels[part.role]} (${part.seconds}s)\n${part.words.trim()}`).join("\n\n")
}

/**
 * The roles a script is missing, against the original's parts in order. A
 * script that skips one is not "the same shape", so the server refuses it.
 */
export function missingScriptParts(original: SegmentRole[], script: AnalysisPieces["script"]): SegmentRole[] {
  const have = new Set(script.map((part) => part.role))
  return [...new Set(original)].filter((role) => !have.has(role))
}

/** One analysis as the right panel draws it. */
export type ViralAnalysis = {
  id: string
  topic: string
  pieces: AnalysisPieces
  notes: string
  createdAt: string
}
