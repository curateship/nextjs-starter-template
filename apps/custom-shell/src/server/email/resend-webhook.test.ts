import { createHmac } from "node:crypto"

import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { encryptSecret } from "@/server/auth/encryption"
import { handleResendWebhook } from "@/server/email/resend-webhook"
import { listAutomationRunDeliveries } from "@/server/automations/runs"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomations,
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
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
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

    const timestamp = new Date()
    await db.insert(customShellAutomations).values({
      id: "automation-1",
      workspaceId,
      userId: user.id,
      name: "Tracked email",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: { v: 1, kind: "automation", nodes: {}, edges: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(customShellAutomationRuns).values({
      id: "run-1",
      automationId: "automation-1",
      userId: user.id,
      workspaceId,
      status: "completed",
      currentNodeId: "email-1",
      configSnapshot: { v: 1, kind: "automation", nodes: {}, edges: [] },
      wakeAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(customShellAutomationDeliveries).values({
      id: "automation-delivery-1",
      runId: "run-1",
      nodeId: "email-1",
      contactId,
      toEmail: "reader@example.com",
      subject: "Tracked hello",
      providerMessageId: "re_automation_1",
      status: "sent",
      createdAt: timestamp,
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

  it("records delivery, first open and first click once", async () => {
    const events = [
      ["email.delivered", "2026-08-13T12:00:00.000Z"],
      ["email.opened", "2026-08-13T12:01:00.000Z"],
      ["email.clicked", "2026-08-13T12:02:00.000Z"],
    ] as const

    for (const [type, created_at] of events) {
      const body = JSON.stringify({
        type,
        created_at,
        data: { email_id: "re_automation_1" },
      })
      await expect(
        handleResendWebhook(body, headersFor(body), db)
      ).resolves.toEqual({ outcome: "applied", changed: 1 })
    }

    const replay = JSON.stringify({
      type: "email.clicked",
      created_at: "2026-08-13T12:02:00.000Z",
      data: { email_id: "re_automation_1" },
    })
    await expect(
      handleResendWebhook(replay, headersFor(replay), db)
    ).resolves.toEqual({ outcome: "applied", changed: 0 })

    const [delivery] = await db
      .select()
      .from(customShellAutomationDeliveries)
      .where(eq(customShellAutomationDeliveries.id, "automation-delivery-1"))
    expect(delivery).toMatchObject({
      deliveredAt: new Date("2026-08-13T12:00:00.000Z"),
      openedAt: new Date("2026-08-13T12:01:00.000Z"),
      clickedAt: new Date("2026-08-13T12:02:00.000Z"),
    })

    await db.insert(customShellAutomationDeliveries).values({
      id: "automation-delivery-failed",
      runId: "run-1",
      nodeId: "email-1",
      toEmail: "failed@example.com",
      subject: "Tracked hello",
      status: "failed",
      error: "Address rejected",
      createdAt: new Date("2026-08-13T11:59:00.000Z"),
    })
    const page = await listAutomationRunDeliveries(
      workspaceId,
      "run-1",
      "email-1",
      0,
      db
    )
    expect(page).toMatchObject({
      total: 2,
      sent: 1,
      failed: 1,
      delivered: 1,
      opened: 1,
      clicked: 1,
    })
    expect(page?.deliveries).toEqual([
      expect.objectContaining({
        toEmail: "failed@example.com",
        state: "failed",
      }),
      expect.objectContaining({
        toEmail: "reader@example.com",
        state: "clicked",
        occurredAt: new Date("2026-08-13T12:02:00.000Z"),
      }),
    ])
    await expect(
      listAutomationRunDeliveries("another-workspace", "run-1", "email-1", 0, db)
    ).resolves.toBeNull()
  })

  it("quietly ignores an unknown automation message id", async () => {
    const body = JSON.stringify({
      type: "email.opened",
      created_at: "2026-08-13T12:01:00.000Z",
      data: { email_id: "re_unknown" },
    })
    await expect(
      handleResendWebhook(body, headersFor(body), db)
    ).resolves.toEqual({ outcome: "applied", changed: 0 })
  })

  it("keeps a signed workspace event out of another workspace", async () => {
    const timestamp = new Date()
    await db.insert(customShellWorkspaces).values({
      id: "ws-2",
      name: "Other site",
      settings: {},
      subdomain: `other-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(customShellAutomations).values({
      id: "automation-2",
      workspaceId: "ws-2",
      name: "Other tracked email",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: { v: 1, kind: "automation", nodes: {}, edges: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(customShellAutomationRuns).values({
      id: "run-2",
      automationId: "automation-2",
      workspaceId: "ws-2",
      status: "completed",
      currentNodeId: "email-1",
      configSnapshot: { v: 1, kind: "automation", nodes: {}, edges: [] },
      wakeAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(customShellAutomationDeliveries).values({
      id: "automation-delivery-2",
      runId: "run-2",
      nodeId: "email-1",
      toEmail: "other@example.com",
      subject: "Other tracked hello",
      providerMessageId: "re_automation_1",
      status: "sent",
      createdAt: timestamp,
    })

    const body = JSON.stringify({
      type: "email.opened",
      created_at: "2026-08-13T12:01:00.000Z",
      data: { email_id: "re_automation_1" },
    })
    await expect(
      handleResendWebhook(body, headersFor(body), db)
    ).resolves.toEqual({ outcome: "applied", changed: 1 })

    const rows = await db
      .select({
        id: customShellAutomationDeliveries.id,
        openedAt: customShellAutomationDeliveries.openedAt,
      })
      .from(customShellAutomationDeliveries)
    expect(rows.find((row) => row.id === "automation-delivery-1")?.openedAt).toEqual(
      new Date("2026-08-13T12:01:00.000Z")
    )
    expect(rows.find((row) => row.id === "automation-delivery-2")?.openedAt).toBeNull()
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
