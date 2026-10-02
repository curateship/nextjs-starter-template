import { and, eq, ne } from "drizzle-orm"

import { PENDING_DELETION } from "@/lib/account-deletion"
import { appUrlFor } from "@/server/app-url"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { sendAuthEmail } from "@/server/email/send"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications, customShellUsers } from "@/server/schema"

export type AdminAccountAction = {
  summary: string
  effect: string
}

type AdminActionDelivery = AdminAccountAction & {
  email: string
  name: string | null
  changedAt: Date
}

const UTC_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short",
})

/**
 * Writes the member's notice beside the account change.
 *
 * Accounts on their way out are deliberately excluded. They cannot open an
 * in-app notice, and the separate account-closed email is the last message
 * intended for them unless an admin restores them.
 */
export async function recordAdminAccountAction(
  userId: string,
  action: AdminAccountAction,
  database: CustomShellDb,
  changedAt = now()
): Promise<AdminActionDelivery | null> {
  const [recipient] = await database
    .select({
      id: customShellUsers.id,
      email: customShellUsers.email,
      name: customShellUsers.name,
    })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.id, userId),
        ne(customShellUsers.status, PENDING_DELETION)
      )
    )
    .limit(1)

  if (!recipient) return null

  await database.insert(customShellNotifications).values({
    id: uuid(),
    recipientUserId: recipient.id,
    actorUserId: null,
    type: "account_update",
    message: action.summary,
    detail: action.effect,
    createdAt: changedAt,
  })
  await publishNotificationCreated(recipient.id, database)

  return { ...action, email: recipient.email, name: recipient.name, changedAt }
}

/** Email is best effort: its send record keeps failures visible to an admin. */
export async function sendAdminAccountAction(
  delivery: AdminActionDelivery | null
) {
  if (!delivery) return

  try {
    await sendAuthEmail({
      kind: "account-updated",
      to: delivery.email,
      recipientName: delivery.name,
      actionUrl: appUrlFor("/"),
      tokens: {
        change_summary: delivery.summary,
        practical_effect: delivery.effect,
        changed_when: `${UTC_DATE_TIME.format(delivery.changedAt)} UTC`,
      },
    })
  } catch {
    // The account change and its in-app notice are already committed. The
    // failed attempt is recorded by sendAuthEmail for the admin to follow up.
  }
}
