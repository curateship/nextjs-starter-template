import { and, desc, eq, isNull, lte, sql } from "drizzle-orm"

import {
  crmFollowUpNotificationText,
  crmUnansweredNotificationText,
} from "@/lib/notification-types"
import { now, uuid } from "@/server/auth/security"
import { fillMessageBody, pendingBodyMessages } from "@/server/crm/inbound"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import {
  customShellCrmLeads,
  customShellCrmThreads,
  customShellEmailSettings,
  customShellNotifications,
  customShellWorkspaces,
} from "@/server/schema"

/** How many leads one pass will chase, so a long-ignored list cannot stall it. */
export const FOLLOW_UP_BATCH = 50

/**
 * Puts a notice in the bell for every lead whose chase date has passed.
 *
 * It goes to the person the site belongs to, which is who set the date. The
 * stamp is written in the same statement that finds the row, so two overlapping
 * passes cannot both send it: the second finds nothing left with a null stamp.
 *
 * Returns how many notices were written.
 */
export async function notifyDueFollowUps(
  database: CustomShellDb = db
): Promise<number> {
  const timestamp = now()

  // Claimed first, by stamping. A notice written before the stamp would be
  // sent twice if the pass died between the two.
  const claimed = await database
    .update(customShellCrmLeads)
    .set({ followUpNotifiedAt: timestamp })
    .where(
      and(
        isNull(customShellCrmLeads.followUpNotifiedAt),
        lte(customShellCrmLeads.followUpAt, timestamp),
        // Nothing to chase about a lead that is already won or lost.
        sql`${customShellCrmLeads.stage} not in ('won', 'lost')`,
        // The batch limit. **It has to repeat every condition above it**, or
        // the fifty rows it picks are filtered down afterwards and the ones it
        // threw away are picked again on the very next pass. A lead moved to
        // Won while an old chase date was still on it matches forever and is
        // never stamped, so fifty of those would fill every batch and nobody
        // real would ever be chased again.
        sql`${customShellCrmLeads.id} in (
          select ${customShellCrmLeads.id} from ${customShellCrmLeads}
          where ${customShellCrmLeads.followUpNotifiedAt} is null
            and ${customShellCrmLeads.followUpAt} <= ${timestamp}
            and ${customShellCrmLeads.stage} not in ('won', 'lost')
          order by ${customShellCrmLeads.followUpAt}
          limit ${FOLLOW_UP_BATCH}
        )`
      )
    )
    .returning({
      id: customShellCrmLeads.id,
      workspaceId: customShellCrmLeads.workspaceId,
      email: customShellCrmLeads.email,
      name: customShellCrmLeads.name,
      followUpNote: customShellCrmLeads.followUpNote,
    })

  if (claimed.length === 0) return 0

  const recipients = new Set<string>()
  let written = 0

  for (const lead of claimed) {
    const [workspace] = await database
      .select({ userId: customShellWorkspaces.userId })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, lead.workspaceId))
      .limit(1)
    if (!workspace?.userId) continue

    // The newest conversation with them, so clicking the notice opens
    // something. A lead added by hand may have none, and the notice still
    // stands with nowhere to go.
    const [thread] = await database
      .select({ id: customShellCrmThreads.id })
      .from(customShellCrmThreads)
      .where(eq(customShellCrmThreads.leadId, lead.id))
      .orderBy(desc(customShellCrmThreads.lastMessageAt))
      .limit(1)

    const words = crmFollowUpNotificationText(
      lead.name?.trim() || lead.email,
      lead.followUpNote
    )

    await database.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: workspace.userId,
      type: "crm_follow_up",
      message: words.message,
      detail: words.detail,
      crmThreadId: thread?.id ?? null,
      createdAt: timestamp,
    })
    recipients.add(workspace.userId)
    written += 1
  }

  // Their other open tabs. Each person once, however many leads were due.
  for (const userId of recipients) {
    await publishNotificationCreated(userId, database)
  }

  return written
}

