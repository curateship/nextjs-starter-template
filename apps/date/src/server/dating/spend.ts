import { and, eq, gte, like, or } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { customShellAiUsageEvents } from "@/server/schema"
import { dateMatches } from "@/server/tinder/schema"

import { datingCallDollars, isDatingModel } from "./model"

/**
 * What Date's AI has cost this month, against the member's spend cap.
 *
 * Every call goes through the shell's usage meter (`runAiCall`), like every AI
 * call in the app, tagged with a feature name starting "dating-". There is no
 * second table of Date's own: the cap is the meter's rows for those features,
 * priced from their tokens with Date's model prices (`model.ts`), because the
 * shell's price list does not have the models yet and records them at $0.
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
    dollars += isDatingModel(row.model) ? datingCallDollars(row.model, row.inputTokens, row.outputTokens) : row.costCents / 100
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

/**
 * What a match and a date cost this month: this month's AI spend divided by
 * the matches made this month and the dates agreed this month. A count of
 * none gives no figure rather than dividing by zero. The month is the meter's
 * own, which starts on the 1st in UTC. Sample chats are not counted.
 */
export type MatchCost = { dollars: number; matches: number; dates: number; perMatch: number | null; perDate: number | null }

/** Dollars over a count, to the cent, or null for a count of none. */
export function dollarsEach(dollars: number, count: number): number | null {
  return count > 0 ? Math.round((dollars / count) * 100) / 100 : null
}

export async function monthMatchCost(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<MatchCost> {
  const monthStart = new Date(`${aiUsageMonthStart(now)}T00:00:00Z`)
  const [dollars, rows] = await Promise.all([
    monthSpendDollars(userId, db, now),
    db
      .select({ matchedAt: dateMatches.matchedAt, acceptedAt: dateMatches.dateAcceptedAt })
      .from(dateMatches)
      .where(and(eq(dateMatches.userId, userId), eq(dateMatches.sample, false), or(gte(dateMatches.matchedAt, monthStart), gte(dateMatches.dateAcceptedAt, monthStart)))),
  ])
  const matches = rows.filter((row) => row.matchedAt >= monthStart).length
  const dates = rows.filter((row) => row.acceptedAt !== null && row.acceptedAt >= monthStart).length
  return { dollars, matches, dates, perMatch: dollarsEach(dollars, matches), perDate: dollarsEach(dollars, dates) }
}
