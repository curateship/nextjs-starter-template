import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { requireAppOrigin } from "@/server/auth/origin"
import {
  customShellAnnouncements,
  customShellAutomationRuns,
  customShellAutomations,
  customShellFeedback,
  customShellNotifications,
  customShellUsers,
  type CustomShellNotification,
  type CustomShellUser,
} from "@/server/schema"
import { findCurrentUser, now } from "@/server/auth/security"
import { type NotificationItem } from "@/lib/api/notification"
import {
  createDefaultNotificationTypeVisibility,
  visibleNotificationTypes,
  type AutomationApprovalState,
  type NotificationTypeVisibility,
} from "@/lib/notification-types"
import { readShellGlobals } from "@/server/shell-settings"
import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import { plainAutomationFailure } from "@/lib/automations/failure-message"
import { automationNodeName } from "@/lib/automations/node-registry"

type NotificationListResponse = {
  notifications: NotificationItem[]
  next_cursor: string | null
  unread_count: number
  /** The bell's own number. See `countUnseenNotifications`. */
  unseen_count: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const CURSOR_SEPARATOR = "|"

export async function listCurrentUserNotificationPage({
  cursor,
  limit,
}: {
  cursor?: string
  limit?: number
}) {
  const user = await requireNotificationUser()
  const { notificationTypes } = await readShellGlobals(db)

  return getNotificationPage({
    currentUser: user,
    cursor,
    limit,
    database: db,
    notificationTypes,
  })
}

/**
 * How many notices this person has not read. The shell asks on every bootstrap
 * so the bell can carry its dot on arrival — without it the tray only knows its
 * own count after you have already opened it, which is too late to tell you
 * anything.
 *
 * It is also what a live nudge makes the browser fetch while the tray is shut.
 * That was deliberately made a count of its own rather than a
 * `router.invalidate()`: invalidating re-runs the whole shell loader —
 * settings, workspaces, plan, live announcements — plus every other loader on
 * the page, in every open tab, every time anybody thumbs-ups a piece of
 * feedback. This is one `count(*)` on an indexed column.
 */
export async function countUnreadNotifications(
  userId: string,
  database: CustomShellDb = db,
  notificationTypes: NotificationTypeVisibility = createDefaultNotificationTypeVisibility()
): Promise<number> {
  const shownTypes = visibleNotificationTypes(notificationTypes)
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(customShellNotifications)
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        isNull(customShellNotifications.readAt),
        shownTypes.length
          ? inArray(customShellNotifications.type, shownTypes)
          : sql`false`
      )
    )

  return row?.count ?? 0
}

/**
 * The red number on the bell: notices this person has not read AND has not
 * been shown yet.
 *
 * Seen and read are two different things. Opening the bell means you have been
 * told something arrived, so the number goes; the notices themselves stay
 * unread in the tray until one is clicked or "Mark all as read" is pressed
 * (Tyler, 22 Sep 2026). Without the second column the bell could only clear by
 * marking everything read, which emptied the Unread tab in the same instant.
 */
export async function countUnseenNotifications(
  userId: string,
  database: CustomShellDb = db,
  notificationTypes: NotificationTypeVisibility = createDefaultNotificationTypeVisibility()
): Promise<number> {
  const shownTypes = visibleNotificationTypes(notificationTypes)
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(customShellNotifications)
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        isNull(customShellNotifications.readAt),
        isNull(customShellNotifications.seenAt),
        shownTypes.length
          ? inArray(customShellNotifications.type, shownTypes)
          : sql`false`
      )
    )

  return row?.count ?? 0
}

/**
 * Stamp everything waiting as shown, which is what opening the bell means.
 *
 * It touches `seenAt` and nothing else, so every row it stamps is still
 * unread and still sits in the Unread tab afterwards. A hidden notice type is
 * stamped too: it is not in the number either way, and leaving it unstamped
 * would put the number back the day that type is switched on again.
 */
export async function markCurrentUserNotificationsSeen() {
  requireAppOrigin()
  const user = await requireNotificationUser()
  const seenAt = now()

  const rows = await db
    .update(customShellNotifications)
    .set({ seenAt })
    .where(
      and(
        eq(customShellNotifications.recipientUserId, user.id),
        isNull(customShellNotifications.seenAt)
      )
    )
    .returning({ id: customShellNotifications.id })

  // The bell is one number about one person, so this person's other tabs clear
  // theirs too.
  if (rows.length) await publishNotificationCreated(user.id)

  return { seenCount: rows.length, seenAt: seenAt.toISOString() }
}

