import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { isAwake, localDateKey, wakeEndsAt } from "@/lib/social/waking"
import { isPhoneAppNetwork } from "@/lib/social/networks"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { slowReason } from "@/server/bans/rules"

import { accountTimeZone, readBehaviour, type BehaviourSettings } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { appWarmUp } from "./calls"
import { appWarmUpEndsAt } from "./posts"

/**
 * A new Instagram or TikTok account's first days (Bans task, part 19). Tyler,
 * 3 Nov 2026: 7 days. Post is refused until they end (`refuseAppPostNow`),
 * and once a day inside its waking hours the phone opens the app, scrolls
 * the feed for a few minutes and likes a few posts, at a person's pace.
 * Nothing is posted, commented or followed. The same shape as X's warm-up
 * (`../x/warm-up.ts`), counted from when the account was added to Promo.
 */

const MAX_DELAY_MS = 4 * 3_600_000
const END_OF_DAY_MARGIN_MS = 20 * 60_000

/** How many posts a day's visit likes: fewer at half pace (parts 20, 23 and 24). */
const LIKES = 4

/** Queues today's visit for every warming, signed-in Instagram or TikTok account that is awake and has had none today. */
export async function queueDueAppWarmUps(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        sql`${promoAccounts.platform} IN ('instagram', 'tiktok')`,
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.banScreenAt),
        ne(promoAccounts.handle, ""),
        isNotNull(promoAccounts.phoneId),
        // The longest warm-up the setting allows, so the pass stays small as the accounts grow old.
        sql`${promoAccounts.createdAt} > ${new Date(now.getTime() - 60 * 86_400_000).toISOString()}::timestamptz`
      )
    )
  const settingsByUser = new Map<string, BehaviourSettings>()
  let queued = 0
  for (const account of accounts) {
    let settings = settingsByUser.get(account.userId)
    if (!settings) {
      settings = await readBehaviour(account.userId, db)
      settingsByUser.set(account.userId, settings)
    }
    if (!appWarmUpEndsAt(account, settings.appWarmUpDays, now)) continue
    if (await pausedBy(account.userId, account, db)) continue
    const zone = await accountTimeZone(account, db)
    if (!isAwake(now, zone, settings.wakeFromMinute, settings.wakeUntilMinute)) continue
    const [last] = await db
      .select({ status: promoJobs.status, createdAt: promoJobs.createdAt })
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, account.userId), eq(promoJobs.kind, "app_warm_up"), sql`${promoJobs.payload}->>'accountId' = ${account.id}`))
      .orderBy(desc(promoJobs.createdAt))
      .limit(1)
    if (last && (last.status === "queued" || last.status === "running")) continue
    if (last && localDateKey(last.createdAt, zone) === localDateKey(now, zone)) continue
    const latest = Math.min(now.getTime() + MAX_DELAY_MS, wakeEndsAt(now, zone, settings.wakeUntilMinute).getTime() - END_OF_DAY_MARGIN_MS)
    const runAfter = new Date(now.getTime() + Math.max(0, latest - now.getTime()) * random())
    await queueJob(account.userId, "app_warm_up", { accountId: account.id }, db, runAfter)
    queued += 1
  }
  return queued
}

/** The day's visit on the account's phone. It likes half as many at half pace. */
export async function runAppWarmUp(
  userId: string,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!isPhoneAppNetwork(account.platform)) throw new Refusal("Only an Instagram or TikTok account warms up this way.")
  const slow = await slowReason(userId, account, db, now)
  await appWarmUp(target, account.platform, { likes: slow ? Math.floor(LIKES / 2) : LIKES })
}
