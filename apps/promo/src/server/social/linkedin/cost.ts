import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"

import { aiUsageMonthStart } from "@/server/ai/usage"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import { LINKEDIN_AI_FEATURES, type LinkedinAiFeature, type LinkedinSpendPart } from "@/lib/social/linkedin/options"

/**
 * What LinkedIn cost in AI, for one project (part 48): this month's total by
 * kind, and the last two weeks day by day. Read off the shell's own meter,
 * `ai_usage_events`, which every LinkedIn call writes to through `askModel`
 * with its project in the row's metadata. The shell table is only read, never
 * changed. The same shape as X's (`../x/cost.ts`).
 */

/** How many days the day-by-day list goes back. */
const DAYS = 14

export type LinkedinSpend = {
  /** Whole cents, this calendar month (UTC), as the AI usage screen counts them. */
  totalCents: number
  parts: Record<LinkedinSpendPart, number>
  /** The last two weeks, newest first, days with no spend left out. Dates are UTC days. */
  days: Array<{ day: string; cents: number }>
}

export async function linkedinSpend(userId: string, projectId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<LinkedinSpend> {
  const features = Object.keys(LINKEDIN_AI_FEATURES) as LinkedinAiFeature[]
  const mine = and(
    eq(customShellAiUsageEvents.userId, userId),
    inArray(customShellAiUsageEvents.feature, features),
    sql`${customShellAiUsageEvents.metadata}->>'projectId' = ${projectId}`
  )
  const rows = await db
    .select({ feature: customShellAiUsageEvents.feature, cents: sql<number>`sum(${customShellAiUsageEvents.costCents})::int` })
    .from(customShellAiUsageEvents)
    .where(and(mine, eq(customShellAiUsageEvents.monthStart, aiUsageMonthStart(now))))
    .groupBy(customShellAiUsageEvents.feature)
  const parts: Record<LinkedinSpendPart, number> = { comments: 0, posts: 0, ideas: 0, people: 0 }
  for (const row of rows) {
    const part = LINKEDIN_AI_FEATURES[row.feature as LinkedinAiFeature]
    if (part) parts[part] += row.cents ?? 0
  }
  const day = sql<string>`to_char(${customShellAiUsageEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
  const days = await db
    .select({ day, cents: sql<number>`sum(${customShellAiUsageEvents.costCents})::int` })
    .from(customShellAiUsageEvents)
    .where(and(mine, gte(customShellAiUsageEvents.createdAt, new Date(now.getTime() - DAYS * 86_400_000))))
    .groupBy(day)
    .orderBy(desc(day))
  return {
    totalCents: parts.comments + parts.posts + parts.ideas + parts.people,
    parts,
    days: days.filter((row) => (row.cents ?? 0) > 0).map((row) => ({ day: row.day, cents: row.cents ?? 0 })),
  }
}
