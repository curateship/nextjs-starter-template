import { and, eq, isNull, sql } from "drizzle-orm"

import { appName, banKindFromWords } from "@/lib/bans/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { handleWords } from "@/lib/social/networks"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { settleFailedMediumJob } from "@/server/social/medium/settle"
import { ringBell } from "@/server/social/notices"
import { promoAccounts, promoJobs } from "@/server/social/schema"

import { recordBan } from "./record"

/**
 * A Reddit or Medium account whose own browser page says it is suspended or
 * locked (Bans task, part 7): the same rule as X and LinkedIn in a browser
 * and as a phone's ban screen. The account is stopped, which survives the
 * next run because only "Let it run again" clears it, its waiting jobs in
 * its browser are dropped, the ban is recorded, and the bell rings.
 *
 * Only the first time: an account already stopped rings nothing and writes
 * no second ban, though a counted ban after an uncounted one is recorded.
 */
export async function stopForBanPage(
  account: { id: string; userId: string },
  words: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<boolean> {
  const banned = words.trim().slice(0, 500)
  if (!banned) return false
  const [stopped] = await db
    .update(promoAccounts)
    .set({ blocked: true, blockedReason: banned, banScreenAt: now, updatedAt: now })
    .where(and(eq(promoAccounts.id, account.id), eq(promoAccounts.userId, account.userId), isNull(promoAccounts.banScreenAt)))
    .returning({ id: promoAccounts.id, platform: promoAccounts.platform, handle: promoAccounts.handle, profileId: promoAccounts.profileId })
  if (!stopped) {
    // Already stopped: nothing rings, but a suspension after a locked screen
    // still becomes a counted ban (`recordBan` writes nothing otherwise).
    const [already] = await db.select({ platform: promoAccounts.platform }).from(promoAccounts).where(eq(promoAccounts.id, account.id)).limit(1)
    if (already) await recordBan(account.userId, { accountId: account.id, kind: banKindFromWords(banned, already.platform), words: banned }, db, now)
    return false
  }
  const dropped = stopped.profileId
    ? await db
        .delete(promoJobs)
        .where(
          and(
            eq(promoJobs.userId, account.userId),
            eq(promoJobs.status, "queued"),
            eq(promoJobs.lane, stopped.profileId),
            sql`${promoJobs.payload}->>'accountId' = ${stopped.id}`
          )
        )
        .returning({ id: promoJobs.id, kind: promoJobs.kind })
    : []
  for (const job of dropped) await settleFailedMediumJob(job, `Not sent: the account hit a ban page first ("${banned}").`, db)
  await recordBan(account.userId, { accountId: stopped.id, kind: banKindFromWords(banned, stopped.platform), words: banned }, db, now)
  const name = appName(stopped.platform)
  await ringBell(
    account.userId,
    {
      kind: "ban_screen",
      targetId: stopped.id,
      message: `${NOTICE_HEADINGS.ban_screen} ${handleWords(stopped.platform, stopped.handle) || `a ${name} account`} in its browser`,
      detail: [
        `${name} showed: "${banned}".`,
        `Promo stopped the account${dropped.length ? ` and dropped its ${dropped.length} waiting ${dropped.length === 1 ? "job" : "jobs"}` : ""}.`,
        "Appeal it in the browser window first if you want to, then let it run again or press Clean up from the ban in the Anti Detect dashboard's Bans.",
      ].join(" "),
      href: "/admin/anti-detect?section=bans",
    },
    db,
    now
  )
  return true
}
