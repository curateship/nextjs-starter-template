import { eq } from "drizzle-orm"

import type { PhoneEventKind } from "@/lib/phones/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { noticeId, noticeRung, writePromoNotice, type PromoNotice } from "@/server/social/notices"
import { promoNotices } from "@/server/social/schema"
import type { PromoNoticeKind } from "@/lib/social/notice-words"

import { recordPhoneEvent } from "./history"

/**
 * The bell notices for a phone or the rack that has a problem: offline, hot,
 * no signal, storage nearly full, the rack not checking in.
 *
 * Each is one of Promo's own notices (`src/server/social/notices.ts`), so its
 * id comes from the problem and the phone: one phone has at most one notice
 * per problem. A problem is raised once and left where it is while it lasts,
 * so a sweep every fifteen seconds over an offline phone leaves one notice,
 * not one per sweep, and never brings it back to the top. It is taken out of
 * the bell when the problem goes away.
 *
 * Both write a line in the phone's history when there is a phone.
 */

type HistoryLine = { phoneId: string; kind: PhoneEventKind; detail: string }

/** Raises the notice unless it is already up. True when it was raised now. */
export async function raiseProblem(
  userId: string,
  notice: PromoNotice,
  history: HistoryLine | null = null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<boolean> {
  if (await noticeRung(notice.kind, notice.targetId, db)) return false
  await writePromoNotice(userId, notice, db, now)
  if (history) await recordPhoneEvent(userId, history.phoneId, history.kind, history.detail, db, now)
  return true
}

/** Takes the notice out of the bell, if it is up. True when it was cleared now. */
export async function clearProblem(
  userId: string,
  kind: PromoNoticeKind,
  targetId: string,
  history: HistoryLine | null = null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<boolean> {
  const id = noticeId(kind, targetId)
  const cleared = await db.delete(promoNotices).where(eq(promoNotices.id, id)).returning({ id: promoNotices.id })
  if (!cleared.length) return false
  await db.delete(customShellNotifications).where(eq(customShellNotifications.id, id))
  await publishNotificationCreated(userId, db)
  if (history) await recordPhoneEvent(userId, history.phoneId, history.kind, history.detail, db, now)
  return true
}