export async function markCurrentUserNotificationRead(notificationId: string) {
  requireAppOrigin()
  const user = await requireNotificationUser()
  const readAt = now()

  const [row] = await db
    .update(customShellNotifications)
    .set({ readAt })
    .where(
      and(
        eq(customShellNotifications.id, notificationId),
        eq(customShellNotifications.recipientUserId, user.id)
      )
    )
    .returning({ id: customShellNotifications.id })

  if (!row) {
    throw new Error("Notification not found")
  }

  // Reading a notice in one tab clears the dot in this person's other tabs.
  // The bell is one number about one person, so it has to agree with itself
  // wherever they have the app open.
  await publishNotificationCreated(user.id)

  return { notificationId: row.id, readAt: readAt.toISOString() }
}

export async function markAllCurrentUserNotificationsRead() {
  requireAppOrigin()
  const user = await requireNotificationUser()
  const { notificationTypes } = await readShellGlobals(db)
  const shownTypes = visibleNotificationTypes(notificationTypes)
  const readAt = now()

  const rows = await db
    .update(customShellNotifications)
    .set({ readAt })
    .where(
      and(
        eq(customShellNotifications.recipientUserId, user.id),
        isNull(customShellNotifications.readAt),
        shownTypes.length
          ? inArray(customShellNotifications.type, shownTypes)
          : sql`false`
      )
    )
    .returning({ id: customShellNotifications.id })

  // Same reason as above: the other tabs' bells go to zero too.
  if (rows.length) await publishNotificationCreated(user.id)

  return {
    notificationIds: rows.map((row) => row.id),
    readAt: readAt.toISOString(),
  }
}

async function requireNotificationUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

/** One person's own notices, newest first — what the bell in the header shows. */
export async function getNotificationPage({
  currentUser,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  database = db,
  notificationTypes = createDefaultNotificationTypeVisibility(),
}: {
  currentUser: Pick<CustomShellUser, "id">
  cursor?: string
  limit?: number
  database?: CustomShellDb
  notificationTypes?: NotificationTypeVisibility
}): Promise<NotificationListResponse> {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const conditions: SQL[] = [
    eq(customShellNotifications.recipientUserId, currentUser.id),
  ]
  const shownTypes = visibleNotificationTypes(notificationTypes)
  conditions.push(
    shownTypes.length
      ? inArray(customShellNotifications.type, shownTypes)
      : sql`false`
  )

  if (cursor) {
    const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
    const createdAt = new Date(createdAtValue ?? "")
    if (!createdAtValue || !id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid notification cursor")
    }

    const cursorCondition = or(
      lt(customShellNotifications.createdAt, createdAt),
      and(
        eq(customShellNotifications.createdAt, createdAt),
        lt(customShellNotifications.id, id)
      )
    )
    if (cursorCondition) {
      conditions.push(cursorCondition)
    }
  }

  const rows = await database
    .select()
    .from(customShellNotifications)
    .where(and(...conditions))
    .orderBy(
      desc(customShellNotifications.createdAt),
      desc(customShellNotifications.id)
    )
    .limit(pageSize + 1)

  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)

  // The three go together rather than one after another. The tray waits on
  // this, and two counts asked in turn are two round trips for numbers that do
  // not depend on each other.
  const [notifications, unread_count, unseen_count] = await Promise.all([
    serializeNotificationRows(pageRows, database),
    countUnreadNotifications(currentUser.id, database, notificationTypes),
    countUnseenNotifications(currentUser.id, database, notificationTypes),
  ])

  return {
    notifications,
    next_cursor:
      rows.length > pageSize && lastRow
        ? `${lastRow.createdAt.toISOString()}${CURSOR_SEPARATOR}${lastRow.id}`
        : null,
    unread_count,
    unseen_count,
  }
}

