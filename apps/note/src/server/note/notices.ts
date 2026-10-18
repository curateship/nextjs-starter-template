import { and, eq, inArray } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { noteNoticeLinks } from "@/server/note/schema"

/**
 * One notice in the owner's bell tray when a saved video changes: ready to
 * analyse, analysed, or failed. It goes out as the shell's `app_activity`
 * kind, which each person can switch off in Settings → Notifications, and the
 * video it is about is kept beside it so clicking it opens that video.
 *
 * Never throws. A video is not worth failing over a tray notice.
 */
export async function tellOwner(options: {
  ownerId: string
  videoId: string
  message: string
  detail?: string | null
}): Promise<void> {
  try {
    const id = uuid()
    await db.insert(customShellNotifications).values({
      id,
      recipientUserId: options.ownerId,
      type: "app_activity",
      message: options.message,
      detail: options.detail ?? null,
      createdAt: now(),
    })
    await db.insert(noteNoticeLinks).values({ noticeId: id, videoId: options.videoId })
    await publishNotificationCreated(options.ownerId)
  } catch (error) {
    console.error("A video notice was not recorded", options.videoId, error)
  }
}

/** Where each of this person's video notices opens. Anybody else's are left out. */
export async function noticeLinks(
  ownerId: string,
  noticeIds: string[]
): Promise<{ id: string; href: string }[]> {
  if (!noticeIds.length) return []
  const rows = await db
    .select({ id: noteNoticeLinks.noticeId, videoId: noteNoticeLinks.videoId })
    .from(noteNoticeLinks)
    .innerJoin(
      customShellNotifications,
      eq(customShellNotifications.id, noteNoticeLinks.noticeId)
    )
    .where(
      and(
        eq(customShellNotifications.recipientUserId, ownerId),
        inArray(noteNoticeLinks.noticeId, noticeIds)
      )
    )
  return rows.map((row) => ({
    id: row.id,
    href: `/videos?open=${encodeURIComponent(row.videoId)}`,
  }))
}