/**
 * Puts a notice in the bell for every conversation where they wrote last and
 * nobody has answered for the site's number of days (CRM task 11, built in
 * task 36 on 7 Nov 2026). Three days unless the site changed it; 0 is off.
 *
 * Once per conversation: the stamp is written in the same statement that
 * finds the row, as the chase-date job does, and a new message from them
 * clears it. Snoozed and closed conversations are skipped, since snoozed
 * already means "not now", and so are leads already Won or Lost.
 *
 * Returns how many notices were written.
 */
export async function notifyUnansweredThreads(
  database: CustomShellDb = db
): Promise<number> {
  const timestamp = now()
  const days = sql`coalesce((select ${customShellEmailSettings.crmUnansweredDays} from ${customShellEmailSettings} where ${customShellEmailSettings.workspaceId} = ${customShellCrmThreads.workspaceId}), 3)`

  // The batch limit repeats every condition, for the reason the chase-date
  // job gives: rows it picks and then filters out would fill every batch.
  const claimed = await database
    .update(customShellCrmThreads)
    .set({ unansweredNotifiedAt: timestamp })
    .where(
      sql`${customShellCrmThreads.id} in (
        select ${customShellCrmThreads.id} from ${customShellCrmThreads}
        join ${customShellCrmLeads} on ${customShellCrmLeads.id} = ${customShellCrmThreads.leadId}
        where ${customShellCrmThreads.unansweredNotifiedAt} is null
          and ${customShellCrmThreads.status} = 'open'
          and ${customShellCrmThreads.lastDirection} = 'in'
          and ${customShellCrmLeads.stage} not in ('won', 'lost')
          and ${days} > 0
          and ${customShellCrmThreads.lastMessageAt} <= ${timestamp}::timestamptz - (${days} * interval '1 day')
        order by ${customShellCrmThreads.lastMessageAt}
        limit ${FOLLOW_UP_BATCH}
      )`
    )
    .returning({
      id: customShellCrmThreads.id,
      workspaceId: customShellCrmThreads.workspaceId,
      leadId: customShellCrmThreads.leadId,
      subject: customShellCrmThreads.subject,
      lastMessageAt: customShellCrmThreads.lastMessageAt,
    })

  if (claimed.length === 0) return 0

  const recipients = new Set<string>()
  let written = 0
  for (const thread of claimed) {
    const [row] = await database
      .select({
        userId: customShellWorkspaces.userId,
        email: customShellCrmLeads.email,
        name: customShellCrmLeads.name,
      })
      .from(customShellWorkspaces)
      .innerJoin(customShellCrmLeads, eq(customShellCrmLeads.id, thread.leadId))
      .where(eq(customShellWorkspaces.id, thread.workspaceId))
      .limit(1)
    if (!row?.userId) continue

    const waited = Math.max(
      1,
      Math.floor((timestamp.getTime() - thread.lastMessageAt.getTime()) / 86_400_000)
    )
    const words = crmUnansweredNotificationText(
      row.name?.trim() || row.email,
      waited,
      thread.subject
    )
    await database.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: row.userId,
      type: "crm_follow_up",
      message: words.message,
      detail: words.detail,
      crmThreadId: thread.id,
      createdAt: timestamp,
    })
    recipients.add(row.userId)
    written += 1
  }

  for (const userId of recipients) {
    await publishNotificationCreated(userId, database)
  }
  return written
}

/**
 * Fetches the bodies of the messages whose second request never landed.
 *
 * One of the three jobs the CRM puts on the background pass. Each is
 * registered separately in `runBackgroundPass` rather than wrapped together
 * here: that pass already isolates and counts a failing job, and a wrapper of
 * our own that swallowed its own failures would keep them out of the count the
 * worker reports.
 */
export async function fillPendingBodies(
  database: CustomShellDb = db
): Promise<number> {
  const pending = await pendingBodyMessages(25, database)
  let filled = 0
  for (const message of pending) {
    if (await fillMessageBody(message.workspaceId, message.id, database)) {
      filled += 1
    }
  }
  return filled
}
