import { and, desc, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MEDIUM_WARM_UP_DAYS } from "@/lib/social/medium/options"
import { isAwake, localDateKey, wakeEndsAt } from "@/lib/social/waking"

import { accountTimeZone, readBehaviour, warmUpEndsAt, type BehaviourSettings } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { mediumWarmUp } from "./calls"
import { promoMediumKeywords } from "./schema"

/**
 * A new Medium account's first week (part 3). Tyler, 21 Oct 2026: "7 days".
 * Nothing is sent before day 8, and once a day in its waking hours it
 * visits Medium: the front page, a few stories read in the project's tags,
 * and on about one day in three a writer followed. Nothing is written,
 * clapped or highlighted. The same shape as Reddit's warm-up
 * (`../warm-up.ts`), counted from when Medium says the account joined.
 */

const MAX_DELAY_MS = 4 * 3_600_000
const END_OF_DAY_MARGIN_MS = 20 * 60_000

/** Queues today's visit for every warming, signed-in Medium account that is awake and has had none today. */
export async function queueDueMediumWarmUps(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "medium"),
        isNull(promoAccounts.retiredAt),
        ne(promoAccounts.handle, ""),
        // Only accounts still in their warm-up, so the pass stays small as
        // the accounts grow old.
        gt(promoAccounts.mediumJoinedAt, new Date(now.getTime() - MEDIUM_WARM_UP_DAYS * 86_400_000)),
        or(isNotNull(promoAccounts.profileId), isNotNull(promoAccounts.phoneId))
      )
    )
  const settingsByUser = new Map<string, BehaviourSettings>()
  let queued = 0
  for (const account of accounts) {
    const ends = warmUpEndsAt(account.mediumJoinedAt, MEDIUM_WARM_UP_DAYS, now)
    if (!ends) continue
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
      .where(
        and(
          eq(promoJobs.userId, account.userId),
          eq(promoJobs.kind, "medium_warm_up"),
          sql`${promoJobs.payload}->>'accountId' = ${account.id}`
        )
      )
      .orderBy(desc(promoJobs.createdAt))
      .limit(1)
    if (last && (last.status === "queued" || last.status === "running")) continue
    if (last && localDateKey(last.createdAt, zone) === localDateKey(now, zone)) continue
    const latest = Math.min(
      now.getTime() + MAX_DELAY_MS,
      wakeEndsAt(now, zone, settings.wakeUntilMinute).getTime() - END_OF_DAY_MARGIN_MS
    )
    const runAfter = new Date(now.getTime() + Math.max(0, latest - now.getTime()) * random())
    await queueJob(account.userId, "medium_warm_up", { accountId: account.id }, db, runAfter)
    queued += 1
  }
  return queued
}

/** The day's visit, in the account's own browser, reading in its project's tags. */
export async function runMediumWarmUp(
  userId: string,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const tags = account.projectId
    ? (
        await db
          .select({ value: promoMediumKeywords.value })
          .from(promoMediumKeywords)
          .where(
            and(
              eq(promoMediumKeywords.userId, userId),
              eq(promoMediumKeywords.projectId, account.projectId),
              eq(promoMediumKeywords.kind, "tag")
            )
          )
      ).map((row) => row.value)
    : []
  await mediumWarmUp(target, { tags: tags.slice(0, 10) })
}
