import { and, eq, gte, like, or, sql } from "drizzle-orm"

import { PROFILE_PAUSED_WORDS } from "@/lib/dating/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { customShellAiUsageEvents } from "@/server/schema"
import { dateMatches } from "@/server/tinder/schema"

import { datingCallDollars, isDatingModel } from "./model"
import { dateAccounts } from "./schema"

/**
 * What Date's AI has cost this month for one profile, against that profile's
 * spend cap.
 *
 * Every call goes through the shell's usage meter (`runAiCall`), like every AI
 * call in the app, tagged with a feature name starting "dating-". There is no
 * second table of Date's own: the cap is the meter's rows for those features,
 * priced from their tokens with Date's model prices (`model.ts`), because the
 * shell's price list does not have the models yet and records them at $0.
 * Each call names its profile in the meter's `metadata` (`accountId`), since
 * the shell's table has no column of Date's own.
 */

/** Whose spend: the profile, and its member, which the meter's rows are indexed by. A card, a chat or a walk row is one. */
export type SpendOwner = { userId: string; accountId: string }

/** A profile row as the owner of its spend. */
export function accountOwner(account: { id: string; userId: string }): SpendOwner {
  return { userId: account.userId, accountId: account.id }
}

/** Every feature name Date's AI calls are recorded under starts with this. */
export const DATING_FEATURE_PREFIX = "dating-"

export async function monthSpendDollars(owner: SpendOwner, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const events = customShellAiUsageEvents
  const rows = await db
    .select({ model: events.model, inputTokens: events.inputTokens, outputTokens: events.outputTokens, costCents: events.costCents })
    .from(events)
    .where(
      and(
        eq(events.userId, owner.userId),
        eq(events.monthStart, aiUsageMonthStart(now)),
        like(events.feature, `${DATING_FEATURE_PREFIX}%`),
        sql`${events.metadata}->>'accountId' = ${owner.accountId}`
      )
    )
  let dollars = 0
  for (const row of rows) {
    dollars += isDatingModel(row.model) ? datingCallDollars(row.model, row.inputTokens, row.outputTokens) : row.costCents / 100
  }
  return Math.round(dollars * 10_000) / 10_000
}

/**
 * Why the AI may not spend for this profile now, in words, or null while it
 * may: the profile is paused (Tyler, 20 Oct 2026: Pause stops "AI spend until
 * Resume", by hand as well as on its own), or this month's spend has reached
 * the cap. Every Dating AI call asks this first.
 */
export async function aiSpendStopped(
  owner: SpendOwner,
  capDollars: number,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  const [account] = await db.select({ pausedAt: dateAccounts.pausedAt }).from(dateAccounts).where(eq(dateAccounts.id, owner.accountId)).limit(1)
  if (account?.pausedAt) return PROFILE_PAUSED_WORDS
  const spent = await monthSpendDollars(owner, db, now)
  if (spent < capDollars) return null
  return `Spend cap reached, $${capDollars} this month. The AI starts again on the 1st, or when the cap is raised in the Dating settings.`
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

export async function monthMatchCost(owner: SpendOwner, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<MatchCost> {
  const monthStart = new Date(`${aiUsageMonthStart(now)}T00:00:00Z`)
  const [dollars, rows] = await Promise.all([
    monthSpendDollars(owner, db, now),
    db
      .select({ matchedAt: dateMatches.matchedAt, acceptedAt: dateMatches.dateAcceptedAt })
      .from(dateMatches)
      .where(and(eq(dateMatches.accountId, owner.accountId), eq(dateMatches.sample, false), or(gte(dateMatches.matchedAt, monthStart), gte(dateMatches.dateAcceptedAt, monthStart)))),
  ])
  const matches = rows.filter((row) => row.matchedAt >= monthStart).length
  const dates = rows.filter((row) => row.acceptedAt !== null && row.acceptedAt >= monthStart).length
  return { dollars, matches, dates, perMatch: dollarsEach(dollars, matches), perDate: dollarsEach(dollars, dates) }
}
