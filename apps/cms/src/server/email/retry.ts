import { and, eq, inArray, isNull, lte, or } from "drizzle-orm"
import { z } from "zod"

import {
  authLinkExpirySchema,
  authTokenTtlMs,
  type AuthTokenPurpose,
} from "@/lib/email/auth-token-expiry"
import {
  SYSTEM_EMAIL_KINDS,
  type SystemEmailKind,
} from "@/lib/system-emails/kinds"
import { emailDeliveryFailureFrom } from "@/lib/email/delivery-failure"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreatedMany } from "@/server/notifications/events"
import {
  customShellNotifications,
  customShellPendingEmailSends,
  customShellUsers,
} from "@/server/schema"
import type { AuthEmail } from "@/server/email/send"

const MAX_ATTEMPTS = 5
const DRAIN_BATCH_LIMIT = 25
const CLAIM_STALE_MS = 10 * 60 * 1000
const IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000
const RETRY_DELAYS_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
]

const TOKEN_PURPOSE_BY_KIND: Partial<
  Record<SystemEmailKind, AuthTokenPurpose>
> = {
  "verify-email": "verify_email",
  "verification-reminder": "verify_email",
  "sign-in-link": "login",
  "password-reset": "reset_password",
}

const pendingEmailSchema = z.object({
  kind: z.enum(SYSTEM_EMAIL_KINDS),
  to: z.string().email(),
  recipientName: z.string().nullable(),
  actionUrl: z.string().url(),
  reportUrl: z.string().url().optional(),
  workspaceId: z.string().optional(),
  linkExpiry: authLinkExpirySchema.optional(),
  showFailureReasonToAdmin: z.boolean().optional(),
  tokens: z.record(z.string(), z.string()).optional(),
})

export type RetryDelivery = (
  email: AuthEmail,
  options: {
    database: CustomShellDb
    idempotencyKey: string
    retryOnFailure: false
  }
) => Promise<{ delivered: boolean; messageId?: string | null }>

function nextAttempt(at: Date, attempts: number) {
  const delay =
    RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]
  return new Date(at.getTime() + delay)
}

