export type KeywordJobType =
  | "seed_research"
  | "domain_research"
  | "competitor_gap"
  | "metrics_enrichment"
  | "intent_enrichment"
  | "difficulty_enrichment"
  | "rank_check"
  | "backlink_discovery"

export type KeywordJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export const KEYWORD_STATUSES = [
  "new",
  "saved",
  "ignored",
  "planned",
  "published",
] as const
export type KeywordStatus = (typeof KEYWORD_STATUSES)[number]

export const SEARCH_INTENTS = [
  "informational",
  "navigational",
  "commercial",
  "transactional",
  "unknown",
] as const
export type SearchIntent = (typeof SEARCH_INTENTS)[number]

export const KEYWORD_SOURCES = [
  "seed_research",
  "domain_research",
  "competitor_gap",
] as const
export type KeywordSource = (typeof KEYWORD_SOURCES)[number]

export const ALERT_TYPES = [
  "new_ranking",
  "lost_ranking",
  "entered_top_10",
  "left_top_10",
  "big_gain",
  "big_drop",
] as const
export type AlertType = (typeof ALERT_TYPES)[number]

export const alertTypeLabels: Record<AlertType, string> = {
  new_ranking: "New ranking",
  lost_ranking: "Lost ranking",
  entered_top_10: "Entered top 10",
  left_top_10: "Left top 10",
  big_gain: "Big gain",
  big_drop: "Big drop",
}

export type MonthlySearch = {
  year: number
  month: number
  search_volume: number
}

export type ScoreExplanation = {
  components: {
    volumeScore: number
    difficultyScore: number
    intentScore: number
    trendScore: number
    cpcScore: number
  }
  reasons: string[]
}

export const keywordStatusLabels: Record<KeywordStatus, string> = {
  new: "New",
  saved: "Saved",
  ignored: "Ignored",
  planned: "Planned",
  published: "Published",
}

export const searchIntentLabels: Record<SearchIntent, string> = {
  informational: "Informational",
  navigational: "Navigational",
  commercial: "Commercial",
  transactional: "Transactional",
  unknown: "Unknown",
}

export const keywordSourceLabels: Record<KeywordSource, string> = {
  seed_research: "Seed Research",
  domain_research: "Domain Research",
  competitor_gap: "Competitor Gap",
}

export const suggestedPageTypeLabels: Record<string, string> = {
  local_service_page: "Local service page",
  service_or_landing_page: "Service or landing page",
  comparison_page: "Comparison page",
  buying_guide_or_service_page: "Buying guide or service page",
  faq_or_blog_post: "FAQ or blog post",
  blog_post_or_guide: "Blog post or guide",
  manual_review: "Manual review",
}

export function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().trim().replace(/\s+/g, " ")
}

export function isValidAdsKeyword(keyword: string): boolean {
  return (
    keyword.length > 0 &&
    keyword.length <= 80 &&
    keyword.split(" ").length <= 10
  )
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
}

export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
    domain
  )
}

export function calculateTrendScore(
  monthlySearches: MonthlySearch[] | null | undefined
): number {
  if (!monthlySearches || monthlySearches.length < 6) return 50

  const sorted = [...monthlySearches].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return a.month - b.month
  })

  const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2))
  const secondHalf = sorted.slice(Math.floor(sorted.length / 2))

  const avg = (arr: MonthlySearch[]) =>
    arr.reduce((sum, x) => sum + (x.search_volume || 0), 0) / arr.length

  const oldAvg = avg(firstHalf)
  const newAvg = avg(secondHalf)

  if (oldAvg === 0 && newAvg === 0) return 50
  if (oldAvg === 0) return 80

  const change = (newAvg - oldAvg) / oldAvg
  return Math.max(0, Math.min(100, Math.round(50 + change * 100)))
}

const intentScores: Record<SearchIntent, number> = {
  transactional: 100,
  commercial: 85,
  informational: 55,
  navigational: 35,
  unknown: 50,
}

function normalizeLog(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.min(1, Math.log(1 + value) / Math.log(1 + max))
}