export async function serializeNotificationRows(
  rows: CustomShellNotification[],
  database: CustomShellDb
) {
  if (!rows.length) {
    return []
  }

  // Each kind of notice fills in one of these and leaves the rest null, so each
  // lookup only asks about the rows that actually have one.
  const userIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.actorUserId
          ? [row.actorUserId, row.recipientUserId]
          : [row.recipientUserId]
      )
    )
  )
  const feedbackIds = Array.from(
    new Set(rows.flatMap((row) => (row.feedbackId ? [row.feedbackId] : [])))
  )
  const announcementIds = Array.from(
    new Set(
      rows.flatMap((row) => (row.announcementId ? [row.announcementId] : []))
    )
  )
  const automationRunIds = Array.from(
    new Set(
      rows.flatMap((row) => (row.automationRunId ? [row.automationRunId] : []))
    )
  )

  const [
    userRows,
    feedbackRows,
    announcementRows,
    automationRunRows,
  ] = await Promise.all([
    database
      .select({
        id: customShellUsers.id,
        name: customShellUsers.name,
        avatarUrl: customShellUsers.avatarUrl,
      })
      .from(customShellUsers)
      .where(inArray(customShellUsers.id, userIds)),
    feedbackIds.length
      ? database
          .select({
            id: customShellFeedback.id,
            message: customShellFeedback.message,
          })
          .from(customShellFeedback)
          .where(inArray(customShellFeedback.id, feedbackIds))
      : [],
    announcementIds.length
      ? database
          .select({
            id: customShellAnnouncements.id,
            title: customShellAnnouncements.title,
            body: customShellAnnouncements.body,
          })
          .from(customShellAnnouncements)
          .where(inArray(customShellAnnouncements.id, announcementIds))
      : [],
    automationRunIds.length
      ? database
          .select({
            id: customShellAutomationRuns.id,
            automationId: customShellAutomations.id,
            automationName: customShellAutomations.name,
            approvalSummary: customShellAutomationRuns.approvalSummary,
            currentNodeId: customShellAutomationRuns.currentNodeId,
            configSnapshot: customShellAutomationRuns.configSnapshot,
            error: customShellAutomationRuns.error,
          })
          .from(customShellAutomationRuns)
          .innerJoin(
            customShellAutomations,
            eq(
              customShellAutomations.id,
              customShellAutomationRuns.automationId
            )
          )
          .where(inArray(customShellAutomationRuns.id, automationRunIds))
      : [],
  ])

  const userNames = new Map(userRows.map((row) => [row.id, row.name]))
  const userAvatars = new Map(userRows.map((row) => [row.id, row.avatarUrl]))
  const feedbackMessages = new Map(
    feedbackRows.map((row) => [row.id, row.message])
  )
  const announcements = new Map(announcementRows.map((row) => [row.id, row]))
  const automations = new Map(automationRunRows.map((row) => [row.id, row]))

  return rows.map((row) => ({
    id: row.id,
    type: row.type as NotificationItem["type"],
    actor_name: row.actorUserId
      ? (userNames.get(row.actorUserId) ?? "Unknown")
      : null,
    // The photo goes with the name, so a row can show whose doing it was.
    actor_avatar_url: row.actorUserId
      ? (userAvatars.get(row.actorUserId) ?? null)
      : null,
    recipient_name: userNames.get(row.recipientUserId) ?? "Unknown",
    feedback_id: row.feedbackId,
    feedback_message: row.feedbackId
      ? (feedbackMessages.get(row.feedbackId) ?? "Deleted feedback")
      : null,
    announcement_id: row.announcementId,
    // Deleting an announcement takes its notices with it, so the fallback here
    // only ever shows during the moment between the two.
    announcement_title: row.announcementId
      ? (announcements.get(row.announcementId)?.title ?? "Deleted announcement")
      : null,
    announcement_body: row.announcementId
      ? (announcements.get(row.announcementId)?.body ?? "")
      : null,
    automation_run_id: row.automationRunId,
    automation_id: row.automationRunId
      ? (automations.get(row.automationRunId)?.automationId ?? null)
      : null,
    // Deleting a run takes its notices with it, so the fallback here only ever
    // shows during the moment between the two.
    automation_name: row.automationRunId
      ? (automations.get(row.automationRunId)?.automationName ?? "Deleted flow")
      : null,
    automation_approval_summary: row.automationRunId
      ? (automations.get(row.automationRunId)?.approvalSummary ?? null)
      : null,
    automation_approval_state:
      (row.automationApprovalState as AutomationApprovalState | null) ?? null,
    automation_failure_node_id:
      row.type === "automation_failed"
        ? (automations.get(row.automationRunId ?? "")?.currentNodeId ?? null)
        : null,
    automation_failure_node_name:
      row.type === "automation_failed"
        ? automationFailureNodeName(automations.get(row.automationRunId ?? ""))
        : null,
    automation_failure_error:
      row.type === "automation_failed"
        ? plainAutomationFailure(
            automations.get(row.automationRunId ?? "")?.error ?? null
          )
        : null,
    // A follow-up notice needs no join: it carries its own words, and this is
    // the one thing it points at.
    crm_thread_id: row.crmThreadId,
    message: row.message,
    detail: row.detail,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }))
}

function automationFailureNodeName(
  run:
    | {
        currentNodeId: string
        configSnapshot: unknown
      }
    | undefined
): string {
  if (!run) return "Unknown step"
  const config = automationCompiledConfigSchema.safeParse(run.configSnapshot)
  const node = config.success ? config.data.nodes[run.currentNodeId] : undefined
  return node
    ? automationNodeName({
        id: run.currentNodeId,
        kind: node.kind,
        x: 0,
        y: 0,
        settings: node.settings,
      })
    : "Unknown step"
}
