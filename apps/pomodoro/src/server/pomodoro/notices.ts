import { randomUUID } from "node:crypto"

import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm"

import {
  groupJoinMessage,
  reportNewMessage,
  type ReportedThing,
  KINDS_LINKING_TO_THE_ACTOR,
  NOTICE_KIND_CATEGORY,
  type PomodoroNoticeCategoryId,
  type PomodoroNoticeKind,
} from "@/lib/pomodoro/notices"
import { db, type CustomShellDb } from "@/server/db"
import {
  publishNotificationCreated,
  publishNotificationCreatedMany,
} from "@/server/notifications/events"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import {
  pomodoroFollows,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  roomReports,
} from "@/server/pomodoro/schema"
import { customShellNotifications, customShellUsers } from "@/server/schema"

/**
 * The database a notice is written with: the shared handle, or the
 * transaction of the action the notice is about. Always the second when there
 * is one, so the notice and the thing it describes commit or vanish together.
 */
type NoticeDatabase =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/** One notice to write. See `workspace/docs/notifications.md` for the rules. */
export type NewNotice = {
  recipientUserId: string
  /** The person the notice is about, or null when it is about the reader. */
  actorUserId?: string | null
  kind: PomodoroNoticeKind
  message: string
  detail?: string | null
  roomId?: string | null
  groupId?: string | null
  messageId?: string | null
  /** A fixed page of this app. Never a person's page, which is read live. */
  href?: string | null
  /** How many events this notice already stands for. One unless folding. */
  foldCount?: number
}

/**
 * Writes notices and nudges every recipient's bell.
 *
 * The one way this app writes a notice. Each gets the shell's row and the
 * link row that says what it is, in one pass for any number of recipients,
 * and the nudge is sent on the same database handle, so inside a transaction
 * it waits for the commit.
 */
export async function writeNotices(
  database: NoticeDatabase,
  notices: readonly NewNotice[]
) {
  if (notices.length === 0) return
  const createdAt = new Date()
  const rows = notices.map((notice) => ({ ...notice, id: randomUUID() }))
  await database.insert(customShellNotifications).values(
    rows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipientUserId,
      actorUserId: row.actorUserId ?? null,
      // The shell restricts `type` to a fixed list and `app_activity` is the
      // slot it keeps for an app. A name of our own is refused by a CHECK
      // constraint on the table.
      type: "app_activity",
      message: row.message,
      detail: row.detail ?? null,
      createdAt,
    }))
  )
  await database.insert(pomodoroNoticeLinks).values(
    rows.map((row) => ({
      noticeId: row.id,
      kind: row.kind,
      roomId: row.roomId ?? null,
      groupId: row.groupId ?? null,
      messageId: row.messageId ?? null,
      href: row.href ?? null,
      foldCount: row.foldCount ?? 1,
    }))
  )
  await publishNotificationCreatedMany(
    rows.map((row) => row.recipientUserId),
    database
  )
}

/** What a folding notice is about: the room, group or message it gathers. */
type FoldSubject = {
  roomId?: string
  groupId?: string
  messageId?: string
}

/** The words and count a folding notice is written with. */
type FoldedWords = { message: string; detail: string | null; foldCount: number }

/**
 * Writes a notice, or folds it into the reader's unread notice of the same
 * kind about the same room, group or message.
 *
 * `compose` is handed what the waiting notice says (or null when there is
 * none) and answers the words to write. A fold that is news moves the notice
 * back to the top of the tray and back into the red number; `bump: false` is
 * for a correction, such as a reaction taken back, which must do neither.
 */
export async function foldNotice(
  database: NoticeDatabase,
  {
    recipientUserId,
    actorUserId,
    kind,
    subject,
    href,
    bump = true,
    onlyIfWaiting = false,
    compose,
  }: {
    recipientUserId: string
    actorUserId: string | null
    kind: PomodoroNoticeKind
    subject: FoldSubject
    href: string | null
    bump?: boolean
    /** Only correct a waiting notice; never write a new one. */
    onlyIfWaiting?: boolean
    compose: (
      waiting: { detail: string | null; foldCount: number } | null
    ) => FoldedWords
  }
) {
  const [waiting] = await database
    .select({
      id: customShellNotifications.id,
      detail: customShellNotifications.detail,
      foldCount: pomodoroNoticeLinks.foldCount,
    })
    .from(customShellNotifications)
    .innerJoin(
      pomodoroNoticeLinks,
      eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
    )
    .where(
      and(
        eq(customShellNotifications.recipientUserId, recipientUserId),
        isNull(customShellNotifications.readAt),
        eq(pomodoroNoticeLinks.kind, kind),
        ...(subject.roomId ? [eq(pomodoroNoticeLinks.roomId, subject.roomId)] : []),
        ...(subject.groupId
          ? [eq(pomodoroNoticeLinks.groupId, subject.groupId)]
          : []),
        ...(subject.messageId
          ? [eq(pomodoroNoticeLinks.messageId, subject.messageId)]
          : [])
      )
    )
    .limit(1)

  if (!waiting && onlyIfWaiting) return
  const words = compose(waiting ?? null)
  if (!waiting) {
    await writeNotices(database, [
      {
        recipientUserId,
        actorUserId,
        kind,
        message: words.message,
        detail: words.detail,
        href,
        foldCount: words.foldCount,
        roomId: subject.roomId ?? null,
        groupId: subject.groupId ?? null,
        messageId: subject.messageId ?? null,
      },
    ])
    return
  }

  await database
    .update(customShellNotifications)
    .set({
      message: words.message,
      detail: words.detail,
      ...(bump ? { createdAt: new Date(), seenAt: null } : {}),
    })
    .where(eq(customShellNotifications.id, waiting.id))
  await database
    .update(pomodoroNoticeLinks)
    .set({ foldCount: words.foldCount })
    .where(eq(pomodoroNoticeLinks.noticeId, waiting.id))
  await publishNotificationCreated(recipientUserId, database)
}

