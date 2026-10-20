import { and, eq, inArray } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { noteNoticeLinks, noteNotes } from "@/server/note/schema"

/**
 * One notice in the owner's bell tray about an imported note: ready to
 * analyse, analysed, a plan written, or something failed. It goes out as the
 * shell's `app_activity` kind, which each person can switch off in Settings →
 * Notifications, and the note it is about is kept beside it so clicking it
 * opens that note in its library.
 *
 * Never throws. Nothing is worth failing over a tray notice.
 */
export async function tellOwner(options: {
  ownerId: string
  noteId: string
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
    await db.insert(noteNoticeLinks).values({ noticeId: id, noteId: options.noteId })
    await publishNotificationCreated(options.ownerId)
  } catch (error) {
    console.error("A notice was not recorded", options.noteId, error)
  }
}

/** Where each of this person's notices opens. Anybody else's are left out. */
export async function noticeLinks(ownerId: string, noticeIds: string[]): Promise<{ id: string; href: string }[]> {
  if (!noticeIds.length) return []
  const rows = await db
    .select({ id: noteNoticeLinks.noticeId, noteId: noteNoticeLinks.noteId, libraryId: noteNotes.libraryId })
    .from(noteNoticeLinks)
    .innerJoin(customShellNotifications, eq(customShellNotifications.id, noteNoticeLinks.noticeId))
    .innerJoin(noteNotes, eq(noteNotes.id, noteNoticeLinks.noteId))
    .where(and(eq(customShellNotifications.recipientUserId, ownerId), inArray(noteNoticeLinks.noticeId, noticeIds)))
  return rows.map((row) => ({
    id: row.id,
    href: `/library/${encodeURIComponent(row.libraryId)}?folder=all&open=${encodeURIComponent(row.noteId)}`,
  }))
}
