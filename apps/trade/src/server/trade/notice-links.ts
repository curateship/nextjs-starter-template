import { and, asc, eq, gt, inArray, isNotNull, or } from "drizzle-orm"

import { db } from "@/server/db"
import { customShellNotifications } from "@/server/schema"
import { tradeNoticeLinks } from "@/server/trade/schema"
import type {
  TradeSoundCursor,
  TradeSoundEvent,
} from "@/lib/trade/trade-sounds"

/**
 * Which of these notices have a page behind them, and where it is.
 *
 * Asked for by notification id — one person's copy of a notice — and answered
 * by the same ids, because that is what the bell has in its hand. The join
 * through `recipient_user_id` is what makes an id somebody else guessed
 * useless: it is not this reader's notice, so it is not in the answer.
 *
 * A notice with no row here is simply absent from the answer rather than
 * present with a null. The caller reads "is there an address for this one",
 * and absent is that question's cleanest no.
 */
export async function tradeNoticeLinksFor(
  userId: string,
  notificationIds: readonly string[]
): Promise<Record<string, string>> {
  if (notificationIds.length === 0) return {}

  const rows = await db
    .select({
      notificationId: customShellNotifications.id,
      href: tradeNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(
      tradeNoticeLinks,
      eq(
        tradeNoticeLinks.announcementId,
        customShellNotifications.announcementId
      )
    )
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        inArray(customShellNotifications.id, [...notificationIds]),
        isNotNull(tradeNoticeLinks.href)
      )
    )

  return Object.fromEntries(
    rows.map((row) => [row.notificationId, row.href as string])
  )
}

/** New audible trade notices after one browser tab's last answer. */
export async function tradeSoundEventsAfter(
  userId: string,
  cursor: TradeSoundCursor
): Promise<{ events: TradeSoundEvent[]; cursor: TradeSoundCursor }> {
  const createdAt = new Date(cursor.afterAt)
  const rows = await db
    .select({
      id: customShellNotifications.id,
      kind: tradeNoticeLinks.soundKind,
      createdAt: customShellNotifications.createdAt,
    })
    .from(customShellNotifications)
    .innerJoin(
      tradeNoticeLinks,
      eq(
        tradeNoticeLinks.announcementId,
        customShellNotifications.announcementId
      )
    )
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        isNotNull(tradeNoticeLinks.soundKind),
        or(
          gt(customShellNotifications.createdAt, createdAt),
          and(
            eq(customShellNotifications.createdAt, createdAt),
            gt(customShellNotifications.id, cursor.afterId)
          )
        )
      )
    )
    .orderBy(
      asc(customShellNotifications.createdAt),
      asc(customShellNotifications.id)
    )
    .limit(200)

  const events = rows.map((row) => ({
    id: row.id,
    kind: row.kind as TradeSoundEvent["kind"],
    createdAt: row.createdAt.getTime(),
  }))
  const last = events.at(-1)
  return {
    events,
    cursor: last ? { afterAt: last.createdAt, afterId: last.id } : cursor,
  }
}
