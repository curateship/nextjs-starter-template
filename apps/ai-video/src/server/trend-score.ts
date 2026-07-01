type TrendScoreStats = {
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
}

type TrendScoreAnalysis = {
  transcript: unknown[]
  segments: { role: string }[]
  scenes: unknown[]
}

export type TrendScore = {
  score: number
  confidence: "high" | "medium" | "low"
  views_per_day: number | null
  audience_lift: number | null
  creator_followers: number | null
  engagement_rate: number | null
  freshness_label: string | null
  component_scores: {
    velocity: number
    audience_lift: number
    engagement: number
    freshness: number
    structure: number
  }
  missing_inputs: string[]
}

type TrendScoreInput = {
  status: string
  stats: TrendScoreStats | null
  analysis: TrendScoreAnalysis | null
  creatorFollowers: number | null
  now?: Date
}

const DAY_MS = 86_400_000
const FOLLOWER_FLOOR = 1_000

export function scoreViralVideoTrend({
  status,
  stats,
  analysis,
  creatorFollowers,
  now = new Date(),
}: TrendScoreInput): TrendScore | null {
  if (status !== "ready") return null

  const missingInputs: string[] = []
  const views = validCount(stats?.views) ? stats.views : null
  const likes = validCount(stats?.likes) ? stats.likes : null
  const comments = validCount(stats?.comments) ? stats.comments : null
  const postedAt = parseDate(stats?.postedAt)

  if (!postedAt) missingInputs.push("Missing post date")
  if (views === null) missingInputs.push("Missing views")
  else if (views === 0) missingInputs.push("No views")
  if (creatorFollowers === null) missingInputs.push("Missing follower count")
  if (likes === null) missingInputs.push("Missing likes")
  if (comments === null) missingInputs.push("Missing comments")
  if (!analysis) missingInputs.push("Missing analysis")

  const ageDays = postedAt
    ? Math.max((now.getTime() - postedAt.getTime()) / DAY_MS, 1)
    : null
  const viewsPerDay = views !== null && postedAt && ageDays
    ? Math.round(views / ageDays)
    : null
  const audienceLift =
    views !== null && creatorFollowers !== null
      ? roundTo(views / Math.max(creatorFollowers, FOLLOWER_FLOOR), 2)
      : null
  const engagementRate =
    views && (likes !== null || comments !== null)
      ? roundTo(((likes ?? 0) + (comments ?? 0)) / views, 4)
      : null

  const componentScores = {
    velocity: viewsPerDay === null ? 0 : logScore(viewsPerDay, 200_000),
    audience_lift: audienceLift === null ? 0 : logScore(audienceLift, 50),
    engagement: engagementRate === null ? 0 : cap(engagementRate / 0.1) * 100,
    freshness: postedAt && ageDays ? freshnessScore(ageDays) : 0,
    structure: structureScore(analysis),
  }
  const score = Math.round(
    componentScores.velocity * 0.3 +
      componentScores.audience_lift * 0.25 +
      componentScores.engagement * 0.2 +
      componentScores.freshness * 0.15 +
      componentScores.structure * 0.1
  )
  const confidenceScore =
    100 -
    (postedAt ? 0 : 15) -
    (views === null || views === 0 ? 25 : 0) -
    (creatorFollowers === null ? 20 : 0) -
    (likes === null ? 5 : 0) -
    (comments === null ? 5 : 0) -
    (analysis ? 0 : 25)

  return {
    score: Math.max(0, Math.min(100, score)),
    confidence:
      confidenceScore >= 90 ? "high" : confidenceScore >= 60 ? "medium" : "low",
    views_per_day: viewsPerDay,
    audience_lift: audienceLift,
    creator_followers: creatorFollowers,
    engagement_rate: engagementRate,
    freshness_label: postedAt && ageDays ? formatAgeLabel(ageDays) : null,
    component_scores: {
      velocity: Math.round(componentScores.velocity),
      audience_lift: Math.round(componentScores.audience_lift),
      engagement: Math.round(componentScores.engagement),
      freshness: Math.round(componentScores.freshness),
      structure: Math.round(componentScores.structure),
    },
    missing_inputs: missingInputs,
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

function structureScore(analysis: TrendScoreAnalysis | null) {
  if (!analysis) return 0
  const roles = new Set(analysis.segments.map((segment) => segment.role))
  return (
    (analysis.transcript.length ? 20 : 0) +
    (analysis.segments.length ? 20 : 0) +
    (analysis.scenes.length ? 20 : 0) +
    (roles.has("hook") ? 20 : 0) +
    (roles.has("cta") || roles.has("proof") ? 20 : 0)
  )
}

function formatAgeLabel(ageDays: number) {
  const days = Math.floor(ageDays)
  if (days <= 0) return "Today"
  if (days === 1) return "1d ago"
  return `${days}d ago`
}

function roundTo(value: number, places: number) {
  const multiplier = 10 ** places
  return Math.round(value * multiplier) / multiplier
}

function cap(value: number) {
  return Math.max(0, Math.min(1, value))
}
