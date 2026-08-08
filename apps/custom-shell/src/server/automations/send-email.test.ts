import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import { sendEmailDraftSettingsSchema } from "@/lib/automations/nodes/send-email"
import { executeSendEmailNode } from "@/server/automations/send-email"
import {
  createUserAutomation,
  inspectAutomation,
  saveUserAutomation,
} from "@/server/automations/flows"
import type { CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests } from "@/server/email/provider"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellContacts,
  customShellWorkspaces,
  type CustomShellAutomationRun,
  type CustomShellUser,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser } from "@/server/test-support"

const WORKSPACE_ID = "ws-send-email"
const EMAIL_NODE_ID = "email"
const SETTINGS = {
  subject: "A small update",
  preheader: "A quick preview",
  fromName: "",
  blocks: [
    {
      id: "message",
      kind: "richText",
      content: {
        htmlContent: "<p>Hello &lt;friend&gt;</p><p>News.</p>",
        backgroundColor: "#ffffff",
        padding: 20,
      },
    },
  ],
}
const UNSUBSCRIBE_FOOTER = {
  id: "footer",
  kind: "footer",
  content: {
    companyName: "Example",
    companyAddress: "123 Main Street",
    alignment: "center",
    showUnsubscribe: true,
  },
} as const

let client: PGlite
let db: CustomShellDb
let owner: CustomShellUser

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db
  owner = await insertUser(db, { role: "admin", email: "owner@example.test" })
  const timestamp = now()
  await db.insert(customShellWorkspaces).values({
    id: WORKSPACE_ID,
    userId: owner.id,
    name: "Main",
    settings: {},
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
})

afterEach(async () => {
  setEmailProviderFactoryForTests(null)
  await client.close()
})

function config(withAudience: boolean) {
  return automationCompiledConfigSchema.parse({
    v: 1,
    kind: "automation",
    nodes: {
      ...(withAudience
        ? {
            audience: {
              kind: "audience",
              settings: {
                audience: "everyone",
                planSlug: "",
                segmentId: "",
                segmentName: "",
              },
            },
          }
        : {}),
      [EMAIL_NODE_ID]: { kind: "sendEmail", settings: SETTINGS },
    },
    edges: withAudience
      ? [{ from: "audience", sourcePort: "then", to: EMAIL_NODE_ID }]
      : [],
  })
}

