import { and, eq, inArray, sql } from "drizzle-orm"

import { aiUsageMonthStart } from "@/server/ai/usage"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import { MEDIUM_AI_FEATURES, type MediumAiFeature, type MediumSpendPart } from "@/lib/social/medium/options"

/**
 * What Medium cost in AI this month, for one project (part 41). Read off the
 * shell's own meter, `ai_usage_events`, which every Medium call writes to
 * through `askModel` or `runAiCall` with its project in the row's metadata.
 * The shell table is only read, never changed.
 */

export type MediumSpend = {
  /** Whole cents, this calendar month (UTC), as the AI usage screen counts them. */
  totalCents: number
  parts: Record<MediumSpendPart, number>
}

export async function mediumSpend(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumSpend> {
  const features = Object.keys(MEDIUM_AI_FEATURES) as MediumAiFeature[]
  const rows = await db
    .select({ feature: customShellAiUsageEvents.feature, cents: sql<number>`sum(${customShellAiUsageEvents.costCents})::int` })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.userId, userId),
        eq(customShellAiUsageEvents.monthStart, aiUsageMonthStart(now)),
        inArray(customShellAiUsageEvents.feature, features),
        sql`${customShellAiUsageEvents.metadata}->>'projectId' = ${projectId}`
      )
    )
    .groupBy(customShellAiUsageEvents.feature)
  const parts: Record<MediumSpendPart, number> = { responses: 0, articles: 0, covers: 0 }
  for (const row of rows) {
    const part = MEDIUM_AI_FEATURES[row.feature as MediumAiFeature]
    if (part) parts[part] += row.cents ?? 0
  }
  return { totalCents: parts.responses + parts.articles + parts.covers, parts }
}
