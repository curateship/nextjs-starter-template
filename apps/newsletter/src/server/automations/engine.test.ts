import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  compiledConfigSchema,
  type CompiledConfig,
} from "@/lib/automations/compiled-config"
import { runTick } from "@/server/automations/engine"
import { enrollContact, matchTrigger } from "@/server/automations/enroll"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  setEmailProviderFactoryForTests,
  type SendEmailParams,
} from "@/server/email-provider"
import {
  customShellUsers,
  customShellWorkspaces,
  newsletterAutomationRuns,
  newsletterAutomationRunSteps,
  newsletterAutomations,
  newsletterContacts,
  newsletterDeliveries,
  newsletterEmailSettings,
  type NewsletterContact,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "0000_custom_shell_baseline.sql",
    "0003_custom_shell_workspaces.sql",
    "0004_newsletter_core.sql",
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

async function seedContact(
  workspaceId: string,
  overrides: Partial<typeof newsletterContacts.$inferInsert> = {}
): Promise<NewsletterContact> {
  const timestamp = now()
  const [contact] = await database
    .insert(newsletterContacts)
    .values({
      id: uuid(),
      workspaceId,
      email: `contact-${uuid()}@example.com`,
      tags: [],
      customFields: {},
      status: "subscribed",
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()
  return contact
}

async function seedAutomation(
  workspaceId: string,
  config: CompiledConfig,
  options: { status?: string; compiled?: boolean } = {}
) {
  const timestamp = now()
  const [automation] = await database
    .insert(newsletterAutomations)
    .values({
      id: uuid(),
      workspaceId,
      name: `Automation ${uuid()}`,
      status: options.status ?? "active",
      graph: {},
      compiledConfig: options.compiled === false ? null : config,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return automation
}

function makeConfig(
  nodes: CompiledConfig["nodes"],
  edges: CompiledConfig["edges"],
  entryNodeId = "trigger-1"
): CompiledConfig {
  return compiledConfigSchema.parse({
    v: 1,
    kind: "newsletterAutomation",
    entryNodeId,
    nodes,
    edges,
  })
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

function stubProvider(sent: SendEmailParams[], options: { fail?: boolean } = {}) {
  setEmailProviderFactoryForTests(() => ({
    send: async (params) => {
      sent.push(params)
      if (options.fail) return { success: false, error: "boom" }
      return { success: true, messageId: `msg_${sent.length}` }
    },
  }))
}

async function backdateRuns() {
  await database
    .update(newsletterAutomationRuns)
    .set({ wakeAt: new Date(Date.now() - 60_000) })
}

describe("matchTrigger", () => {
  it("matches source and tag filters", () => {
    expect(matchTrigger({}, "ai-trading", [])).toBe(true)
    expect(matchTrigger({ source: "ai-trading" }, "ai-trading", [])).toBe(true)
    expect(matchTrigger({ source: "other-app" }, "ai-trading", [])).toBe(false)
    expect(matchTrigger({ tags: ["vip"] }, "ai-trading", ["vip", "x"])).toBe(
      true
    )
    expect(matchTrigger({ tags: ["vip"] }, "ai-trading", ["x"])).toBe(false)
    expect(
      matchTrigger({ source: "ai-trading", tags: ["vip"] }, "ai-trading", [])
    ).toBe(false)
  })
})

describe("enrollContact", () => {
  const config = makeConfig(
    {
      "trigger-1": {
        kind: "trigger",
        settings: { source: "ai-trading", tags: [] },
      },
      "tag-1": { kind: "tag", settings: { mode: "add", tags: ["welcomed"] } },
    },
    [{ from: "trigger-1", sourcePort: "contact", to: "tag-1" }]
  )

  it("enrolls matching contacts once-ever", async () => {
    const workspaceId = await seedWorkspace()
    const automation = await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId)

    const first = await enrollContact(
      workspaceId,
      contact,
      "ai-trading",
      database
    )
    expect(first).toEqual([automation.id])

    const second = await enrollContact(
      workspaceId,
      contact,
      "ai-trading",
      database
    )
    expect(second).toEqual([])

    const runs = await database.select().from(newsletterAutomationRuns)
    expect(runs).toHaveLength(1)
    expect(runs[0].currentNodeId).toBe("trigger-1")
  })

  it("skips non-matching sources and inactive automations", async () => {
    const workspaceId = await seedWorkspace()
    await seedAutomation(workspaceId, config)
    await seedAutomation(workspaceId, config, { status: "draft" })
    await seedAutomation(workspaceId, config, { status: "paused" })
    await seedAutomation(workspaceId, config, { compiled: false })
    const contact = await seedContact(workspaceId)

    expect(
      await enrollContact(workspaceId, contact, "other-app", database)
    ).toEqual([])

    const enrolled = await enrollContact(
      workspaceId,
      contact,
      "ai-trading",
      database
    )
    expect(enrolled).toHaveLength(1)
  })
})

describe("runTick", () => {
  it("executes trigger → tag → sendEmail to completion", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
        "tag-1": { kind: "tag", settings: { mode: "add", tags: ["welcomed"] } },
        "email-1": {
          kind: "sendEmail",
          settings: {
            subject: "Hi {{firstName}}",
            body: "<p>Welcome {{email}}</p>",
            preheader: "",
          },
        },
      },
      [
        { from: "trigger-1", sourcePort: "contact", to: "tag-1" },
        { from: "tag-1", sourcePort: "then", to: "email-1" },
      ]
    )
    await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId, { firstName: "Taylor" })
    await enrollContact(workspaceId, contact, "ai-trading", database)

    const result = await runTick(database)
    expect(result).toEqual({ processed: 1, failed: 0 })

    const [run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("completed")
    expect(run.claimToken).toBeNull()
    expect(run.completedAt).not.toBeNull()

    const steps = await database.select().from(newsletterAutomationRunSteps)
    expect(steps.map((step) => step.kind).sort()).toEqual([
      "sendEmail",
      "tag",
      "trigger",
    ])
    expect(steps.every((step) => step.status === "completed")).toBe(true)

    const [updatedContact] = await database
      .select()
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contact.id))
    expect(updatedContact.tags).toContain("welcomed")

    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe("Hi Taylor")
    expect(sent[0].html).toContain(contact.email)

    const deliveries = await database.select().from(newsletterDeliveries)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].status).toBe("sent")
    expect(deliveries[0].providerMessageId).toBe("msg_1")
  })

  it("escapes contact fields substituted into email HTML", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
        "email-1": {
          kind: "sendEmail",
          settings: {
            subject: "Hi {{firstName}}",
            body: "<p>Hello {{firstName}}</p>",
            preheader: "",
          },
        },
      },
      [{ from: "trigger-1", sourcePort: "contact", to: "email-1" }]
    )
    await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId, {
      firstName: '<img src=x onerror="x">',
    })
    await enrollContact(workspaceId, contact, "app", database)

    await runTick(database)

    expect(sent).toHaveLength(1)
    expect(sent[0].html).not.toContain("<img")
    expect(sent[0].html).toContain("&lt;img src=x onerror=&quot;x&quot;&gt;")
    // Subject is a plain-text context — no HTML entities.
    expect(sent[0].subject).toBe('Hi <img src=x onerror="x">')
  })

  it("routes branch yes/no by contact tags", async () => {
    const workspaceId = await seedWorkspace()
    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
        "branch-1": {
          kind: "branch",
          settings: { field: "tag", op: "has", value: "vip" },
        },
        "tag-yes": { kind: "tag", settings: { mode: "add", tags: ["yes"] } },
        "tag-no": { kind: "tag", settings: { mode: "add", tags: ["no"] } },
      },
      [
        { from: "trigger-1", sourcePort: "contact", to: "branch-1" },
        { from: "branch-1", sourcePort: "yes", to: "tag-yes" },
        { from: "branch-1", sourcePort: "no", to: "tag-no" },
      ]
    )
    await seedAutomation(workspaceId, config)

    const vip = await seedContact(workspaceId, { tags: ["vip"] })
    const regular = await seedContact(workspaceId)
    await enrollContact(workspaceId, vip, "app", database)
    await enrollContact(workspaceId, regular, "app", database)

    await runTick(database)

    const [vipRow] = await database
      .select()
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, vip.id))
    const [regularRow] = await database
      .select()
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, regular.id))

    expect(vipRow.tags).toContain("yes")
    expect(vipRow.tags).not.toContain("no")
    expect(regularRow.tags).toContain("no")
    expect(regularRow.tags).not.toContain("yes")
  })

  it("parks delay runs as waiting and resumes them", async () => {
    const workspaceId = await seedWorkspace()
    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
        "delay-1": {
          kind: "delay",
          settings: { amount: 10, unit: "minutes" },
        },
        "tag-1": { kind: "tag", settings: { mode: "add", tags: ["after"] } },
      },
      [
        { from: "trigger-1", sourcePort: "contact", to: "delay-1" },
        { from: "delay-1", sourcePort: "then", to: "tag-1" },
      ]
    )
    await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId)
    await enrollContact(workspaceId, contact, "app", database)

    await runTick(database)

    let [run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("waiting")
    expect(run.currentNodeId).toBe("tag-1")
    const expectedWake = Date.now() + 10 * 60_000
    expect(Math.abs(run.wakeAt.getTime() - expectedWake)).toBeLessThan(10_000)

    // Not due yet — a tick claims nothing.
    expect(await runTick(database)).toEqual({ processed: 0, failed: 0 })

    await backdateRuns()
    await runTick(database)
    ;[run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("completed")

    const [contactRow] = await database
      .select()
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contact.id))
    expect(contactRow.tags).toContain("after")
  })

  it("retries failing nodes with backoff then fails the run", async () => {
    const workspaceId = await seedWorkspace()
    // No email settings seeded — sendEmail throws a retryable error.
    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
        "email-1": {
          kind: "sendEmail",
          settings: { subject: "Hi", body: "<p>Hi</p>", preheader: "" },
        },
      },
      [{ from: "trigger-1", sourcePort: "contact", to: "email-1" }]
    )
    await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId)
    await enrollContact(workspaceId, contact, "app", database)

    await runTick(database)
    let [run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("active")
    expect(run.attempts).toBe(1)
    expect(run.wakeAt.getTime()).toBeGreaterThan(Date.now())

    await backdateRuns()
    await runTick(database)
    ;[run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("active")
    expect(run.attempts).toBe(2)

    await backdateRuns()
    await runTick(database)
    ;[run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("failed")
    expect(run.error).toBe("Email settings are not configured")

    const steps = await database.select().from(newsletterAutomationRunSteps)
    const failedSteps = steps.filter((step) => step.status === "failed")
    expect(failedSteps).toHaveLength(3)
  })

  it("skips sending to unsubscribed contacts", async () => {
    const workspaceId = await seedWorkspace()
    await seedEmailSettings(workspaceId)
    const sent: SendEmailParams[] = []
    stubProvider(sent)

    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
        "email-1": {
          kind: "sendEmail",
          settings: { subject: "Hi", body: "<p>Hi</p>", preheader: "" },
        },
      },
      [{ from: "trigger-1", sourcePort: "contact", to: "email-1" }]
    )
    await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId, { status: "unsubscribed" })
    await enrollContact(workspaceId, contact, "app", database)

    await runTick(database)

    const [run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("completed")
    expect(sent).toHaveLength(0)
    expect(await database.select().from(newsletterDeliveries)).toHaveLength(0)
  })

  it("fails runs whose snapshot is invalid", async () => {
    const workspaceId = await seedWorkspace()
    const config = makeConfig(
      {
        "trigger-1": { kind: "trigger", settings: { source: "", tags: [] } },
      },
      []
    )
    const automation = await seedAutomation(workspaceId, config)
    const contact = await seedContact(workspaceId)
    const timestamp = now()
    await database.insert(newsletterAutomationRuns).values({
      id: uuid(),
      automationId: automation.id,
      contactId: contact.id,
      workspaceId,
      status: "active",
      currentNodeId: "trigger-1",
      configSnapshot: { bogus: true },
      wakeAt: timestamp,
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await runTick(database)

    const [run] = await database.select().from(newsletterAutomationRuns)
    expect(run.status).toBe("failed")
    expect(run.error).toBe("Invalid automation snapshot")
  })
})
