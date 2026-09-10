import { createHash, randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/trade/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { tradeNoticeLinks } from "@/server/trade/schema"
import type { TradeSoundKind } from "@/lib/trade/trade-sounds"

/**
 * Write one app notice straight to the wallet owner's inbox.
 *
 * The notice is a notification row and nothing else. It carries its own words,
 * it belongs to one account, and only that account ever sees it. Trade notices
 * used to be written as announcements as well, which filled the Announcements
 * dashboard with thousands of fills; the words live in `message` and `detail`
 * now, which is what those columns are for.
 */
export async function writeTradeNotice({
  userId,
  title,
  body,
  level,
  href,
  soundKind,
  noticeKey,
  createdAt = new Date(),
  database = db,
}: {
  userId: string
  title: string
  body: string
  level: "info" | "warning" | "critical"
  /**
   * The page this notice came off, so clicking it in the bell goes there.
   *
   * A path inside this app or nothing. Nothing is the honest answer for a
   * notice with no page behind it, and it leaves the notice exactly as every
   * trade notice used to be: words, and no click.
   */
  href?: string | null
  /** The sound an open trading screen may play, or none for a quiet notice. */
  soundKind?: TradeSoundKind | null
  /** Stable within this recipient. Later pieces update the same inbox row. */
  noticeKey?: string
  createdAt?: Date
  database?: CustomShellDb
}): Promise<void> {
  // The id is the same for every piece of one event, so the second piece of a
  // fill updates the notice already in the bell instead of adding another.
  const noticeId = noticeKey
    ? createHash("sha256")
        .update(JSON.stringify([userId, noticeKey]))
        .digest("hex")
        .slice(0, 36)
    : randomUUID()
  await database
    .insert(customShellNotifications)
    .values({
      id: noticeId,
      recipientUserId: userId,
      type: "app_activity",
      message: title,
      detail: body,
      createdAt,
    })
    .onConflictDoUpdate({
      target: customShellNotifications.id,
      // Only the words. The arrival time and the read dot belong to the notice
      // the reader has already seen, and a later piece of the same fill is not
      // a new thing to look at.
      set: { message: title, detail: body },
    })
  // Written after the notice itself. A notice that arrives without its page,
  // sound and level is still true; one that never arrives because this row
  // would not save is a lost notice.
  await database
    .insert(tradeNoticeLinks)
    .values({
      noticeId,
      href: href ?? null,
      soundKind: soundKind ?? null,
      level,
    })
    .onConflictDoUpdate({
      target: tradeNoticeLinks.noticeId,
      // The level follows the words: a close that ends up losing money is a
      // warning even when its first piece looked like an ordinary exit. The
      // page and the sound only ever get more certain, so a later piece with
      // nothing to say about them leaves what is already there.
      set: {
        level,
        href: sql`coalesce(${href ?? null}, ${tradeNoticeLinks.href})`,
        soundKind: sql`coalesce(${soundKind ?? null}, ${tradeNoticeLinks.soundKind})`,
      },
    })
  await publishNotificationCreated(userId, database)
}
