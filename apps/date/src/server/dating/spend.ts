import { and, eq, like } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { customShellAiUsageEvents } from "@/server/schema"

import { DATING_MODEL, datingCallDollars } from "./model"

/**
 * What Date's AI has cost this month, against the member's spend cap.
 *
 * Every call goes through the shell's usage meter (`runAiCall`), like every AI
 * call in the app, tagged with a feature name starting "dating-". There is no
 * second table of Date's own: the cap is the meter's rows for those features,
 * priced from their tokens with Date's model price (`model.ts`), because the
 * shell's price list does not have the model yet and records it at $0.
 */

/** Every feature name Date's AI calls are recorded under starts with this. */
export const DATING_FEATURE_PREFIX = "dating-"

export async function monthSpendDollars(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const events = customShellAiUsageEvents
  const rows = await db
    .select({ model: events.model, inputTokens: events.inputTokens, outputTokens: events.outputTokens, costCents: events.costCents })
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.monthStart, aiUsageMonthStart(now)), like(events.feature, `${DATING_FEATURE_PREFIX}%`)))
  let dollars = 0
  for (const row of rows) {
    dollars += row.model === DATING_MODEL ? datingCallDollars(row.inputTokens, row.outputTokens) : row.costCents / 100
  }
  return Math.round(dollars * 10_000) / 10_000
}

/** The cap in words when this month's spend has reached it, or null while there is room. */
export async function spendCapReached(
  userId: string,
  capDollars: number,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  const spent = await monthSpendDollars(userId, db, now)
  if (spent < capDollars) return null
  return `Spend cap reached, $${capDollars} this month. The AI starts again on the 1st, or when the cap is raised in Settings → Dating.`
}