/** Saves a retryable failure without leaving its account link readable at rest. */
export async function enqueuePendingEmailSend(
  email: AuthEmail,
  options: {
    idempotencyKey: string
    workspaceId: string | null
    reason: string
    database?: CustomShellDb
    at?: Date
  }
) {
  const database = options.database ?? db
  const at = options.at ?? now()
  await database
    .insert(customShellPendingEmailSends)
    .values({
      id: options.idempotencyKey,
      workspaceId: options.workspaceId,
      kind: email.kind,
      toEmail: email.to.slice(0, 255),
      encryptedPayload: encryptSecret(JSON.stringify(email)),
      status: "pending",
      attempts: 1,
      nextAttemptAt: nextAttempt(at, 1),
      lastError: options.reason.slice(0, 500),
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
}

async function claimDueSends(database: CustomShellDb, at: Date) {
  const claimToken = uuid()
  const staleBefore = new Date(at.getTime() - CLAIM_STALE_MS)

  return database.transaction(async (tx) => {
    const rows = await tx
      .select({ id: customShellPendingEmailSends.id })
      .from(customShellPendingEmailSends)
      .where(
        and(
          eq(customShellPendingEmailSends.status, "pending"),
          lte(customShellPendingEmailSends.nextAttemptAt, at),
          or(
            isNull(customShellPendingEmailSends.claimedAt),
            lte(customShellPendingEmailSends.claimedAt, staleBefore)
          )
        )
      )
      .orderBy(customShellPendingEmailSends.nextAttemptAt)
      .limit(DRAIN_BATCH_LIMIT)
      .for("update", { skipLocked: true })

    if (!rows.length) return []

    return tx
      .update(customShellPendingEmailSends)
      .set({ claimToken, claimedAt: at, updatedAt: at })
      .where(
        and(
          inArray(
            customShellPendingEmailSends.id,
            rows.map((row) => row.id)
          ),
          eq(customShellPendingEmailSends.status, "pending")
        )
      )
      .returning()
  })
}

function decodePendingEmail(encryptedPayload: string): AuthEmail {
  return pendingEmailSchema.parse(JSON.parse(decryptSecret(encryptedPayload)))
}

function linkExpiresAt(email: AuthEmail, createdAt: Date) {
  const purpose = TOKEN_PURPOSE_BY_KIND[email.kind]
  if (!purpose) return null
  return new Date(createdAt.getTime() + authTokenTtlMs(purpose, email.linkExpiry))
}

async function markDelivered(
  database: CustomShellDb,
  id: string,
  claimToken: string
) {
  await database
    .delete(customShellPendingEmailSends)
    .where(
      and(
        eq(customShellPendingEmailSends.id, id),
        eq(customShellPendingEmailSends.claimToken, claimToken),
        eq(customShellPendingEmailSends.status, "pending")
      )
    )
}

async function reschedule(
  database: CustomShellDb,
  row: typeof customShellPendingEmailSends.$inferSelect,
  claimToken: string,
  at: Date,
  reason: string
) {
  const attempts = row.attempts + 1
  await database
    .update(customShellPendingEmailSends)
    .set({
      attempts,
      nextAttemptAt: nextAttempt(at, attempts),
      lastError: reason.slice(0, 500),
      claimToken: null,
      claimedAt: null,
      updatedAt: at,
    })
    .where(
      and(
        eq(customShellPendingEmailSends.id, row.id),
        eq(customShellPendingEmailSends.claimToken, claimToken),
        eq(customShellPendingEmailSends.status, "pending")
      )
    )
}

async function exhaust(
  database: CustomShellDb,
  row: typeof customShellPendingEmailSends.$inferSelect,
  claimToken: string,
  at: Date,
  reason: string
) {
  const recipients = await database.transaction(async (tx) => {
    const [stopped] = await tx
      .update(customShellPendingEmailSends)
      .set({
        status: "exhausted",
        attempts: row.attempts,
        lastError: reason.slice(0, 500),
        claimToken: null,
        claimedAt: null,
        updatedAt: at,
      })
      .where(
        and(
          eq(customShellPendingEmailSends.id, row.id),
          eq(customShellPendingEmailSends.claimToken, claimToken),
          eq(customShellPendingEmailSends.status, "pending")
        )
      )
      .returning({ id: customShellPendingEmailSends.id })
    if (!stopped) return []

    const admins = await tx
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(
        and(
          eq(customShellUsers.role, "admin"),
          eq(customShellUsers.status, "active")
        )
      )
    if (!admins.length) return []

    await tx.insert(customShellNotifications).values(
      admins.map((admin) => ({
        id: uuid(),
        recipientUserId: admin.id,
        actorUserId: null,
        type: "system_email_failed",
        message: "An account email could not be delivered",
        detail: `${row.kind} to ${row.toEmail} stopped after ${row.attempts} attempts. ${reason}`,
        createdAt: at,
      }))
    )
    return admins.map((admin) => admin.id)
  })

  await publishNotificationCreatedMany(recipients, database)
}

/**
 * Tries a capped batch from the first admin request of the day.
 *
 * Resend remembers an idempotency key for 24 hours. No row is retried after 23
 * hours: a process can die after Resend accepts a request but before the row is
 * deleted, and losing one message is preferable to sending the same link twice.
 */
export async function drainPendingEmailSends(
  database: CustomShellDb,
  at: Date,
  deliver: RetryDelivery
) {
  const rows = await claimDueSends(database, at)

  for (const row of rows) {
    const claimToken = row.claimToken
    if (!claimToken) continue

    if (
      at.getTime() - row.createdAt.getTime() >= IDEMPOTENCY_SAFETY_WINDOW_MS
    ) {
      await exhaust(
        database,
        row,
        claimToken,
        at,
        "The retry stayed pending until Resend's duplicate-protection window was nearly over."
      )
      continue
    }

    let email: AuthEmail
    try {
      email = decodePendingEmail(row.encryptedPayload)
    } catch {
      await exhaust(
        database,
        row,
        claimToken,
        at,
        "The saved email could not be read safely."
      )
      continue
    }

    const expiresAt = linkExpiresAt(email, row.createdAt)
    if (expiresAt && at >= expiresAt) {
      await exhaust(
        database,
        row,
        claimToken,
        at,
        "The saved account link expired before another safe delivery attempt."
      )
      continue
    }

    try {
      const result = await deliver(email, {
        database,
        idempotencyKey: row.id,
        retryOnFailure: false,
      })
      if (!result.delivered) {
        await exhaust(
          database,
          { ...row, attempts: row.attempts + 1 },
          claimToken,
          at,
          "The email sender did not report a delivery."
        )
        continue
      }
      await markDelivered(database, row.id, claimToken)
    } catch (error) {
      const failure = emailDeliveryFailureFrom(error)
      const attempts = row.attempts + 1
      const reason =
        failure?.reason ??
        "The email sender stopped without a retryable result."

      if (
        !failure ||
        failure.kind === "needs_attention" ||
        attempts >= MAX_ATTEMPTS
      ) {
        await exhaust(database, { ...row, attempts }, claimToken, at, reason)
      } else {
        await reschedule(
          database,
          row,
          claimToken,
          at,
          reason
        )
      }
    }
  }

  return rows.length
}

/** The shared background pass's entry point; the dynamic import avoids a cycle. */
export async function processPendingEmailRetries(
  database: CustomShellDb = db,
  at: Date = now()
) {
  const { sendAuthEmail } = await import("@/server/email/send")
  return drainPendingEmailSends(database, at, sendAuthEmail)
}
