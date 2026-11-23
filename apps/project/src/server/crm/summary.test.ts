import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/ai/keys", () => ({
  getAiKey: vi.fn(async (provider: string) => (provider === "anthropic" && keyed ? "test-key" : null)),
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: vi.fn(async (_meta: unknown, call: () => Promise<{ result: string }>) => (await call()).result),
}))

let keyed = true

import {
  CRM_NO_AI_KEY,
  CRM_TOO_SHORT_TO_SUMMARISE,
  summariseCrmThread,
} from "@/server/crm/draft"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** What this thread is about (CRM task 32), with a stand-in AI provider. */
describe("summarising a conversation", () => {
  let db: CustomShellDb
  let prompts: string[]
  const workspaceId = "ws-crm"

  beforeEach(async () => {
    keyed = true
    prompts = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        prompts.push(JSON.parse(init.body).system)
        return new Response(
          JSON.stringify({ content: [{ type: "text", text: "They want a kitchen quote. It is waiting on us." }], usage: { input_tokens: 10, output_tokens: 5 } }),
          { status: 200 }
        )
      })
    )
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: owner.id,
      name: workspaceId,
      settings: {},
      subdomain: `w-${workspaceId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmLeads).values({ id: "lead-1", workspaceId, email: "jane@example.com", stage: "new", createdAt: new Date(), updatedAt: new Date() })
  })

  afterEach(() => vi.unstubAllGlobals())

  async function threadWith(count: number) {
    await db.insert(customShellCrmThreads).values({
      id: "thread-1",
      workspaceId,
      leadId: "lead-1",
      subject: "Kitchen",
      subjectKey: "kitchen",
      status: "open",
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: count,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmMessages).values(
      Array.from({ length: count }, (_, index) => ({
        id: `m-${index}`,
        workspaceId,
        threadId: "thread-1",
        direction: index % 2 ? ("out" as const) : ("in" as const),
        fromEmail: "jane@example.com",
        toEmail: "leads@inbox.example.com",
        subject: "Kitchen",
        textBody: `Message ${index}`,
        attachments: [],
        bodyFetchedAt: new Date(),
        bodyAttempts: 0,
        occurredAt: new Date(Date.now() - (count - index) * 60_000),
        createdAt: new Date(),
      }))
    )
  }

  it("keeps the summary with the message count it was made at", async () => {
    await threadWith(4)
    expect(await summariseCrmThread(workspaceId, "thread-1", "user-1", db)).toBe("They want a kitchen quote. It is waiting on us.")
    const [row] = await db.select().from(customShellCrmThreads).where(eq(customShellCrmThreads.id, "thread-1"))
    expect(row).toMatchObject({ summary: "They want a kitchen quote. It is waiting on us.", summaryMessageCount: 4 })
    // Told not to invent a price, a date or a promise.
    expect(prompts[0]).toContain("Never state a price, a date")
  })

  it("refuses a conversation short enough to read, without asking the AI", async () => {
    await threadWith(3)
    await expect(summariseCrmThread(workspaceId, "thread-1", "user-1", db)).rejects.toThrow(CRM_TOO_SHORT_TO_SUMMARISE)
    expect(prompts).toEqual([])
  })

  it("says so when no AI key is saved", async () => {
    keyed = false
    await threadWith(5)
    await expect(summariseCrmThread(workspaceId, "thread-1", "user-1", db)).rejects.toThrow(CRM_NO_AI_KEY)
  })
})
