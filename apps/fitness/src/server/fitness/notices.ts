import { and, eq, inArray } from "drizzle-orm"

import type { FitnessNoticeKind } from "@/lib/fitness/notices"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import type { FitnessDb } from "@/server/fitness/access"
import { fitnessNoticeLinks } from "@/server/fitness/schema"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"


/**
 * Puts one of Fitness's notices in someone's bell. The shell keeps the words;
 * `fitness_notice_links` keeps where clicking it goes, which the bell asks for
 * through `notifications.detailsFor` in `src/app/options.ts`.
 */
export async function sendFitnessNotice(
  {
    recipientUserId,
    actorUserId = null,
    kind,
    message,
    detail,
    href,
  }: {
    recipientUserId: string
    actorUserId?: string | null
    kind: FitnessNoticeKind
    message: string
    detail?: string
    href: string
  },
  database: FitnessDb = db
) {
  const id = uuid()
  await database.insert(customShellNotifications).values({
    id,
    recipientUserId,
    actorUserId,
    type: "app_activity",
    message,
    detail: detail ?? null,
    createdAt: now(),
  })
  await database.insert(fitnessNoticeLinks).values({ noticeId: id, kind, href })
  await publishNotificationCreated(recipientUserId, database)
  return id
}

/** Where each of these notices leads, for the ones that are Fitness's and the asker's own. */
export async function noticeLinks(userId: string, noticeIds: readonly string[], database: FitnessDb = db) {
  if (noticeIds.length === 0) return {}
  const rows = await database
    .select({ noticeId: fitnessNoticeLinks.noticeId, kind: fitnessNoticeLinks.kind, href: fitnessNoticeLinks.href })
    .from(fitnessNoticeLinks)
    .innerJoin(customShellNotifications, eq(customShellNotifications.id, fitnessNoticeLinks.noticeId))
    .where(
      and(
        inArray(fitnessNoticeLinks.noticeId, [...noticeIds]),
        eq(customShellNotifications.recipientUserId, userId)
      )
    )
  return Object.fromEntries(rows.map((row) => [row.noticeId, { kind: row.kind, href: row.href }]))
}
