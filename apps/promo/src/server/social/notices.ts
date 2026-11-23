import { createHash } from "node:crypto"

import { inArray, and, eq } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import type { PromoNoticeKind } from "@/lib/social/notice-words"

import { promoNotices } from "./schema"

/**
 * The bell notices for things that need a person: a new reply to answer, a
 * comment a moderator removed, a suspended account, a comment or post that
 * failed, and a proxy about to renew.
 *
 * A notice is the shell's own `app_activity` row. Its id is worked out from
 * what it is about, so one thing has one notice: when it happens again, the
 * same notice comes back to the top as unread instead of a second one being
 * added. Because that id cannot carry an address, `promo_notices` remembers
 * where each one opens, and the bell asks for it (`detailsFor` in
 * `src/app/options.ts`).
 *
 * The dead-proxy notice is older and keeps its own shape, in
 * `src/server/browser/notices.ts`.
 */

/**
 * A notice's id: the same kind about the same thing always gives the same
 * id. Shaped like the uuid the column expects, from a hash, so it can never
 * collide with a real row's id by accident.
 */
export function noticeId(kind: PromoNoticeKind, targetId: string): string {
  const hex = createHash("sha256").update(`promo:${kind}:${targetId}`).digest("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-")
}

export type PromoNotice = {
  kind: PromoNoticeKind
  /** What the notice is about: a comment, an account, a job or a proxy. */
  targetId: string
  message: string
  detail: string
  /** Where clicking it goes. An address inside this app only. */
  href: string
}

/** Rings the bell, or brings the same notice back to the top as unread. */
export async function writePromoNotice(
  userId: string,
  notice: PromoNotice,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const id = noticeId(notice.kind, notice.targetId)
  const message = notice.message.slice(0, 300)
  const detail = notice.detail.slice(0, 1_000)
  await db
    .insert(customShellNotifications)
    .values({
      id,
      recipientUserId: userId,
      type: "app_activity",
      message,
      detail,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: customShellNotifications.id,
      set: { message, detail, createdAt: now, readAt: null, seenAt: null },
    })
  await db
    .insert(promoNotices)
    .values({ id, userId, kind: notice.kind, href: notice.href, createdAt: now })
    .onConflictDoUpdate({ target: promoNotices.id, set: { href: notice.href, createdAt: now } })
  await publishNotificationCreated(userId, db)
}

/**
 * Rings the bell and never fails the work that rang it. A notice is the
 * least important thing a job does; a reading that worked must not be
 * reported as failed because the bell could not be written.
 */
export async function ringBell(
  userId: string,
  notice: PromoNotice,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  try {
    await writePromoNotice(userId, notice, db, now)
  } catch (error) {
    console.error(`Could not ring the bell for ${notice.kind} ${notice.targetId}`, error)
  }
}

/** Whether this notice has been rung before, so a once-only notice is not rung twice. */
export async function noticeRung(
  kind: PromoNoticeKind,
  targetId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [row] = await db
    .select({ id: promoNotices.id })
    .from(promoNotices)
    .where(eq(promoNotices.id, noticeId(kind, targetId)))
    .limit(1)
  return Boolean(row)
}

/** Where each of these notices opens, for the bell. Only the person's own. */
export async function noticeLinks(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<Array<{ id: string; kind: PromoNoticeKind; href: string }>> {
  if (!ids.length) return []
  const rows = await db
    .select({ id: promoNotices.id, kind: promoNotices.kind, href: promoNotices.href })
    .from(promoNotices)
    .where(and(eq(promoNotices.userId, userId), inArray(promoNotices.id, ids)))
  return rows.map((row) => ({ ...row, kind: row.kind as PromoNoticeKind }))
}
