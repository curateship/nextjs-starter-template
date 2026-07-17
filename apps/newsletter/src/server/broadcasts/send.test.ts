import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createBroadcastBlock,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { runTick } from "@/server/automations/engine"
import {
  sanitizeBlocks,
  updateWorkspaceBroadcast,
} from "@/server/broadcasts/crud"
import {
  pauseBroadcast,
  processDueBroadcasts,
  resumeBroadcast,
  scheduleBroadcast,
  sendTestBroadcast,
  startBroadcastSendNow,
} from "@/server/broadcasts/send"
import {
  buildUnsubscribeUrl,
  unsubscribeToken,
} from "@/server/broadcasts/unsubscribe"
import { handleUnsubscribeRequest } from "@/server/broadcasts/unsubscribe-request"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  setEmailProviderFactoryForTests,
  type SendEmailParams,
} from "@/server/email-provider"
import {
  customShellUsers,
  customShellWorkspaces,
  newsletterBroadcasts,
  newsletterContacts,
  newsletterDeliveries,
  newsletterEmailSettings,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

let client: PGlite
let database: CustomShellDb

process.env.NEWSLETTER_ENCRYPTION_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef"
).toString("base64")
process.env.CUSTOM_SHELL_APP_ORIGINS = "http://newsletter.test"

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "0000_custom_shell_baseline.sql",
    "0003_custom_shell_workspaces.sql",
    "0004_newsletter_core.sql",
    "0005_newsletter_broadcasts.sql",
  ]) {
    const migration = await readFile(
      new URL(`../../../drizzle/${file}`, import.meta.url),
      "utf8"
    )
    await client.exec(migration)
  }
  const testDb = drizzle(client, { schema })
  database = testDb as unknown as CustomShellDb
  setDbForTests(database)
})

afterEach(async () => {
  setEmailProviderFactoryForTests(null)
  await client.close()
})

