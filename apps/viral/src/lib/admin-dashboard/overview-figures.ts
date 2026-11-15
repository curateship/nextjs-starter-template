import type { AnalyticsRange } from "@/lib/analytics/range"
import { loadAiUsageDashboard, type AiUsageDashboard } from "@/lib/api/ai"
import { loadAdminUsage, type AdminUsageSummary } from "@/lib/api/billing/usage"
import { loadTrafficSummary, type TrafficSummary } from "@/lib/api/traffic"

/**
 * What the Admin dashboard's Overview reads for one range: traffic, AI spend
 * and metered units, which the shell's nine widgets draw from. The route
 * reads it with the widget layout when Overview shows.
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
