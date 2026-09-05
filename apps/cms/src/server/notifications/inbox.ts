import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { alias, type PgSelect } from "drizzle-orm/pg-core"

import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { requireAppOrigin } from "@/server/auth/origin"
import {
  customShellAnnouncements,
  customShellAutomationRuns,
  customShellAutomations,
  customShellChangelogEntries,
  customShellFeedback,
  customShellNotifications,
  customShellUsers,
  type CustomShellNotification,
  type CustomShellUser,
} from "@/server/schema"
import { findCurrentUser, now } from "@/server/auth/security"
import { type NotificationItem } from "@/lib/api/notification"
import {
  aiLimitNotificationText,
  createDefaultNotificationTypeVisibility,
  notificationTypeLabels,
  visibleNotificationTypes,
  type AutomationApprovalState,
  type NotificationType,
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
}

export type AdminNotificationQuery = {
  search: string
  read: "all" | "unread" | "read"
  type: "all" | NotificationType
  page: number
  pageSize: number
  sort: "activity" | "recipient" | "type" | "status" | "created"
  direction: "asc" | "desc"
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const CURSOR_SEPARATOR = "|"

// The same person's row can be the recipient of one notice and the actor on
// another, so the users table is joined twice under two names.
const actorUsers = alias(customShellUsers, "actor_users")
const recipientUsers = alias(customShellUsers, "recipient_users")

/**
 * The free text a row shows and searches on: the update's title for a changelog
 * notice, the broadcast's own title for an announcement, and the feedback it is
 * about for the rest. Mirrors `notificationSubject` on the page.
 */
const subjectExpression = sql<string>`case
  when ${customShellNotifications.type} in ('account_update', 'system_email_failed') then coalesce(${customShellNotifications.message}, '')
  when ${customShellNotifications.type} = 'ai_limit_warning' then ${aiLimitNotificationText.ai_limit_warning.message}
  when ${customShellNotifications.type} = 'ai_limit_reached' then ${aiLimitNotificationText.ai_limit_reached.message}
  when ${customShellNotifications.type} = 'automation_approval' then coalesce(${customShellAutomations.name}, '')
  when ${customShellNotifications.type} = 'automation_failed' then coalesce(${customShellAutomations.name}, '')
  else coalesce(${customShellChangelogEntries.title}, ${customShellAnnouncements.title}, ${customShellFeedback.message}, '')
end`

/** The words the Type badge shows, so sorting by Type matches what you read. */
const typeLabelExpression = sql<string>`case ${sql.join(
  Object.entries(notificationTypeLabels).map(
    ([type, label]) =>
      sql`when ${customShellNotifications.type} = ${type} then ${label}`
  ),
  sql` `
)} else ${customShellNotifications.type} end`

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
 * Every notice in the app, searched, filtered and sorted by the database.
 *
 * The admin page cannot do this in the browser: it only ever holds one page, so
 * filtering there would search the rows already fetched and quietly miss the
 * rest. The count that comes back is the real number of matches, not the size
 * of the page.
 */
export async function listAdminNotifications(
  query: AdminNotificationQuery,
  database: CustomShellDb = db
): Promise<{ notifications: NotificationItem[]; total: number }> {
  const filters: SQL[] = []
  const search = query.search.trim()

  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(actorUsers.name, pattern),
      ilike(recipientUsers.name, pattern),
      sql`${subjectExpression} ilike ${pattern}`
    )
    if (match) filters.push(match)
  }
  if (query.read !== "all") {
    filters.push(
      query.read === "unread"
        ? isNull(customShellNotifications.readAt)
        : isNotNull(customShellNotifications.readAt)
    )
  }
  if (query.type !== "all") {
    filters.push(eq(customShellNotifications.type, query.type))
  }

  const where = filters.length ? and(...filters) : undefined
  const direction = query.direction === "asc" ? asc : desc
  const sortExpression = {
    activity: subjectExpression,
    recipient: recipientUsers.name,
    type: typeLabelExpression,
    status: sql`case when ${customShellNotifications.readAt} is null then 0 else 1 end`,
    created: customShellNotifications.createdAt,
  }[query.sort]

  const rows = await joinNotificationSources(
    database
      .select({ notification: customShellNotifications })
      .from(customShellNotifications)
      .$dynamic()
  )
    .where(where)
    // Rows sharing a value would otherwise arrive in whatever order the
    // database felt like, which lets one row show up on two pages.
    .orderBy(direction(sortExpression), desc(customShellNotifications.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  const [totals] = await joinNotificationSources(
    database
      .select({ total: count() })
      .from(customShellNotifications)
      .$dynamic()
  ).where(where)

  return {
    notifications: await serializeNotificationRows(
      rows.map((row) => row.notification),
      database
    ),
    total: totals?.total ?? 0,
  }
}

/**
 * Every table a notice takes its words from. Search, sort and the count all go
 * through here so the number in the badge counts exactly the rows the table can
 * show.
 */
function joinNotificationSources<T extends PgSelect>(query: T) {
  return (
    query
      .innerJoin(
        recipientUsers,
        eq(recipientUsers.id, customShellNotifications.recipientUserId)
      )
      .leftJoin(
        actorUsers,
        eq(actorUsers.id, customShellNotifications.actorUserId)
      )
      .leftJoin(
        customShellFeedback,
        eq(customShellFeedback.id, customShellNotifications.feedbackId)
      )
      .leftJoin(
        customShellChangelogEntries,
        eq(
          customShellChangelogEntries.id,
          customShellNotifications.changelogEntryId
        )
      )
      .leftJoin(
        customShellAnnouncements,
        eq(customShellAnnouncements.id, customShellNotifications.announcementId)
      )
      // Two hops, because the notice points at the run and the words it needs
      // are the flow's name.
      .leftJoin(
        customShellAutomationRuns,
        eq(
          customShellAutomationRuns.id,
          customShellNotifications.automationRunId
        )
      )
      .leftJoin(
        customShellAutomations,
        eq(customShellAutomations.id, customShellAutomationRuns.automationId)
      )
  )
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

export async function deleteAdminNotificationRows(notificationIds: string[]) {
  requireAppOrigin()
  await requireAdminNotificationUser()

  const rows = await db
    .delete(customShellNotifications)
    .where(inArray(customShellNotifications.id, notificationIds))
    .returning({ id: customShellNotifications.id })

  return { count: rows.length }
}

export async function clearAdminNotificationRows() {
  requireAppOrigin()
  await requireAdminNotificationUser()

  const rows = await db
    .delete(customShellNotifications)
    .returning({ id: customShellNotifications.id })

  return { count: rows.length }
}

async function requireNotificationUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

export async function requireAdminNotificationUser() {
  const user = await requireNotificationUser()
  if (!canViewAllNotifications(user)) {
    throw new Error("Not authorized")
  }
  return user
}

export function canViewAllNotifications(user: Pick<CustomShellUser, "role">) {
  return user.role === "admin"
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

  return {
    notifications: await serializeNotificationRows(pageRows, database),
    next_cursor:
      rows.length > pageSize && lastRow
        ? `${lastRow.createdAt.toISOString()}${CURSOR_SEPARATOR}${lastRow.id}`
        : null,
    unread_count: await countUnreadNotifications(
      currentUser.id,
      database,
      notificationTypes
    ),
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
  const changelogIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.changelogEntryId ? [row.changelogEntryId] : []
      )
    )
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
    changelogRows,
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
    changelogIds.length
      ? database
          .select({
            id: customShellChangelogEntries.id,
            title: customShellChangelogEntries.title,
          })
          .from(customShellChangelogEntries)
          .where(inArray(customShellChangelogEntries.id, changelogIds))
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
  const changelogTitles = new Map(
    changelogRows.map((row) => [row.id, row.title])
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
    changelog_entry_id: row.changelogEntryId,
    changelog_title: row.changelogEntryId
      ? (changelogTitles.get(row.changelogEntryId) ?? "Deleted update")
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