async function insertRun(
  options: {
    withAudience?: boolean
    subjectUserId?: string | null
    claimToken?: string | null
    configOverride?: ReturnType<typeof config>
    completedAudiences?: Array<{ id: string; nodeId: string }>
  } = {}
): Promise<CustomShellAutomationRun> {
  const withAudience = options.withAudience ?? true
  const runConfig = options.configOverride ?? config(withAudience)
  const timestamp = now()
  const automationId = uuid()
  await db.insert(customShellAutomations).values({
    id: automationId,
    userId: owner.id,
    name: `Send ${automationId}`,
    graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    compiledConfig: runConfig,
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const [run] = await db
    .insert(customShellAutomationRuns)
    .values({
      id: uuid(),
      automationId,
      userId: owner.id,
      status: "active",
      currentNodeId: EMAIL_NODE_ID,
      configSnapshot: runConfig,
      wakeAt: timestamp,
      attempts: 0,
      claimToken: options.claimToken ?? null,
      claimedAt: options.claimToken ? timestamp : null,
      subjectUserId: options.subjectUserId ?? null,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (withAudience) {
    await db.insert(customShellAutomationRunSteps).values(
      (options.completedAudiences ?? [{ id: uuid(), nodeId: "audience" }]).map(
        (audience) => ({
          id: audience.id,
          runId: run.id,
          nodeId: audience.nodeId,
          kind: "audience",
          status: "completed" as const,
          attempts: 1,
          summary: "Matched people.",
          startedAt: timestamp,
          finishedAt: timestamp,
        })
      )
    )
  }
  return run
}

async function execute(
  run: CustomShellAutomationRun,
  settings: Record<string, unknown> = SETTINGS
) {
  return executeSendEmailNode({
    database: db,
    run,
    nodeId: EMAIL_NODE_ID,
    settings,
    now,
  })
}

describe("Send Email executor", () => {
  it("isolates failures, skips unconfirmed members, and does not resend on retry", async () => {
    await insertUser(db, { email: "good@example.test" })
    await insertUser(db, { email: "bad@example.test" })
    await insertUser(db, {
      email: "unconfirmed@example.test",
      emailVerifiedAt: null,
    })
    const send = vi.fn(async ({ to }: { to: string }) =>
      to === "bad@example.test"
        ? { success: false, error: "Address rejected" }
        : { success: true, messageId: `sent-${to}` }
    )
    setEmailProviderFactoryForTests(() => ({ send }))
    const run = await insertRun()

    const first = await execute(run)
    expect(first.summary).toBe(
      "Emailed 2, 1 failed, 1 skipped because their email was not confirmed."
    )
    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls.map(([mail]) => mail.to)).not.toContain(
      "unconfirmed@example.test"
    )

    const rows = await db
      .select()
      .from(customShellAutomationDeliveries)
      .where(eq(customShellAutomationDeliveries.runId, run.id))
      .orderBy(asc(customShellAutomationDeliveries.toEmail))
    expect(rows).toHaveLength(3)
    expect(
      rows.find((row) => row.toEmail === "bad@example.test")
    ).toMatchObject({ status: "failed", error: "Address rejected" })
    expect(
      rows.find((row) => row.toEmail === "good@example.test")
    ).toMatchObject({ status: "sent", subject: SETTINGS.subject })

    const retried = await execute(run)
    expect(retried.summary).toBe(first.summary)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it("emails the run's subject member when no Audience step came first", async () => {
    const member = await insertUser(db, { email: "subject@example.test" })
    const send = vi.fn(async () => ({
      success: true,
      messageId: "sent-subject",
    }))
    setEmailProviderFactoryForTests(() => ({ send }))
    const run = await insertRun({
      withAudience: false,
      subjectUserId: member.id,
    })

    const result = await execute(run)
    expect(result.summary).toContain("Emailed 1, 0 failed")
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "subject@example.test" })
    )
  })

  it("uses the closest completed Audience step when two finish together", async () => {
    const timestamp = now()
    await db.insert(customShellContacts).values({
      id: uuid(),
      workspaceId: WORKSPACE_ID,
      email: "manual@example.test",
      status: "subscribed",
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const runConfig = automationCompiledConfigSchema.parse({
      v: 1,
      kind: "automation",
      nodes: {
        wide: {
          kind: "audience",
          settings: { audience: "everyone", planSlug: "", segmentId: "" },
        },
        narrow: {
          kind: "audience",
          settings: { audience: "registered", planSlug: "", segmentId: "" },
        },
        [EMAIL_NODE_ID]: { kind: "sendEmail", settings: SETTINGS },
      },
      edges: [
        { from: "wide", sourcePort: "then", to: "narrow" },
        { from: "narrow", sourcePort: "then", to: EMAIL_NODE_ID },
      ],
    })
    const send = vi.fn(async () => ({ success: true, messageId: "sent-owner" }))
    setEmailProviderFactoryForTests(() => ({ send }))
    const run = await insertRun({
      configOverride: runConfig,
      completedAudiences: [
        { id: "zzzz-wide-step", nodeId: "wide" },
        { id: "aaaa-narrow-step", nodeId: "narrow" },
      ],
    })

    const result = await execute(run)
    expect(result.summary).toContain("Emailed 1, 0 failed")
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.test" })
    )
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "manual@example.test" })
    )
  })

  it("says plainly when a hand-started run has no recipient", async () => {
    const run = await insertRun({ withAudience: false })

    const result = await execute(run)
    expect(result.summary).toBe(
      "Emailed 0, 0 failed — this run had no Audience step and was not about a member."
    )
  })

  it("works through more than one bounded audience page", async () => {
    const timestamp = now()
    await db.insert(customShellContacts).values(
      Array.from({ length: 51 }, (_, index) => ({
        id: uuid(),
        workspaceId: WORKSPACE_ID,
        email: `person-${String(index).padStart(2, "0")}@example.test`,
        status: "subscribed",
        tags: [],
        createdAt: new Date(timestamp.getTime() + index + 1),
        updatedAt: timestamp,
      }))
    )
    const send = vi.fn(async () => ({ success: true, messageId: uuid() }))
    setEmailProviderFactoryForTests(() => ({ send }))
    const run = await insertRun({ claimToken: "send-email-claim" })

    const result = await execute(run)
    expect(result.summary).toContain("Emailed 52, 0 failed")
    expect(send).toHaveBeenCalledTimes(52)
    const [stillClaimed] = await db
      .select({ id: customShellAutomationRuns.id })
      .from(customShellAutomationRuns)
      .where(
        and(
          eq(customShellAutomationRuns.id, run.id),
          eq(customShellAutomationRuns.claimToken, "send-email-claim")
        )
      )
    expect(stillClaimed?.id).toBe(run.id)
  })

  it("renders builder blocks and escapes personalised contact values", async () => {
    const member = await insertUser(db, {
      email: "personalised@example.test",
      name: "<Friend> Person",
    })
    const send = vi.fn(async () => ({ success: true, messageId: "sent" }))
    setEmailProviderFactoryForTests(() => ({ send }))
    const run = await insertRun({
      withAudience: false,
      subjectUserId: member.id,
    })

    await execute(run, {
      ...SETTINGS,
      blocks: [
        {
          ...SETTINGS.blocks[0],
          content: {
            ...SETTINGS.blocks[0].content,
            htmlContent: "<p>Hello {{firstName}}</p>",
          },
        },
      ],
    })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Hello &lt;Friend&gt;"),
      })
    )
  })

  it("adds a signed unsubscribe link when the footer asks for one", async () => {
    const previousKey = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY =
      "send-email-test-signing-key"
    try {
      const member = await insertUser(db, { email: "footer@example.test" })
      const send = vi.fn(async () => ({ success: true, messageId: "sent" }))
      setEmailProviderFactoryForTests(() => ({ send }))
      const run = await insertRun({
        withAudience: false,
        subjectUserId: member.id,
      })

      await execute(run, {
        ...SETTINGS,
        blocks: [...SETTINGS.blocks, UNSUBSCRIBE_FOOTER],
      })

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.not.stringContaining("{{unsubscribe_url}}"),
          headers: expect.objectContaining({
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }),
        })
      )
    } finally {
      if (previousKey === undefined) {
        delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
      } else {
        process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = previousKey
      }
    }
  })

  it("sends nothing when an unsubscribe link cannot be signed", async () => {
    const previousKey = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    try {
      const member = await insertUser(db, { email: "blocked@example.test" })
      const send = vi.fn(async () => ({ success: true, messageId: "sent" }))
      setEmailProviderFactoryForTests(() => ({ send }))
      const run = await insertRun({
        withAudience: false,
        subjectUserId: member.id,
      })

      await expect(
        execute(run, {
          ...SETTINGS,
          blocks: [...SETTINGS.blocks, UNSUBSCRIBE_FOOTER],
        })
      ).rejects.toThrow(
        "Unsubscribe links are not set up, so this email cannot be sent safely."
      )
      expect(send).not.toHaveBeenCalled()
      const deliveries = await db
        .select()
        .from(customShellAutomationDeliveries)
        .where(eq(customShellAutomationDeliveries.runId, run.id))
      expect(deliveries).toHaveLength(0)
    } finally {
      if (previousKey === undefined) {
        delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
      } else {
        process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = previousKey
      }
    }
  })

  it("cleans builder markup before an automation is stored", async () => {
    const automation = await createUserAutomation(owner.id, "Clean me", db)
    const saved = await saveUserAutomation(
      owner.id,
      {
        id: automation.id,
        name: automation.name,
        graph: {
          nodes: [
            {
              id: EMAIL_NODE_ID,
              kind: "sendEmail",
              x: 0,
              y: 0,
              settings: {
                ...SETTINGS,
                blocks: [
                  {
                    ...SETTINGS.blocks[0],
                    content: {
                      ...SETTINGS.blocks[0].content,
                      htmlContent:
                        '<p onclick="alert(1)">Safe</p><script>alert(2)</script>',
                    },
                  },
                ],
              },
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
      db
    )

    const node = saved ? inspectAutomation(saved).graph.nodes[0] : null
    const settings = sendEmailDraftSettingsSchema.parse(node?.settings)
    const block = settings.blocks[0]
    expect(block.kind).toBe("richText")
    if (block.kind !== "richText") throw new Error("Expected rich text")
    expect(block.content.htmlContent).toBe("<p>Safe</p>")
  })
})