export function calculateOpportunityScore(input: {
  searchVolume: number | null
  keywordDifficulty: number | null
  intent: SearchIntent
  trendScore: number | null
  cpc: number | null
  maxProjectVolume: number
  maxProjectCpc: number
}): { score: number; explanation: ScoreExplanation } {
  const volumeScore =
    input.searchVolume == null
      ? 50
      : normalizeLog(input.searchVolume, input.maxProjectVolume) * 100
  const difficultyScore =
    input.keywordDifficulty == null ? 50 : 100 - input.keywordDifficulty
  const intentScore = intentScores[input.intent] ?? 50
  const trendScore = input.trendScore ?? 50
  const cpcScore =
    input.cpc == null ? 50 : normalizeLog(input.cpc, input.maxProjectCpc) * 100

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        volumeScore * 0.35 +
          difficultyScore * 0.3 +
          intentScore * 0.2 +
          trendScore * 0.1 +
          cpcScore * 0.05
      )
    )
  )

  const reasons: string[] = []
  if (input.searchVolume != null) {
    reasons.push(
      volumeScore >= 60
        ? "Good search volume"
        : volumeScore >= 35
          ? "Moderate search volume"
          : "Low search volume"
    )
  }
  if (input.keywordDifficulty != null) {
    reasons.push(
      difficultyScore >= 60
        ? "Low keyword difficulty"
        : difficultyScore >= 35
          ? "Moderate keyword difficulty"
          : "High keyword difficulty"
    )
  }
  if (input.intent !== "unknown") {
    reasons.push(`${searchIntentLabels[input.intent]} intent`)
  }
  if (input.trendScore != null) {
    if (trendScore >= 60) reasons.push("Positive search trend")
    else if (trendScore <= 40) reasons.push("Declining search trend")
  }
  if (reasons.length === 0) {
    reasons.push("Limited data available")
  }

  return {
    score,
    explanation: {
      components: {
        volumeScore: Math.round(volumeScore),
        difficultyScore: Math.round(difficultyScore),
        intentScore: Math.round(intentScore),
        trendScore: Math.round(trendScore),
        cpcScore: Math.round(cpcScore),
      },
      reasons,
    },
  }
}

export function suggestPageType(input: {
  keyword: string
  intent: SearchIntent
}): string {
  const keyword = input.keyword.toLowerCase()

  const isQuestion =
    /^(how|what|why|when|where|who|can|does|do|is|are)\b/.test(keyword)
  const hasLocalModifier =
    /\b(near me|toronto|vancouver|calgary|montreal|ottawa|city|local)\b/.test(
      keyword
    )
  const hasComparisonModifier =
    /\b(best|vs|versus|alternative|comparison|review)\b/.test(keyword)

  if (hasLocalModifier && ["transactional", "commercial"].includes(input.intent))
    return "local_service_page"
  if (input.intent === "transactional") return "service_or_landing_page"
  if (input.intent === "commercial" && hasComparisonModifier)
    return "comparison_page"
  if (input.intent === "commercial") return "buying_guide_or_service_page"
  if (isQuestion) return "faq_or_blog_post"
  if (input.intent === "informational") return "blog_post_or_guide"
  return "manual_review"
}

export function suggestGapAction(input: {
  intent: SearchIntent
  keywordDifficulty: number | null
  searchVolume: number | null
  ourRank: number | null
  competitorRank: number | null
}): string {
  if (
    input.keywordDifficulty != null &&
    input.keywordDifficulty >= 70 &&
    input.searchVolume != null &&
    input.searchVolume < 100
  ) {
    return "Deprioritize"
  }
  if (input.ourRank == null) {
    return ["commercial", "transactional"].includes(input.intent)
      ? "Create landing/service page"
      : "Create blog/guide"
  }
  if (input.competitorRank != null && input.ourRank > input.competitorRank) {
    return "Improve existing page"
  }
  return "Maintain"
}

export function parseSearchIntent(value: unknown): SearchIntent {
  return typeof value === "string" &&
    (SEARCH_INTENTS as readonly string[]).includes(value)
    ? (value as SearchIntent)
    : "unknown"
}
