import { and, eq, inArray, isNull, or, lt } from "drizzle-orm"

import { PHONE_STALE_MS } from "@/lib/phones/options"
import { isAwake } from "@/lib/social/waking"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoPhones } from "@/server/phones/schema"

import { accountTimeZone, readBehaviour } from "../behaviour"
import { promoAccounts } from "../schema"
import { queueInboxRead } from "./inbox"

/**
 * Messages and comments for accounts on iPhones (part 52 of the phone farm).
 *
 * An Android hands its notifications to the rack, so its inbox is opened only
 * when one arrives (`inbox.ts`). An iPhone hands a computer nothing. So, in
 * the account's waking hours, Promo opens each iPhone account's inbox once an
 * hour (Tyler, 18 Oct 2026) by the same path a notification alert takes: one
 * made-up alert per app for messages and one for comments, so the Messages
 * dashboard reads the inbox exactly as it does after an Android alert. The
 * visit is one of the account's behaviour visits, so it counts against a
 * young account's pace. At night nothing is opened.
 */

export const IPHONE_INBOX_GAP_MS = 60 * 60_000

const INBOX_PLATFORMS = ["reddit", "instagram", "tiktok"] as const

/**
 * On the 15-second ticker: every account on a connected iPhone that is not
 * retired, paused by itself, or stopped by a ban screen, whose inbox was not
 * asked for in the last hour and whose account is awake now. Answers how many
 * accounts were asked for. The asking is written before the reads are queued,
 * so a read already waiting does not make the next tick ask again.
 */
export async function queueIphoneInboxReads(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ account: promoAccounts, phone: promoPhones })
    .from(promoAccounts)
    .innerJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
    .where(
      and(
        eq(promoPhones.kind, "iphone"),
        inArray(promoAccounts.platform, [...INBOX_PLATFORMS]),
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.pausedAt),
        isNull(promoAccounts.banScreenAt),
        or(isNull(promoAccounts.inboxAskedAt), lt(promoAccounts.inboxAskedAt, new Date(now.getTime() - IPHONE_INBOX_GAP_MS)))
      )
    )
  let asked = 0
  const hours = new Map<string, { from: number; until: number }>()
  for (const { account, phone } of due) {
    // An iPhone that is offline or held would only fail the read; it is asked next tick.
    const online = phone.adbState === "device" && phone.lastSeenAt !== null && now.getTime() - phone.lastSeenAt.getTime() < PHONE_STALE_MS
    if (!online || phone.held) continue
    if (!hours.has(account.userId)) {
      const behaviour = await readBehaviour(account.userId, db)
      hours.set(account.userId, { from: behaviour.wakeFromMinute, until: behaviour.wakeUntilMinute })
    }
    const { from, until } = hours.get(account.userId)!
    if (!isAwake(now, await accountTimeZone(account, db), from, until)) continue
    await db.update(promoAccounts).set({ inboxAskedAt: now }).where(eq(promoAccounts.id, account.id))
    // Through the inbox, not a notification tap: an iPhone shows the rack no
    // notification, so the visit is recorded as the inbox being opened.
    for (const kind of ["message", "comment"] as const) {
      await queueInboxRead(account.userId, account.id, kind, "inbox", db)
    }
    asked += 1
  }
  return asked
}
