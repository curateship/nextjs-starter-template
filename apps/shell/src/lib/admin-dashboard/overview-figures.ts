import type { AnalyticsRange } from "@/lib/analytics/range"
import { loadAiUsageDashboard, type AiUsageDashboard } from "@/lib/api/ai"
import { loadAdminUsage, type AdminUsageSummary } from "@/lib/api/billing/usage"
import { loadTrafficSummary, type TrafficSummary } from "@/lib/api/traffic"

/**
 * What the Admin dashboard's Overview reads for one range: traffic, AI spend
 * and metered units. The route reads it for the Overview tab, and the
 * dashboard reads it on another tab when the left page holds a figure block.
 */
export type OverviewFigures = {
  traffic: TrafficSummary
  ai: AiUsageDashboard
  metered: AdminUsageSummary
}

/** Overview's three readers for one range, in one go. */
export async function loadOverviewFigures(days: AnalyticsRange): Promise<OverviewFigures> {
  const [traffic, ai, metered] = await Promise.all([
    loadTrafficSummary(days),
    loadAiUsageDashboard(days),
    loadAdminUsage(days),
  ])
  return { traffic, ai, metered }
}
