import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  compiledConfigSchema,
  type CompiledConfig,
} from "@/lib/automations/compiled-config"
import { createConnection, revokeConnection } from "@/server/connections"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import { handleIngestRequest } from "@/server/ingest"
import {
  customShellUsers,
  customShellWorkspaces,
  newsletterAutomationRuns,
  newsletterAutomations,
  newsletterContacts,
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
      new URL(`../../drizzle/${file}`, import.meta.url),
      "utf8"
    )
    await client.exec(migration)
  }
  const testDb = drizzle(client, { schema })
  database = testDb as unknown as CustomShellDb
  setDbForTests(database)
})

afterEach(async () => {
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

function ingestRequest(secret: string | null, body: unknown) {
  return new Request("http://localhost/api/v1/contacts/ingest", {
    method: "POST",
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const triggerConfig: CompiledConfig = compiledConfigSchema.parse({
  v: 1,
  kind: "newsletterAutomation",
  entryNodeId: "trigger-1",
  nodes: {
    "trigger-1": {
      kind: "trigger",
      settings: { source: "ai-trading", tags: [] },
    },
    "tag-1": { kind: "tag", settings: { mode: "add", tags: ["welcomed"] } },
  },
  edges: [{ from: "trigger-1", sourcePort: "contact", to: "tag-1" }],
})

async function seedAutomation(
  workspaceId: string,
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
      compiledConfig: options.compiled === false ? null : triggerConfig,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return automation
}

describe("handleIngestRequest", () => {
  it("rejects missing, unknown, and revoked secrets", async () => {
    const workspaceId = await seedWorkspace()
    const { connection, secret } = await createConnection(
      workspaceId,
      { name: "AI Trading", appKey: "ai-trading" },
      database
    )

    const noAuth = await handleIngestRequest(
      ingestRequest(null, { email: "a@example.com" })
    )
    expect(noAuth.status).toBe(401)

    const badSecret = await handleIngestRequest(
      ingestRequest("nlk_" + "0".repeat(48), { email: "a@example.com" })
    )
    expect(badSecret.status).toBe(401)

    await revokeConnection(workspaceId, connection.id, database)
    const revoked = await handleIngestRequest(
      ingestRequest(secret, { email: "a@example.com" })
    )
    expect(revoked.status).toBe(401)
  })

  it("rejects invalid bodies", async () => {
    const workspaceId = await seedWorkspace()
    const { secret } = await createConnection(
      workspaceId,
      { name: "AI Trading", appKey: "ai-trading" },
      database
    )

    const badJson = await handleIngestRequest(ingestRequest(secret, "{nope"))
    expect(badJson.status).toBe(400)

    const badEmail = await handleIngestRequest(
      ingestRequest(secret, { email: "not-an-email" })
    )
    expect(badEmail.status).toBe(400)
  })

  it("upserts the contact and enrolls it into matching automations", async () => {
    const workspaceId = await seedWorkspace()
    const { secret } = await createConnection(
      workspaceId,
      { name: "AI Trading", appKey: "ai-trading" },
      database
    )
    const automation = await seedAutomation(workspaceId)
    await seedAutomation(workspaceId, { status: "draft" })
    await seedAutomation(workspaceId, { compiled: false })

    const response = await handleIngestRequest(
      ingestRequest(secret, {
        email: "Taylor@Example.com",
        firstName: "Taylor",
        tags: ["trading-signup"],
        customFields: { plan: "pro" },
      })
    )
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.contact.email).toBe("taylor@example.com")
    expect(payload.contact.source).toBe("ai-trading")
    expect(payload.enrolledAutomationIds).toEqual([automation.id])

    const runs = await database.select().from(newsletterAutomationRuns)
    expect(runs).toHaveLength(1)

    // Repeat ingest merges the contact and does not re-enroll.
    const repeat = await handleIngestRequest(
      ingestRequest(secret, {
        email: "taylor@example.com",
        lastName: "Trader",
        tags: ["second-tag"],
      })
    )
    expect(repeat.status).toBe(200)
    const repeatPayload = await repeat.json()
    expect(repeatPayload.enrolledAutomationIds).toEqual([])

    const contacts = await database.select().from(newsletterContacts)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].firstName).toBe("Taylor")
    expect(contacts[0].lastName).toBe("Trader")
    expect(contacts[0].tags).toEqual(
      expect.arrayContaining(["trading-signup", "second-tag"])
    )
    expect(contacts[0].source).toBe("ai-trading")

    expect(await database.select().from(newsletterAutomationRuns)).toHaveLength(
      1
    )
  })

  it("rejects oversized bodies", async () => {
    const workspaceId = await seedWorkspace()
    const { secret } = await createConnection(
      workspaceId,
      { name: "AI Trading", appKey: "ai-trading" },
      database
    )

    const response = await handleIngestRequest(
      ingestRequest(secret, {
        email: "big@example.com",
        customFields: { blob: "x".repeat(70 * 1024) },
      })
    )
    expect(response.status).toBe(413)
    expect(await database.select().from(newsletterContacts)).toHaveLength(0)
  })

  it("rate limits a connection after 120 requests per minute", async () => {
    const workspaceId = await seedWorkspace()
    const { secret } = await createConnection(
      workspaceId,
      { name: "AI Trading", appKey: "ai-trading" },
      database
    )

    // Invalid-JSON requests exercise the limiter without touching contacts.
    for (let i = 0; i < 120; i += 1) {
      const response = await handleIngestRequest(ingestRequest(secret, "{"))
      expect(response.status).toBe(400)
    }

    const limited = await handleIngestRequest(ingestRequest(secret, "{"))
    expect(limited.status).toBe(429)
  })
})
