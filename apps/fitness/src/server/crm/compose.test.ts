import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addInboundAddress } from "@/server/crm/addresses"
import {
  CRM_COMPOSE_BAD_ADDRESS,
  HAND_ADDED_SOURCE,
  startCrmConversation,
} from "@/server/crm/compose"
import { type CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests, type SendEmailParams } from "@/server/email/provider"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Starting a conversation (CRM task 15), against a real database and a stand-in provider. */
describe("starting a conversation", () => {
  let db: CustomShellDb
  const workspaceId = "ws-crm"
  let sent: SendEmailParams[]
  let refuse: boolean

  beforeEach(async () => {
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
    await addInboundAddress(workspaceId, { address: "sales@inbox.example.com" }, db)
    await addInboundAddress(workspaceId, { address: "support@inbox.example.com" }, db)
    sent = []
    refuse = false
    setEmailProviderFactoryForTests(() => ({
      send: async (params) => {
        sent.push(params)
        return refuse ? { success: false, error: "Refused" } : { success: true, messageId: `re_${sent.length}` }
      },
    }))
  })

  afterEach(() => setEmailProviderFactoryForTests(null))

  it("writes a hand-added lead, an open conversation and the first message, with its own Message-ID", async () => {
    const result = await startCrmConversation(
      workspaceId,
      { to: " Plumber@Example.com ", name: "Sam", subject: "The boiler", body: "Can you quote?" },
      db
    )
    expect(result).toMatchObject({ sent: true, leadExisted: false })
    if (!result.sent) throw new Error("not sent")

    const [lead] = await db.select().from(customShellCrmLeads).where(eq(customShellCrmLeads.id, result.leadId))
    expect(lead).toMatchObject({ email: "plumber@example.com", name: "Sam", source: HAND_ADDED_SOURCE, stage: "contacted" })

    const [thread] = await db.select().from(customShellCrmThreads).where(eq(customShellCrmThreads.id, result.threadId))
    expect(thread).toMatchObject({ status: "open", lastDirection: "out", messageCount: 1, toAddress: "sales@inbox.example.com" })
    expect(thread?.readAt).toBeInstanceOf(Date)

    const [message] = await db.select().from(customShellCrmMessages).where(eq(customShellCrmMessages.threadId, result.threadId))
    expect(message?.rfcMessageId).toMatch(/@inbox\.example\.com$/)
    expect(sent[0]?.headers?.["Message-ID"]).toBe(`<${message?.rfcMessageId}>`)
    expect(sent[0]?.headers?.["In-Reply-To"]).toBeUndefined()

    // A lead is an address, not a contact: nothing joins the newsletter list.
    expect(await db.select().from(customShellContacts)).toEqual([])
  })

  it("joins the lead an address already has, capitals aside", async () => {
    const first = await startCrmConversation(workspaceId, { to: "jane@example.com", subject: "One", body: "Hi" }, db)
    const second = await startCrmConversation(workspaceId, { to: "JANE@example.com", subject: "Two", body: "Hi again" }, db)
    if (!first.sent || !second.sent) throw new Error("not sent")
    expect(second.leadExisted).toBe(true)
    expect(second.leadId).toBe(first.leadId)
    expect(await db.select().from(customShellCrmLeads)).toHaveLength(1)
  })

  it("goes out from the address picked, while it is on the list", async () => {
    const result = await startCrmConversation(
      workspaceId,
      { to: "jane@example.com", subject: "Hello", body: "Hi", fromAddress: "support@inbox.example.com" },
      db
    )
    if (!result.sent) throw new Error("not sent")
    expect(sent[0]?.from).toContain("support@inbox.example.com")
  })

  it("writes nothing at all when the provider refuses", async () => {
    refuse = true
    expect(await startCrmConversation(workspaceId, { to: "jane@example.com", subject: "Hello", body: "Hi" }, db)).toEqual({
      sent: false,
      error: "Refused",
    })
    expect(await db.select().from(customShellCrmLeads)).toEqual([])
    expect(await db.select().from(customShellCrmThreads)).toEqual([])
  })

  it("refuses something that is not an address before sending anything", async () => {
    await expect(
      startCrmConversation(workspaceId, { to: "not an address", subject: "Hello", body: "Hi" }, db)
    ).rejects.toThrow(CRM_COMPOSE_BAD_ADDRESS)
    expect(sent).toEqual([])
  })
})
