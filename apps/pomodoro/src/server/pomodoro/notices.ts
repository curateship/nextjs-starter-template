import { and, eq, inArray, isNull, sql } from "drizzle-orm"

import {
  NOTICE_KIND_CATEGORY,
  type PomodoroNoticeCategoryId,
  type PomodoroNoticeKind,
} from "@/lib/pomodoro/notices"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import {
  pomodoroNoticeLinks,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"

/** What the bell is told about one of this app's notices. */
export type PomodoroNoticeDetail = {
  kind: PomodoroNoticeKind
  categoryId: PomodoroNoticeCategoryId
  /** Where clicking it goes, or null when there is nowhere that would open. */
  href: string | null
}

/**
 * What this app says about these notices: their kind, their tab, and where
 * each one leads.
 *
 * Asked by notification id and answered by the same ids. The join through
 * `recipient_user_id` is what makes an id somebody else guessed useless: it is
 * not this reader's notice, so it is not in the answer. A notice this app did
 * not write has no link row and is simply absent.
 *
 * The link is worked out now rather than saved with the notice. A cheer leads
 * to the sender's public page, and that page can be switched off, hidden by an
 * operator, renamed or blocked after the cheer arrived. A link to a page that
 * answers 404 is worse than no link, so a notice whose page would not open
 * keeps its words and opens nothing.
 */
export async function pomodoroNoticeDetailsFor(
  userId: string,
  notificationIds: readonly string[],
  database: CustomShellDb = db
): Promise<Record<string, PomodoroNoticeDetail>> {
  if (notificationIds.length === 0) return {}

  const rows = await database
    .select({
      id: customShellNotifications.id,
      actorUserId: customShellNotifications.actorUserId,
      kind: pomodoroNoticeLinks.kind,
    })
    .from(customShellNotifications)
    .innerJoin(
      pomodoroNoticeLinks,
      eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
    )
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        inArray(customShellNotifications.id, [...notificationIds])
      )
    )
  if (rows.length === 0) return {}

  const senderIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.kind === "cheer" && row.actorUserId ? [row.actorUserId] : []
      )
    ),
  ]
  const [pages, blocked] = await Promise.all([
    senderIds.length
      ? database
          .select({
            userId: pomodoroProfiles.userId,
            handle: pomodoroProfiles.handle,
            profilePublic: pomodoroProfiles.profilePublic,
            hiddenAt: pomodoroProfiles.hiddenAt,
          })
          .from(pomodoroProfiles)
          .where(inArray(pomodoroProfiles.userId, senderIds))
      : Promise.resolve([]),
    senderIds.length ? blockedUserIdsFor(userId) : Promise.resolve(new Set()),
  ])
  // The same rule the account menu uses for "Your profile": a handle, the page
  // switched on, not hidden by an operator. A block hides the page from this
  // reader too, so it counts as a page that does not open.
  const openPages = new Map(
    pages.flatMap((page) =>
      page.handle &&
      page.profilePublic &&
      !page.hiddenAt &&
      !blocked.has(page.userId)
        ? [[page.userId, `/u/${page.handle}`] as const]
        : []
    )
  )

  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        kind: row.kind,
        categoryId: NOTICE_KIND_CATEGORY[row.kind],
        href:
          row.kind === "cheer" && row.actorUserId
            ? (openPages.get(row.actorUserId) ?? null)
            : null,
      },
    ])
  )
}

/**
 * Opening a room marks this person's unread notices about that room read.
 *
 * Somebody who opens the room from the Rooms page has seen what the "joined"
 * and chat notices were telling them, and a red number that keeps nagging
 * about it afterwards is noise. Only notices saved with this room are
 * touched; the rest of the tray is left alone.
 *
 * The bell is nudged only when something changed, so opening a room with
 * nothing waiting costs one indexed update and nothing else.
 */
export async function markRoomNoticesRead(
  userId: string,
  roomId: string,
  database: CustomShellDb = db
) {
  const now = new Date()
  const marked = await database
    .update(customShellNotifications)
    .set({
      readAt: now,
      // Read implies shown. Leaving `seen_at` empty would keep the notice in
      // the bell's red number after the reader has acted on it.
      seenAt: sql`coalesce(${customShellNotifications.seenAt}, ${now})`,
    })
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        isNull(customShellNotifications.readAt),
        inArray(
          customShellNotifications.id,
          database
            .select({ id: pomodoroNoticeLinks.noticeId })
            .from(pomodoroNoticeLinks)
            .where(eq(pomodoroNoticeLinks.roomId, roomId))
        )
      )
    )
    .returning({ id: customShellNotifications.id })
  if (marked.length) await publishNotificationCreated(userId, database)
  return marked.length
}
