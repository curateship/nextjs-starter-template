import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { emailDeliveryError } from "@/lib/email/delivery-failure"
import { type CustomShellDb } from "@/server/db"
import { type AuthEmail } from "@/server/email/send"
import {
  drainPendingEmailSends,
  enqueuePendingEmailSend,
  type RetryDelivery,
} from "@/server/email/retry"
import {
  customShellNotifications,
  customShellPendingEmailSends,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { uuid } from "@/server/auth/security"

let client: PGlite
let database: CustomShellDb
const NOW = new Date("2026-08-17T12:00:00Z")
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const email = {
  kind: "password-reset" as const,
  to: "ada@example.test",
  recipientName: "Ada Lovelace",
  actionUrl: "https://app.example/reset-password?token=secret-link-token",
}

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "retry-test-key"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  vi.restoreAllMocks()
  await client.close()
})

function temporaryFailure(reason = "Resend is busy.") {
  return emailDeliveryError({ kind: "retryable", reason }, true)
}

async function enqueue(pendingEmail: AuthEmail = email) {
  const id = uuid()
  await enqueuePendingEmailSend(pendingEmail, {
    database,
    idempotencyKey: id,
    workspaceId: null,
    reason: "Temporary outage.",
    at: NOW,
  })
  return id
}

describe("pending account email retries", () => {
  it("keeps the link encrypted and removes a row after one later delivery", async () => {
    const id = await enqueue()
    const [saved] = await database.select().from(customShellPendingEmailSends)
    expect(saved.encryptedPayload).not.toContain("secret-link-token")

    const deliver = vi.fn<RetryDelivery>().mockResolvedValue({
      delivered: true,
      messageId: "email-123",
    })
    const due = new Date(NOW.getTime() + 5 * MINUTE)

    await expect(drainPendingEmailSends(database, due, deliver)).resolves.toBe(
      1
    )
    await expect(drainPendingEmailSends(database, due, deliver)).resolves.toBe(
      0
    )

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith(
      email,
      expect.objectContaining({ idempotencyKey: id, retryOnFailure: false })
    )
    expect(await database.select().from(customShellPendingEmailSends)).toEqual(
      []
    )
  })

  it("does not let a second drain take an email already being delivered", async () => {
    await enqueue()
    let finish: (() => void) | undefined
    const deliver = vi.fn<RetryDelivery>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ delivered: true, messageId: "email-123" })
        })
    )
    const due = new Date(NOW.getTime() + 5 * MINUTE)

    const first = drainPendingEmailSends(database, due, deliver)
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1))
    await expect(drainPendingEmailSends(database, due, deliver)).resolves.toBe(
      0
    )
    finish?.()
    await first

    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it("backs off, stops at five total attempts, and tells every active admin", async () => {
    await insertUser(database, { role: "admin", name: "First Admin" })
    await insertUser(database, { role: "admin", name: "Second Admin" })
    await insertUser(database, {
      role: "admin",
      status: "suspended",
      name: "Suspended Admin",
    })
    const id = await enqueue()
    const deliver = vi.fn<RetryDelivery>().mockRejectedValue(temporaryFailure())

    for (const offset of [1 * MINUTE, 6 * MINUTE, 21 * MINUTE, 51 * MINUTE]) {
      await drainPendingEmailSends(
        database,
        new Date(NOW.getTime() + offset),
        deliver
      )
    }

    const [stopped] = await database
      .select()
      .from(customShellPendingEmailSends)
      .where(eq(customShellPendingEmailSends.id, id))
    expect(stopped).toMatchObject({ status: "exhausted", attempts: 5 })
    expect(deliver).toHaveBeenCalledTimes(4)

    const notices = await database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.type, "system_email_failed"))
    expect(notices).toHaveLength(2)
    expect(notices[0]).toMatchObject({
      message: "An account email could not be delivered",
    })
    expect(notices[0].detail).not.toContain("secret-link-token")
  })

  it("stops any old retry before Resend forgets its idempotency key", async () => {
    const id = await enqueue()
    const deliver = vi.fn<RetryDelivery>()

    await drainPendingEmailSends(
      database,
      new Date(NOW.getTime() + 23 * HOUR),
      deliver
    )

    expect(deliver).not.toHaveBeenCalled()
    const [stopped] = await database
      .select()
      .from(customShellPendingEmailSends)
      .where(eq(customShellPendingEmailSends.id, id))
    expect(stopped.status).toBe("exhausted")
  })

  it("does not send a short-lived account link after it expires", async () => {
    const signInEmail = { ...email, kind: "sign-in-link" as const }
    const id = await enqueue(signInEmail)
    const deliver = vi.fn<RetryDelivery>().mockRejectedValue(temporaryFailure())

    await drainPendingEmailSends(
      database,
      new Date(NOW.getTime() + 1 * MINUTE),
      deliver
    )
    await drainPendingEmailSends(
      database,
      new Date(NOW.getTime() + 6 * MINUTE),
      deliver
    )
    await drainPendingEmailSends(
      database,
      new Date(NOW.getTime() + 21 * MINUTE),
      deliver
    )

    expect(deliver).toHaveBeenCalledTimes(2)
    const [stopped] = await database
      .select()
      .from(customShellPendingEmailSends)
      .where(eq(customShellPendingEmailSends.id, id))
    expect(stopped).toMatchObject({ status: "exhausted", attempts: 3 })
    expect(stopped.lastError).toContain("link expired")
  })

  it("does not delete a retry when the sender reports no delivery", async () => {
    const id = await enqueue()
    const deliver = vi.fn<RetryDelivery>().mockResolvedValue({
      delivered: false,
    })

    await drainPendingEmailSends(
      database,
      new Date(NOW.getTime() + 1 * MINUTE),
      deliver
    )

    const [stopped] = await database
      .select()
      .from(customShellPendingEmailSends)
      .where(eq(customShellPendingEmailSends.id, id))
    expect(stopped).toMatchObject({ status: "exhausted", attempts: 2 })
  })
})