/**
 * Somebody joined a group: tell its owner, folding into an unread notice
 * about the same group. It keeps the first joiner's name, saved as the
 * notice's detail, and counts the rest.
 */
export async function noteGroupJoin(
  database: NoticeDatabase,
  {
    ownerUserId,
    joinerUserId,
    joinerName,
    groupId,
    groupName,
  }: {
    ownerUserId: string
    joinerUserId: string
    joinerName: string
    groupId: string
    groupName: string
  }
) {
  await foldNotice(database, {
    recipientUserId: ownerUserId,
    actorUserId: joinerUserId,
    kind: "group_join",
    subject: { groupId },
    href: "/leaderboard",
    compose: (waiting) => {
      const first = waiting?.detail ?? joinerName
      const foldCount = (waiting?.foldCount ?? 0) + 1
      return {
        message: groupJoinMessage(first, foldCount - 1, groupName),
        detail: first,
        foldCount,
      }
    },
  })
}

/**
 * Takes away unread notices that would now lead nowhere useful: an invite to
 * a room that was cancelled, "it's open" or "Sam opened it" once it closed.
 * Read ones stay, because somebody has already seen them.
 */
export async function dropUnreadRoomNotices(
  database: NoticeDatabase,
  roomIds: readonly string[],
  kinds: readonly PomodoroNoticeKind[]
) {
  if (roomIds.length === 0) return
  await database.delete(customShellNotifications).where(
    and(
      isNull(customShellNotifications.readAt),
      inArray(
        customShellNotifications.id,
        database
          .select({ id: pomodoroNoticeLinks.noticeId })
          .from(pomodoroNoticeLinks)
          .where(
            and(
              inArray(pomodoroNoticeLinks.roomId, [...roomIds]),
              inArray(pomodoroNoticeLinks.kind, [...kinds])
            )
          )
      )
    )
  )
}

/**
 * A host deleted a chat message: its mention and reaction notices go with it,
 * read or not, because they would quote a line the room no longer shows.
 */
export async function dropMessageNotices(
  database: NoticeDatabase,
  messageId: string
) {
  await database.delete(customShellNotifications).where(
    inArray(
      customShellNotifications.id,
      database
        .select({ id: pomodoroNoticeLinks.noticeId })
        .from(pomodoroNoticeLinks)
        .where(eq(pomodoroNoticeLinks.messageId, messageId))
    )
  )
}

/**
 * The people who follow somebody and may be told about them now: nobody
 * across a block, and nobody already sent `cap` notices of this kind in the
 * last `withinMs`. One query for the followers, one for the blocks and one
 * for the counts, however many followers there are.
 *
 * Read with the shared handle, so call it before a transaction, never inside
 * one.
 */
export async function followersToTell(
  userId: string,
  kind: PomodoroNoticeKind,
  { cap, withinMs }: { cap: number; withinMs: number }
) {
  const followers = (
    await db
      .select({ id: pomodoroFollows.followerUserId })
      .from(pomodoroFollows)
      .where(eq(pomodoroFollows.followedUserId, userId))
  ).map((row) => row.id)
  if (followers.length === 0) return []

  const since = new Date(Date.now() - withinMs)
  const [blocked, sent] = await Promise.all([
    blockedUserIdsFor(userId),
    db
      .select({
        recipientUserId: customShellNotifications.recipientUserId,
        value: count(),
      })
      .from(customShellNotifications)
      .innerJoin(
        pomodoroNoticeLinks,
        eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
      )
      .where(
        and(
          eq(pomodoroNoticeLinks.kind, kind),
          inArray(customShellNotifications.recipientUserId, followers),
          gte(customShellNotifications.createdAt, since)
        )
      )
      .groupBy(customShellNotifications.recipientUserId),
  ])
  const full = new Set(
    sent.filter((row) => row.value >= cap).map((row) => row.recipientUserId)
  )
  return followers.filter((id) => !blocked.has(id) && !full.has(id))
}