async function seedWorkspace() {
  const timestamp = now()
  const userId = uuid()
  await database.insert(customShellUsers).values({
    id: userId,
    email: `user-${userId}@example.com`,
    name: "Test User",
    role: "admin",
    passwordHash: "x",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const workspaceId = uuid()
  await database.insert(customShellWorkspaces).values({
    id: workspaceId,
    userId,
    name: "Test",
    settings: {},
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return workspaceId
}

async function seedEmailSettings(workspaceId: string) {
  const timestamp = now()
  // A non-encrypted key round-trips through safeDecrypt untouched.
  await database.insert(newsletterEmailSettings).values({
    workspaceId,
    resendApiKeyEncrypted: "re_test_key",
    fromEmail: "news@example.com",
    fromName: "News",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

async function seedContacts(
  workspaceId: string,
  count: number,
  overrides: Partial<typeof newsletterContacts.$inferInsert> = {}
) {
  const timestamp = now()
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuid(),
    workspaceId,
    email: `contact-${index}-${uuid().slice(0, 8)}@example.com`,
    firstName: `First${index}`,
    tags: [] as string[],
    customFields: {},
    status: "subscribed",
    createdAt: new Date(timestamp.getTime() + index),
    updatedAt: timestamp,
    ...overrides,
  }))
  await database.insert(newsletterContacts).values(rows)
  return rows
}

function starterBlocks(): BroadcastBlock[] {
  const richText = createBroadcastBlock("richText")
  richText.content = {
    ...richText.content,
    htmlContent: "<p>Hi {{firstName}}</p>",
  }
  const footer = createBroadcastBlock("footer")
  footer.content = { ...footer.content, companyName: "Test Co" }
  return [richText, footer]
}

async function seedBroadcast(
  workspaceId: string,
  overrides: Partial<typeof newsletterBroadcasts.$inferInsert> = {}
) {
  const timestamp = now()
  const [broadcast] = await database
    .insert(newsletterBroadcasts)
    .values({
      id: uuid(),
      workspaceId,
      name: "Launch",
      subject: "Hello {{firstName}}",
      blocks: starterBlocks(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()
  return broadcast
}

function stubProvider(
  sent: SendEmailParams[],
  options: { failEvery?: number; failAll?: boolean } = {}
) {
  setEmailProviderFactoryForTests(() => ({
    send: async (params) => {
      sent.push(params)
      if (
        options.failAll ||
        (options.failEvery && sent.length % options.failEvery === 0)
      ) {
        return { success: false, error: "boom" }
      }
      return { success: true, messageId: `msg_${sent.length}` }
    },
  }))
}

async function drainBroadcasts(maxPasses = 10, nowFn?: () => Date) {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    await processDueBroadcasts(database, nowFn)
    const [pending] = await database
      .select({ status: newsletterBroadcasts.status })
      .from(newsletterBroadcasts)
      .where(eq(newsletterBroadcasts.status, "sending"))
      .limit(1)
    if (!pending) return
  }
}

async function loadBroadcast(id: string) {
  const [row] = await database
    .select()
    .from(newsletterBroadcasts)
    .where(eq(newsletterBroadcasts.id, id))
    .limit(1)
  return row
}

async function loadDeliveries(broadcastId: string) {
  return database
    .select()
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.broadcastId, broadcastId))
}

describe("broadcast sending", () => {
  it("sends to every subscribed contact in batches with one delivery each", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 120)
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    await startBroadcastSendNow(workspaceId, broadcast.id)
    let row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("sending")
    expect(row.totalRecipients).toBe(120)

    // Non-drip batches are 50 per pass: 50 / 50 / 20.
    await processDueBroadcasts(database)
    expect((await loadDeliveries(broadcast.id)).length).toBe(50)

    await drainBroadcasts()

    row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("sent")
    expect(row.sentAt).not.toBeNull()
    expect(row.totalSent).toBe(120)
    expect(row.totalFailed).toBe(0)

    const deliveries = await loadDeliveries(broadcast.id)
    expect(deliveries.length).toBe(120)
    expect(new Set(deliveries.map((d) => d.contactId)).size).toBe(120)
    expect(sent.length).toBe(120)
    // Subject and body are personalized per recipient.
    expect(sent[0].subject).toMatch(/^Hello First\d+$/)
    expect(sent[0].html).toContain("Hi First")
    expect(sent[0].html).toContain("/api/v1/unsubscribe?")
    expect(sent[0].headers?.["List-Unsubscribe"]).toContain(
      "/api/v1/unsubscribe?"
    )
  })

  it("never sends to unsubscribed contacts", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 5)
    await seedContacts(workspaceId, 2, { status: "unsubscribed" })
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    await startBroadcastSendNow(workspaceId, broadcast.id)
    await drainBroadcasts()

    const row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("sent")
    expect(row.totalSent).toBe(5)
    expect(sent.length).toBe(5)
  })

  it("filters the audience by tag overlap", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 3, { tags: ["vip"] })
    await seedContacts(workspaceId, 2, { tags: ["beta", "extra"] })
    await seedContacts(workspaceId, 4, { tags: ["other"] })
    const broadcast = await seedBroadcast(workspaceId, {
      audienceFilter: { kind: "tags", tags: ["vip", "beta"] },
    })
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    await startBroadcastSendNow(workspaceId, broadcast.id)
    await drainBroadcasts()

    expect(sent.length).toBe(5)
    expect((await loadBroadcast(broadcast.id)).totalSent).toBe(5)
  })

  it("promotes scheduled broadcasts at (not before) their time", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 3)
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    const sendAt = new Date(Date.now() + 60 * 60 * 1000)
    await scheduleBroadcast(workspaceId, broadcast.id, sendAt)
    expect((await loadBroadcast(broadcast.id)).status).toBe("scheduled")

    await processDueBroadcasts(database)
    expect((await loadBroadcast(broadcast.id)).status).toBe("scheduled")
    expect(sent.length).toBe(0)

    const afterSendAt = () => new Date(sendAt.getTime() + 1000)
    await drainBroadcasts(10, afterSendAt)
    expect((await loadBroadcast(broadcast.id)).status).toBe("sent")
    expect(sent.length).toBe(3)
  })

  it("rejects scheduling in the past", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 1)
    const broadcast = await seedBroadcast(workspaceId)

    await expect(
      scheduleBroadcast(workspaceId, broadcast.id, new Date(Date.now() - 1000))
    ).rejects.toThrow("Pick a time in the future")
  })

  it("drip mode honors send windows and paces batches by interval", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 5)
    const broadcast = await seedBroadcast(workspaceId, {
      status: "sending",
      dripConfig: {
        enabled: true,
        batchSizeMin: 2,
        batchSizeMax: 2,
        intervalMinMinutes: 10,
        intervalMaxMinutes: 10,
        failureThresholdPercent: 50,
        skipWeekends: false,
        sendWindows: [{ start: "09:00", end: "17:00" }],
        sendWindowTimezone: "UTC",
      },
    })
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    // Outside the window: nothing sends, retry is pushed a few minutes out.
    const at = (iso: string) => () => new Date(iso)
    await processDueBroadcasts(database, at("2026-07-16T08:00:00Z"))
    expect(sent.length).toBe(0)
    let row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("sending")
    expect(row.nextBatchAt).not.toBeNull()

    // Inside the window: one batch of exactly two.
    await processDueBroadcasts(database, at("2026-07-16T09:30:00Z"))
    expect(sent.length).toBe(2)
    row = await loadBroadcast(broadcast.id)
    expect(row.batchesSent).toBe(1)
    expect(row.nextBatchAt?.toISOString()).toBe("2026-07-16T09:40:00.000Z")

    // Before the interval elapses nothing new goes out.
    await processDueBroadcasts(database, at("2026-07-16T09:35:00Z"))
    expect(sent.length).toBe(2)

    // After the interval the next batch goes out.
    await processDueBroadcasts(database, at("2026-07-16T09:41:00Z"))
    expect(sent.length).toBe(4)

    await processDueBroadcasts(database, at("2026-07-16T09:55:00Z"))
    expect(sent.length).toBe(5)
    expect((await loadBroadcast(broadcast.id)).status).toBe("sent")
  })

  it("pause stops new batches and resume completes without duplicates", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 120)
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    await startBroadcastSendNow(workspaceId, broadcast.id)
    await processDueBroadcasts(database)
    expect(sent.length).toBe(50)

    await pauseBroadcast(workspaceId, broadcast.id)
    await processDueBroadcasts(database)
    await processDueBroadcasts(database)
    expect(sent.length).toBe(50)
    expect((await loadBroadcast(broadcast.id)).status).toBe("paused")

    await resumeBroadcast(workspaceId, broadcast.id)
    await drainBroadcasts()

    const row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("sent")
    expect(row.totalSent).toBe(120)
    const deliveries = await loadDeliveries(broadcast.id)
    expect(deliveries.length).toBe(120)
    expect(new Set(deliveries.map((d) => d.contactId)).size).toBe(120)
    expect(sent.length).toBe(120)
  })

  it("auto-pauses when the failure rate crosses the threshold", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 60)
    const broadcast = await seedBroadcast(workspaceId, {
      status: "sending",
      dripConfig: {
        enabled: true,
        batchSizeMin: 30,
        batchSizeMax: 30,
        intervalMinMinutes: 1,
        intervalMaxMinutes: 1,
        failureThresholdPercent: 10,
        skipWeekends: false,
        sendWindows: [],
        sendWindowTimezone: "UTC",
      },
    })
    const sent: SendEmailParams[] = []
    stubProvider(sent, { failAll: true })

    await processDueBroadcasts(database)

    const row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("paused")
    expect(row.pausedReason).toContain("Auto-paused")
    expect(row.totalFailed).toBe(30)
    // Failed attempts are recorded so a resume never retries them.
    expect((await loadDeliveries(broadcast.id)).length).toBe(30)
  })

  it("records provider failures per contact and still finishes", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 10)
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent, { failEvery: 5 }) // 2 of 10 fail — under the 50% guard

    await startBroadcastSendNow(workspaceId, broadcast.id)
    await drainBroadcasts()

    const row = await loadBroadcast(broadcast.id)
    expect(row.status).toBe("sent")
    expect(row.totalSent).toBe(8)
    expect(row.totalFailed).toBe(2)
    const deliveries = await loadDeliveries(broadcast.id)
    expect(deliveries.filter((d) => d.status === "failed").length).toBe(2)
  })

  it("runTick drives broadcast sending alongside automation runs", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    await seedContacts(workspaceId, 3)
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    await startBroadcastSendNow(workspaceId, broadcast.id)
    const result = await runTick(database)

    expect(result.broadcastsProcessed).toBe(1)
    expect(sent.length).toBe(3)
    expect((await loadBroadcast(broadcast.id)).status).toBe("sent")
  })

  it("test sends do not write deliveries", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    const broadcast = await seedBroadcast(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    const result = await sendTestBroadcast(
      workspaceId,
      broadcast.id,
      "me@example.com"
    )

    expect(result.ok).toBe(true)
    expect(sent.length).toBe(1)
    expect(sent[0].subject).toBe("[TEST] Hello Test")
    expect(sent[0].to).toBe("me@example.com")
    expect(await loadDeliveries(broadcast.id)).toHaveLength(0)
  })

  it("refuses edits while a broadcast is sending", async () => {
    const workspaceId = await seedWorkspace()
    const broadcast = await seedBroadcast(workspaceId, { status: "sending" })

    await expect(
      updateWorkspaceBroadcast(workspaceId, {
        id: broadcast.id,
        subject: "New subject",
      })
    ).rejects.toThrow("currently sending")
  })
})

