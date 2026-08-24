import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { customShellNotifications } from "@/server/schema"
import { tradeNoticeLinks } from "@/server/trade/schema"

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
      eq(tradeNoticeLinks.announcementId, customShellNotifications.announcementId)
    )
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        inArray(customShellNotifications.id, [...notificationIds])
      )
    )

  return Object.fromEntries(rows.map((row) => [row.notificationId, row.href]))
}