/**
 * Takes back the reader's unread notice of one kind about one chat message,
 * for a reaction notice whose last reaction was taken away.
 */
export async function dropUnreadMessageNotice(
  database: NoticeDatabase,
  recipientUserId: string,
  kind: PomodoroNoticeKind,
  messageId: string
) {
  await database.delete(customShellNotifications).where(
    and(
      eq(customShellNotifications.recipientUserId, recipientUserId),
      isNull(customShellNotifications.readAt),
      inArray(
        customShellNotifications.id,
        database
          .select({ id: pomodoroNoticeLinks.noticeId })
          .from(pomodoroNoticeLinks)
          .where(
            and(
              eq(pomodoroNoticeLinks.kind, kind),
              eq(pomodoroNoticeLinks.messageId, messageId)
            )
          )
      )
    )
  )
}

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
 * A notice about a person (a cheer, a streak) leads to that person's public
 * page, worked out now rather than saved: the page can be switched off,
 * hidden by an operator, renamed or blocked after the notice arrived, and a
 * link to a page that answers 404 is worse than no link. Every other notice
 * leads to the fixed page saved with it.
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
      href: pomodoroNoticeLinks.href,
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

  const linksToActor = (row: (typeof rows)[number]) =>
    KINDS_LINKING_TO_THE_ACTOR.includes(row.kind) && Boolean(row.actorUserId)
  const actorIds = [
    ...new Set(
      rows.flatMap((row) =>
        linksToActor(row) && row.actorUserId ? [row.actorUserId] : []
      )
    ),
  ]
  const [pages, blocked] = await Promise.all([
    actorIds.length
      ? database
          .select({
            userId: pomodoroProfiles.userId,
            handle: pomodoroProfiles.handle,
            profilePublic: pomodoroProfiles.profilePublic,
            hiddenAt: pomodoroProfiles.hiddenAt,
          })
          .from(pomodoroProfiles)
          .where(inArray(pomodoroProfiles.userId, actorIds))
      : Promise.resolve([]),
    actorIds.length ? blockedUserIdsFor(userId) : Promise.resolve(new Set()),
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
        href: linksToActor(row)
          ? (openPages.get(row.actorUserId ?? "") ?? null)
          : row.href,
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

/** Where a report notice leads: the queue every report lands in. */
export const REPORT_QUEUE_PAGE = "/admin/pomodoro-reports"

/**
 * The accounts that work the report queue: every active admin.
 *
 * Read with the shared handle, so call it before a transaction, never inside
 * one.
 */
export async function reportQueueAdminIds(database: CustomShellDb = db) {
  const rows = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(
      and(eq(customShellUsers.role, "admin"), eq(customShellUsers.status, "active"))
    )
  return rows.map((row) => row.id)
}

/**
 * A report landed: tell every admin, folding into each one's unread report
 * notice so five reports are one line. An admin who filed it is not told
 * about their own report. The notice names nobody; the queue does.
 */
export async function noteNewReport(
  database: NoticeDatabase,
  {
    adminIds,
    reporterUserId,
    thing,
  }: {
    adminIds: readonly string[]
    reporterUserId: string | null
    thing: ReportedThing
  }
) {
  for (const adminId of adminIds) {
    if (adminId === reporterUserId) continue
    await foldNotice(database, {
      recipientUserId: adminId,
      actorUserId: null,
      kind: "report_new",
      subject: {},
      href: REPORT_QUEUE_PAGE,
      compose: (waiting) => {
        const foldCount = (waiting?.foldCount ?? 0) + 1
        return {
          message: reportNewMessage(thing, foldCount),
          detail: null,
          foldCount,
        }
      },
    })
  }
}

/**
 * Once nothing in the queue is open, every admin's unread "new report"
 * notice turns read: there is nothing left for it to point at.
 */
export async function clearReportNoticesIfQueueEmpty(database: NoticeDatabase) {
  const [open] = await database
    .select({ value: count() })
    .from(roomReports)
    .where(eq(roomReports.status, "pending"))
  if ((open?.value ?? 0) > 0) return

  const now = new Date()
  const marked = await database
    .update(customShellNotifications)
    .set({
      readAt: now,
      seenAt: sql`coalesce(${customShellNotifications.seenAt}, ${now})`,
    })
    .where(
      and(
        isNull(customShellNotifications.readAt),
        inArray(
          customShellNotifications.id,
          database
            .select({ id: pomodoroNoticeLinks.noticeId })
            .from(pomodoroNoticeLinks)
            .where(eq(pomodoroNoticeLinks.kind, "report_new"))
        )
      )
    )
    .returning({ recipientUserId: customShellNotifications.recipientUserId })
  if (marked.length)
    await publishNotificationCreatedMany(
      [...new Set(marked.map((row) => row.recipientUserId))],
      database
    )
}
