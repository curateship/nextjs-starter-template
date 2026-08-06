import { createHmac } from "node:crypto"

import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { encryptSecret } from "@/server/auth/encryption"
import { handleResendWebhook } from "@/server/email/resend-webhook"
import {
  customShellContacts,
  customShellDeliveries,
  customShellEmailSettings,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const SECRET = `whsec_${Buffer.from("resend-signing-secret").toString("base64")}`

function headersFor(body: string, secret = SECRET, timestamp = Date.now()) {
  const id = "msg_test_1"
  const ts = String(Math.floor(timestamp / 1000))
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const signature = createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64")
  return { id, timestamp: ts, signature: `v1,${signature}` }
}

describe("resend webhook", () => {
  let db: CustomShellDb
  let workspaceId: string
  let contactId: string

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-encryption-key"
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const user = await insertUser(db, { email: "owner@example.com" })

    workspaceId = "ws-1"
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: user.id,
      name: "Test",
      settings: {},
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellEmailSettings).values({
      workspaceId,
      resendWebhookSecretEncrypted: encryptSecret(SECRET),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    contactId = "contact-1"
    await db.insert(customShellContacts).values({
      id: contactId,
      workspaceId,
      email: "Reader@Example.com",
      status: "subscribed",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellDeliveries).values({
      id: "delivery-1",
      workspaceId,
      contactId,
      toEmail: "reader@example.com",
      subject: "Hello",
      providerMessageId: "re_message_1",
      status: "sent",
      createdAt: new Date(),
    })
  })

  const contactStatus = async () => {
    const [row] = await db
      .select({ status: customShellContacts.status })
      .from(customShellContacts)
      .where(eq(customShellContacts.id, contactId))
    return row.status
  }

  it("marks the contact bounced when a signed bounce names the message id", async () => {
    const body = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "re_message_1", to: ["reader@example.com"] },
    })
    const result = await handleResendWebhook(body, headersFor(body), db)
    expect(result).toEqual({ outcome: "applied", changed: 1 })
    expect(await contactStatus()).toBe("bounced")
  })

  it("finds the contact by address alone, however the address is cased", async () => {
    const body = JSON.stringify({
      type: "email.complained",
      data: { to: ["READER@example.com"] },
    })
    const result = await handleResendWebhook(body, headersFor(body), db)
    expect(result).toEqual({ outcome: "applied", changed: 1 })
    expect(await contactStatus()).toBe("complained")
  })

  it("refuses a signature made with another secret", async () => {
    const body = JSON.stringify({ type: "email.bounced", data: {} })
    const wrong = `whsec_${Buffer.from("some-other-secret").toString("base64")}`
    const result = await handleResendWebhook(
      body,
      headersFor(body, wrong),
      db
    )
    expect(result).toEqual({ outcome: "bad_signature" })
    expect(await contactStatus()).toBe("subscribed")
  })

  it("refuses a stale timestamp, so captured calls cannot be replayed later", async () => {
    const body = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "re_message_1" },
    })
    const result = await handleResendWebhook(
      body,
      headersFor(body, SECRET, Date.now() - 10 * 60 * 1000),
      db
    )
    expect(result).toEqual({ outcome: "bad_signature" })
  })

  it("leaves an opted-out contact alone — their own choice outranks a bounce", async () => {
    await db
      .update(customShellContacts)
      .set({ status: "unsubscribed" })
      .where(eq(customShellContacts.id, contactId))
    const body = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "re_message_1" },
    })
    const result = await handleResendWebhook(body, headersFor(body), db)
    expect(result).toEqual({ outcome: "applied", changed: 0 })
    expect(await contactStatus()).toBe("unsubscribed")
  })

  it("accepts but ignores event kinds it does not act on", async () => {
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "re_message_1" },
    })
    const result = await handleResendWebhook(body, headersFor(body), db)
    expect(result).toEqual({ outcome: "applied", changed: 0 })
    expect(await contactStatus()).toBe("subscribed")
  })

  it("says so when no workspace has a webhook secret at all", async () => {
    await db
      .update(customShellEmailSettings)
      .set({ resendWebhookSecretEncrypted: null })
      .where(eq(customShellEmailSettings.workspaceId, workspaceId))
    const body = JSON.stringify({ type: "email.bounced", data: {} })
    const result = await handleResendWebhook(body, headersFor(body), db)
    expect(result).toEqual({ outcome: "not_configured" })
  })
})