describe("sanitizeBlocks", () => {
  it("strips scripts and event handlers from rich text", () => {
    const block = createBroadcastBlock("richText")
    block.content = {
      ...block.content,
      htmlContent:
        '<p onclick="alert(1)">Hi</p><script>alert(2)</script><a href="javascript:alert(3)">x</a><img src="https://x.dev/a.png">',
    }
    const [clean] = sanitizeBlocks([block])
    if (clean.kind !== "richText") throw new Error("kind changed")
    expect(clean.content.htmlContent).not.toContain("script")
    expect(clean.content.htmlContent).not.toContain("onclick")
    expect(clean.content.htmlContent).not.toContain("javascript:")
    expect(clean.content.htmlContent).toContain('src="https://x.dev/a.png"')
  })
})

describe("unsubscribe", () => {
  it("unsubscribes a contact via its signed link", async () => {
    const workspaceId = await seedWorkspace()
    const [contact] = await seedContacts(workspaceId, 1)

    const url = buildUnsubscribeUrl(contact.id)
    expect(url).toContain("http://newsletter.test/api/v1/unsubscribe?")

    const response = await handleUnsubscribeRequest(new Request(url), database)
    expect(response.status).toBe(200)

    const [row] = await database
      .select({ status: newsletterContacts.status })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contact.id))
    expect(row.status).toBe("unsubscribed")
  })

  it("rejects a tampered token", async () => {
    const workspaceId = await seedWorkspace()
    const [contact] = await seedContacts(workspaceId, 1)
    const badToken = unsubscribeToken("someone-else")

    const response = await handleUnsubscribeRequest(
      new Request(
        `http://newsletter.test/api/v1/unsubscribe?c=${contact.id}&t=${badToken}`
      ),
      database
    )
    expect(response.status).toBe(400)

    const [row] = await database
      .select({ status: newsletterContacts.status })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contact.id))
    expect(row.status).toBe("subscribed")
  })
})
