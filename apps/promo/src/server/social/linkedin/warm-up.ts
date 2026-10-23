import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { localDateKey } from "@/lib/social/waking"
import { LINKEDIN_WARM_UP_DAYS } from "@/lib/social/linkedin/options"
import { isWorkday, workdayEndsAt } from "@/lib/social/linkedin/workday"

import { accountTimeZone, warmUpEndsAt } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { linkedinWarmUp } from "./calls"
import { promoLinkedinKeywords } from "./schema"

/**
 * A new LinkedIn account's first week (part 27). Tyler, 22 Oct 2026: "7
 * days". Nothing is sent before day 8, and once a workday it visits LinkedIn:
 * the home feed and a search or two on its project's words, read only.
 * Nothing is reacted to, connected, followed or written, because nothing on
 * LinkedIn happens without a person pressing the button. The same shape as
 * X's warm-up (`../x/warm-up.ts`), counted from when Promo first saw it
 * signed in, inside its workday hours (part 7).
 */

const MAX_DELAY_MS = 4 * 3_600_000
const END_OF_DAY_MARGIN_MS = 20 * 60_000
const DAY_MS = 86_400_000

/** Queues today's visit for every warming, signed-in LinkedIn account inside its workday that has had none today. */
export async function queueDueLinkedinWarmUps(db: CustomShellDb = defaultDb, now: Date = new Date(), random: () => number = Math.random): Promise<number> {
  const since = new Date(now.getTime() - LINKEDIN_WARM_UP_DAYS * DAY_MS)
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "linkedin"),
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.banScreenAt),
        ne(promoAccounts.handle, ""),
        // Only accounts still in their warm-up, so the pass stays small as the accounts grow old.
        sql`${promoAccounts.signedInAt} > ${since.toISOString()}::timestamptz`,
        or(isNotNull(promoAccounts.profileId), isNotNull(promoAccounts.phoneId))
      )
    )
  let queued = 0
  for (const account of accounts) {
    if (!warmUpEndsAt(account.signedInAt, LINKEDIN_WARM_UP_DAYS, now)) continue
    if (await pausedBy(account.userId, account, db)) continue
    const zone = await accountTimeZone(account, db)
    if (!isWorkday(now, zone)) continue
    const [last] = await db
      .select({ status: promoJobs.status, createdAt: promoJobs.createdAt })
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, account.userId), eq(promoJobs.kind, "linkedin_warm_up"), sql`${promoJobs.payload}->>'accountId' = ${account.id}`))
      .orderBy(desc(promoJobs.createdAt))
      .limit(1)
    if (last && (last.status === "queued" || last.status === "running")) continue
    if (last && localDateKey(last.createdAt, zone) === localDateKey(now, zone)) continue
    const latest = Math.min(now.getTime() + MAX_DELAY_MS, workdayEndsAt(now, zone).getTime() - END_OF_DAY_MARGIN_MS)
    const runAfter = new Date(now.getTime() + Math.max(0, latest - now.getTime()) * random())
    await queueJob(account.userId, "linkedin_warm_up", { accountId: account.id }, db, runAfter)
    queued += 1
  }
  return queued
}

/** The day's visit, in the account's own browser or phone, reading around its project's words. */
export async function runLinkedinWarmUp(userId: string, account: typeof promoAccounts.$inferSelect, target: CommandTarget, db: CustomShellDb = defaultDb): Promise<void> {
  const words = account.projectId
    ? (
        await db
          .select({ kind: promoLinkedinKeywords.kind, value: promoLinkedinKeywords.value })
          .from(promoLinkedinKeywords)
          .where(and(eq(promoLinkedinKeywords.userId, userId), eq(promoLinkedinKeywords.projectId, account.projectId)))
      ).flatMap((row) => (row.kind === "search" ? [row.value] : row.kind === "hashtag" ? [`#${row.value}`] : []))
    : []
  await linkedinWarmUp(target, { words: words.slice(0, 10) })
}
