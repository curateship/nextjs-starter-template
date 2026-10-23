import { and, eq, gte, inArray, sql } from "drizzle-orm"

import { DATING_APP_WORDS, type DatingApp } from "@/lib/dating/options"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { dateMatches, dateProfiles } from "@/server/tinder/schema"

import { listAccounts } from "./accounts"
import { accountOwner, monthMatchCost } from "./spend"

/**
 * Compare the apps (part 23 of "facebook/01-facebook-dating"): every profile
 * of the member's side by side for this month, in What's working: likes,
 * matches out of 100 likes, how many matches replied, dates agreed, and the
 * AI's dollars per match. Samples are left out.
 *
 * Move hours to the app that works (part 24): when two profiles both have
 * enough likes this month and one gets clearly more matches out of 100, the
 * dashboard suggests giving it more swiping hours. Only a suggestion; nothing
 * changes by itself.
 */

/** A profile needs this many likes this month before its numbers mean anything. */
const COMPARE_NEEDS_LIKES = 20

/** The suggestion needs this many likes on each profile, and the better one this many times the other's matches out of 100, and two more. */
const MOVE_HOURS_NEEDS_LIKES = 100
const MOVE_HOURS_TIMES = 1.5
const MOVE_HOURS_MORE = 2

export type ProfileNumbers = {
  accountId: string
  name: string
  app: DatingApp
  likes: number
  matches: number
  /** Matches out of 100 likes, rounded; null under `COMPARE_NEEDS_LIKES` likes. */
  perHundred: number | null
  replied: number
  dates: number
  dollars: number
  perMatch: number | null
}

export type MoveHours = { better: Pick<ProfileNumbers, "accountId" | "name" | "app" | "perHundred">; worse: Pick<ProfileNumbers, "accountId" | "name" | "app" | "perHundred"> }

export type Comparison = { rows: ProfileNumbers[]; moveHours: MoveHours | null; words: string }

/** Every profile's numbers this month, and the suggestion when there is one. Empty for a member with one profile. */
export async function compareProfiles(userId: string, workspaceId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<Comparison> {
  const accounts = await listAccounts(userId, workspaceId, db)
  if (accounts.length < 2) return { rows: [], moveHours: null, words: "" }
  const monthStart = new Date(`${aiUsageMonthStart(now)}T00:00:00Z`)
  const ids = accounts.map((account) => account.id)
  const [likes, matches] = await Promise.all([
    db
      .select({ accountId: dateProfiles.accountId, count: sql<number>`count(*)::int` })
      .from(dateProfiles)
      .where(and(inArray(dateProfiles.accountId, ids), eq(dateProfiles.sample, false), inArray(dateProfiles.swipe, ["like", "super"]), gte(dateProfiles.swipedAt, monthStart)))
      .groupBy(dateProfiles.accountId),
    db
      .select({
        accountId: dateMatches.accountId,
        count: sql<number>`count(*)::int`,
        replied: sql<number>`(count(*) filter (where ${dateMatches.messagesFromThem} > 0))::int`,
      })
      .from(dateMatches)
      .where(and(inArray(dateMatches.accountId, ids), eq(dateMatches.sample, false), gte(dateMatches.matchedAt, monthStart)))
      .groupBy(dateMatches.accountId),
  ])
  const costs = await Promise.all(accounts.map((account) => monthMatchCost(accountOwner(account), db, now)))
  const rows: ProfileNumbers[] = []
  for (const [index, account] of accounts.entries()) {
    const cost = costs[index]
    const liked = likes.find((row) => row.accountId === account.id)?.count ?? 0
    const matched = matches.find((row) => row.accountId === account.id)
    rows.push({
      accountId: account.id,
      name: account.name,
      app: account.app,
      likes: liked,
      matches: matched?.count ?? 0,
      perHundred: liked >= COMPARE_NEEDS_LIKES ? Math.round(((matched?.count ?? 0) / liked) * 100) : null,
      replied: matched?.replied ?? 0,
      dates: cost.dates,
      dollars: cost.dollars,
      perMatch: cost.perMatch,
    })
  }
  const moveHours = suggestMoveHours(rows)
  return { rows, moveHours, words: moveHours ? moveHoursWords(moveHours) : "" }
}

/** The suggestion, when two profiles both have enough likes and one clearly gets more matches out of 100. */
function suggestMoveHours(rows: ProfileNumbers[]): MoveHours | null {
  const ready = rows.filter((row) => row.likes >= MOVE_HOURS_NEEDS_LIKES && row.perHundred !== null)
  if (ready.length < 2) return null
  const sorted = [...ready].sort((a, b) => (b.perHundred as number) - (a.perHundred as number))
  const [better, worse] = [sorted[0], sorted[sorted.length - 1]]
  const high = better.perHundred as number
  const low = worse.perHundred as number
  if (high < low * MOVE_HOURS_TIMES || high < low + MOVE_HOURS_MORE) return null
  const pick = (row: ProfileNumbers) => ({ accountId: row.accountId, name: row.name, app: row.app, perHundred: row.perHundred })
  return { better: pick(better), worse: pick(worse) }
}

/** "Facebook Dating (Weekends) made 9 matches out of 100 likes this month, Tinder (Tyler) 4. Give Facebook Dating (Weekends) more hours?" */
function moveHoursWords(move: MoveHours): string {
  const name = (side: MoveHours["better"]) => `${DATING_APP_WORDS[side.app].name} (${side.name})`
  return `${name(move.better)} made ${move.better.perHundred} matches out of 100 likes this month, ${name(move.worse)} ${move.worse.perHundred}. Give ${name(move.better)} more hours?`
}
