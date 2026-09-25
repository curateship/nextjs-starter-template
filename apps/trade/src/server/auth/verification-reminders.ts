import { and, asc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm"

import { VERIFICATION_REMINDER_DAYS } from "@/lib/email/verification-reminder"
import { appUrlFor } from "@/server/app-url"
import { now } from "@/server/auth/security"
import {
  createWorkspaceAuthToken,
  getAuthLinkContext,
} from "@/server/auth/link-expiry"
import { db, type CustomShellDb } from "@/server/db"
import { sendAuthEmail } from "@/server/email/send"
import { customShellUsers } from "@/server/schema"

const DAY_MS = 24 * 60 * 60 * 1000
// Provider calls happen inside the first admin read of the day. Keep the batch
// small so a backlog cannot turn that page load into a long wait; later daily
// runs take the next ten.
const REMINDER_BATCH_LIMIT = 10

/**
 * Claims and sends the one verification reminder due for old password
 * sign-ups. The claim and fresh token are committed together before email is
 * attempted, so parallel app processes cannot both send to the same account.
 */
export async function sendDueVerificationReminders(
  database: CustomShellDb = db,
  at: Date = now()
) {
  const cutoff = new Date(at.getTime() - VERIFICATION_REMINDER_DAYS * DAY_MS)
  const linkContext = await getAuthLinkContext(database)

  const reminders = await database.transaction(async (tx) => {
    const due = tx
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(
        and(
          eq(customShellUsers.status, "active"),
          isNotNull(customShellUsers.passwordHash),
          isNull(customShellUsers.emailVerifiedAt),
          isNull(customShellUsers.verificationReminderSentAt),
          lte(customShellUsers.createdAt, cutoff)
        )
      )
      .orderBy(asc(customShellUsers.createdAt))
      .limit(REMINDER_BATCH_LIMIT)

    const claimed = await tx
      .update(customShellUsers)
      .set({ verificationReminderSentAt: at })
      .where(
        and(
          inArray(customShellUsers.id, due),
          eq(customShellUsers.status, "active"),
          isNotNull(customShellUsers.passwordHash),
          isNull(customShellUsers.emailVerifiedAt),
          isNull(customShellUsers.verificationReminderSentAt)
        )
      )
      .returning({
        id: customShellUsers.id,
        email: customShellUsers.email,
        name: customShellUsers.name,
      })

    const reminders = []
    for (const user of claimed) {
      reminders.push({
        ...user,
        token: await createWorkspaceAuthToken(user.id, "verify_email", tx, {
          context: linkContext,
        }),
      })
    }
    return reminders
  })

  for (const reminder of reminders) {
    try {
      await sendAuthEmail({
        kind: "verification-reminder",
        to: reminder.email,
        recipientName: reminder.name,
        workspaceId: linkContext.workspaceId ?? undefined,
        linkExpiry: linkContext.expiry,
        actionUrl: appUrlFor(
          `/verify-email?token=${encodeURIComponent(reminder.token)}`
        ),
      })
    } catch (error) {
      // The claim remains the at-most-once record. sendAuthEmail has already
      // recorded the failed attempt for an admin to inspect.
      console.error("Verification reminder was not sent", reminder.id, error)
    }
  }

  return reminders.length
}
