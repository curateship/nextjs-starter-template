import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isAwake, localDateKey, wakeEndsAt } from "@/lib/social/waking"
import { X_WARM_UP_DAYS } from "@/lib/social/x/options"

import { accountTimeZone, readBehaviour, warmUpEndsAt, type BehaviourSettings } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { xWarmUp } from "./calls"
import { xAccountBorn } from "./posting"
import { promoXKeywords } from "./schema"

/**
 * A new X account's first week (part 28). Tyler, 21 Oct 2026: "7 days".
 * Nothing is sent before day 8, and once a day in its waking hours it visits
 * X: the home feed and a search or two on its project's words, read only.
 * Nothing is liked, reposted, followed or written. The same shape as
 * Medium's warm-up (`../medium/warm-up.ts`), counted from when X says the
 * account joined, or from when Promo first saw it signed in.
 */

const MAX_DELAY_MS = 4 * 3_600_000
const END_OF_DAY_MARGIN_MS = 20 * 60_000
const DAY_MS = 86_400_000

/** Queues today's visit for every warming, signed-in X account that is awake and has had none today. */
export async function queueDueXWarmUps(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  const since = new Date(now.getTime() - X_WARM_UP_DAYS * DAY_MS)
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "x"),
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.banScreenAt),
        ne(promoAccounts.handle, ""),
        // Only accounts still in their warm-up, so the pass stays small as the accounts grow old.
        sql`coalesce(${promoAccounts.xJoinedAt}, ${promoAccounts.signedInAt}) > ${since.toISOString()}::timestamptz`,
        or(isNotNull(promoAccounts.profileId), isNotNull(promoAccounts.phoneId))
      )
    )
  const settingsByUser = new Map<string, BehaviourSettings>()
  let queued = 0
  for (const account of accounts) {
    if (!warmUpEndsAt(xAccountBorn(account), X_WARM_UP_DAYS, now)) continue
    if (await pausedBy(account.userId, account, db)) continue
    let settings = settingsByUser.get(account.userId)
    if (!settings) {
      settings = await readBehaviour(account.userId, db)
      settingsByUser.set(account.userId, settings)
    }
    const zone = await accountTimeZone(account, db)
    if (!isAwake(now, zone, settings.wakeFromMinute, settings.wakeUntilMinute)) continue
    const [last] = await db
      .select({ status: promoJobs.status, createdAt: promoJobs.createdAt })
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, account.userId), eq(promoJobs.kind, "x_warm_up"), sql`${promoJobs.payload}->>'accountId' = ${account.id}`))
      .orderBy(desc(promoJobs.createdAt))
      .limit(1)
    if (last && (last.status === "queued" || last.status === "running")) continue
    if (last && localDateKey(last.createdAt, zone) === localDateKey(now, zone)) continue
    const latest = Math.min(now.getTime() + MAX_DELAY_MS, wakeEndsAt(now, zone, settings.wakeUntilMinute).getTime() - END_OF_DAY_MARGIN_MS)
    const runAfter = new Date(now.getTime() + Math.max(0, latest - now.getTime()) * random())
    await queueJob(account.userId, "x_warm_up", { accountId: account.id }, db, runAfter)
    queued += 1
  }
  return queued
}

/** The day's visit, in the account's own browser or phone, reading around its project's words. */
export async function runXWarmUp(
  userId: string,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const words = account.projectId
    ? (
        await db
          .select({ kind: promoXKeywords.kind, value: promoXKeywords.value })
          .from(promoXKeywords)
          .where(and(eq(promoXKeywords.userId, userId), eq(promoXKeywords.projectId, account.projectId), ne(promoXKeywords.kind, "account")))
      ).map((row) => (row.kind === "hashtag" ? `#${row.value}` : row.value))
    : []
  await xWarmUp(target, { words: words.slice(0, 10) })
}
