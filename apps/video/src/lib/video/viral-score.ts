/**
 * How viral one video is, from 0 to 100.
 *
 * Ported line for line from the old app (`apps/ai-video/src/server/
 * trend-score.ts`), weights and thresholds unchanged. It is worked out every
 * time results are read and never stored, so a video's score moves as it
 * ages. Client-safe: no server imports.
 *
 * The one change from the old function: it no longer refuses a video whose
 * download is not "ready". The old app only scored saved videos; here every
 * search result is scored, and a missing breakdown is simply one missing
 * number.
 */

import type { ViralBreakdown } from "./viral-breakdown"

export type ViralScoreConfidence = "high" | "medium" | "low"

/** The five parts, each scored 0 to 100 before its weight is applied. */
export type ViralScoreParts = {
  velocity: number
  audienceLift: number
  engagement: number
  freshness: number
  structure: number
}

export type ViralScore = {
  score: number
  confidence: ViralScoreConfidence
  viewsPerDay: number | null
  /** Views divided by followers, with followers counted as at least 1,000. */
  audienceLift: number | null
  /** Likes plus comments per view, 0.1 meaning 1 in 10. */
  engagementRate: number | null
  /** Each part's own 0 to 100, rounded, as the old app showed them. */
  parts: ViralScoreParts
  /**
   * What each part added to the score, to one decimal: 87.3 out of 100 for
   * views against followers is 21.8 of its 25. The hover shows these.
   */
  points: ViralScoreParts
  /** What was not there to score, in words, e.g. "Missing breakdown". */
  missing: string[]
}

/** What each part is worth out of the 100. Shown on hover. */
export const VIRAL_SCORE_WEIGHTS: ViralScoreParts = {
  velocity: 0.3,
  audienceLift: 0.25,
  engagement: 0.2,
  freshness: 0.15,
  structure: 0.1,
}

export const VIRAL_SCORE_PART_LABELS: Record<keyof ViralScoreParts, string> = {
  velocity: "Views per day",
  audienceLift: "Views against followers",
  engagement: "Likes and comments per view",
  freshness: "How recent",
  structure: "Breakdown",
}

export type ViralScoreInput = {
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | Date | null
  followers: number | null
  breakdown: ViralBreakdown | null
  now?: Date
}

const DAY_MS = 86_400_000
const FOLLOWER_FLOOR = 1_000

export function scoreViralVideo({
  views: rawViews,
  likes: rawLikes,
  comments: rawComments,
  postedAt: rawPostedAt,
  followers,
  breakdown,
  now = new Date(),
}: ViralScoreInput): ViralScore {
  const missing: string[] = []
  const views = validCount(rawViews) ? rawViews : null
  const likes = validCount(rawLikes) ? rawLikes : null
  const comments = validCount(rawComments) ? rawComments : null
  const postedAt = parseDate(rawPostedAt)

  if (!postedAt) missing.push("Missing post date")
  if (views === null) missing.push("Missing views")
  else if (views === 0) missing.push("No views")
  if (followers === null) missing.push("Missing follower count")
  if (likes === null) missing.push("Missing likes")
  if (comments === null) missing.push("Missing comments")
  if (!breakdown) missing.push("Missing breakdown")

  // A video posted an hour ago counts as a day old, so it cannot score a
  // million views a day off its first thousand.
  const ageDays = postedAt
    ? Math.max((now.getTime() - postedAt.getTime()) / DAY_MS, 1)
    : null
  const viewsPerDay =
    views !== null && ageDays ? Math.round(views / ageDays) : null
  const audienceLift =
    views !== null && followers !== null
      ? roundTo(views / Math.max(followers, FOLLOWER_FLOOR), 2)
      : null
  const engagementRate =
    views && (likes !== null || comments !== null)
      ? roundTo(((likes ?? 0) + (comments ?? 0)) / views, 4)
      : null

  const parts: ViralScoreParts = {
    velocity: viewsPerDay === null ? 0 : logScore(viewsPerDay, 200_000),
    audienceLift: audienceLift === null ? 0 : logScore(audienceLift, 50),
    engagement: engagementRate === null ? 0 : cap(engagementRate / 0.1) * 100,
    freshness: ageDays ? freshnessScore(ageDays) : 0,
    structure: structureScore(breakdown),
  }
  const points: ViralScoreParts = {
    velocity: parts.velocity * VIRAL_SCORE_WEIGHTS.velocity,
    audienceLift: parts.audienceLift * VIRAL_SCORE_WEIGHTS.audienceLift,
    engagement: parts.engagement * VIRAL_SCORE_WEIGHTS.engagement,
    freshness: parts.freshness * VIRAL_SCORE_WEIGHTS.freshness,
    structure: parts.structure * VIRAL_SCORE_WEIGHTS.structure,
  }
  const score = Math.round(
    points.velocity +
      points.audienceLift +
      points.engagement +
      points.freshness +
      points.structure
  )
  const sureness =
    100 -
    (postedAt ? 0 : 15) -
    (views === null || views === 0 ? 25 : 0) -
    (followers === null ? 20 : 0) -
    (likes === null ? 5 : 0) -
    (comments === null ? 5 : 0) -
    (breakdown ? 0 : 25)

  return {
    score: Math.max(0, Math.min(100, score)),
    confidence: sureness >= 90 ? "high" : sureness >= 60 ? "medium" : "low",
    viewsPerDay,
    audienceLift,
    engagementRate,
    parts: {
      velocity: Math.round(parts.velocity),
      audienceLift: Math.round(parts.audienceLift),
      engagement: Math.round(parts.engagement),
      freshness: Math.round(parts.freshness),
      structure: Math.round(parts.structure),
    },
    points: {
      velocity: roundTo(points.velocity, 1),
      audienceLift: roundTo(points.audienceLift, 1),
      engagement: roundTo(points.engagement, 1),
      freshness: roundTo(points.freshness, 1),
      structure: roundTo(points.structure, 1),
    },
    missing,
  }
}

function validCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function parseDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 0 to 100 on a log scale, full marks at `maxValue`: 2,000 views a day scores
 * about 62 against 200,000, not 1.
 */
function logScore(value: number, maxValue: number) {
  return cap(Math.log10(value + 1) / Math.log10(maxValue + 1)) * 100
}

function freshnessScore(ageDays: number) {
  if (ageDays <= 2) return 100
  if (ageDays <= 7) return 85
  if (ageDays <= 14) return 65
  if (ageDays <= 30) return 40
  if (ageDays <= 60) return 20
  return 5
}

/** 20 each for a transcript, parts, scene cuts, a hook, and an ask or proof. */
function structureScore(breakdown: ViralBreakdown | null) {
  if (!breakdown) return 0
  const roles = new Set(breakdown.segments.map((segment) => segment.role))
  return (
    (breakdown.transcript.length ? 20 : 0) +
    (breakdown.segments.length ? 20 : 0) +
    (breakdown.scenes.length ? 20 : 0) +
    (roles.has("hook") ? 20 : 0) +
    (roles.has("cta") || roles.has("proof") ? 20 : 0)
  )
}

function roundTo(value: number, places: number) {
  const multiplier = 10 ** places
  return Math.round(value * multiplier) / multiplier
}

function cap(value: number) {
  return Math.max(0, Math.min(1, value))
}
