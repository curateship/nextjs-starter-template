import { and, eq, gte } from "drizzle-orm"

import { crmMailArrivedNotificationText } from "@/lib/notification-types"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications, customShellWorkspaces } from "@/server/schema"

/** A back-and-forth inside this long rings the bell once, not once per message. */
export const MAIL_NOTICE_QUIET_MS = 60 * 60 * 1000

/**
 * A notice in the bell that mail landed (CRM task 10, built in task 36 on
 * 7 Nov 2026): who wrote in and the subject, to the person the site belongs
 * to, the same person the chase notices go to. Nobody owns a lead yet, so
 * the owner is the only honest one to tell.
 *
 * At most one per conversation an hour. The caller never sends one for a
 * blocked sender, since keeping them quiet is what blocking is for.
 *
 * Answers whether a notice was written.
 */
export async function notifyMailArrived(
  workspaceId: string,
  threadId: string,
  who: string,
  subject: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [workspace] = await database
    .select({ userId: customShellWorkspaces.userId })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, workspaceId))
    .limit(1)
  if (!workspace?.userId) return false

  const at = now()
  const [recent] = await database
    .select({ id: customShellNotifications.id })
    .from(customShellNotifications)
    .where(
      and(
        eq(customShellNotifications.type, "crm_mail_arrived"),
        eq(customShellNotifications.crmThreadId, threadId),
        gte(customShellNotifications.createdAt, new Date(at.getTime() - MAIL_NOTICE_QUIET_MS))
      )
    )
    .limit(1)
  // The bell stays quiet inside the hour, but the open CRM still hears that
  // mail came: the nudge is what its live inbox listens for (CRM task 33).
  if (recent) {
    await publishNotificationCreated(workspace.userId, database)
    return false
  }

  const words = crmMailArrivedNotificationText(who, subject)
  await database.insert(customShellNotifications).values({
    id: uuid(),
    recipientUserId: workspace.userId,
    type: "crm_mail_arrived",
    message: words.message,
    detail: words.detail,
    crmThreadId: threadId,
    createdAt: at,
  })
  await publishNotificationCreated(workspace.userId, database)
  return true
}
