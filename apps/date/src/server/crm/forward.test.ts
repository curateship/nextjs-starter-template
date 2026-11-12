import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addInboundAddress } from "@/server/crm/addresses"
import { CRM_FORWARD_BAD_ADDRESS, forwardCrmThread, forwardText, listThreadForwards } from "@/server/crm/forward"
import { type CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests, type SendEmailParams } from "@/server/email/provider"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Forward a conversation (CRM task 20), against a real database and a stand-in provider. */
describe("forwarding a conversation", () => {
  let db: CustomShellDb
  let sent: SendEmailParams[]
  let refuse: boolean
  const workspaceId = "ws-crm"

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
    await db.insert(customShellCrmLeads).values({ id: "lead-1", workspaceId, email: "jane@example.com", stage: "new", createdAt: new Date(), updatedAt: new Date() })
    await db.insert(customShellCrmThreads).values({
      id: "thread-1",
      workspaceId,
      leadId: "lead-1",
      subject: "Kitchen quote",
      subjectKey: "kitchen quote",
      status: "open",
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const message = (id: string, direction: "in" | "out", text: string | null, rfc: string) => ({
      id,
      workspaceId,
      threadId: "thread-1",
      direction,
      fromEmail: direction === "in" ? "jane@example.com" : "sales@inbox.example.com",
      toEmail: direction === "in" ? "sales@inbox.example.com" : "jane@example.com",
      subject: "Kitchen quote",
      textBody: text,
      htmlBody: null,
      rfcMessageId: rfc,
      attachments: id === "m-1" ? [{ id: "a", filename: "plan.pdf", contentType: null, size: null }] : [],
      bodyFetchedAt: new Date(),
      bodyAttempts: 0,
      occurredAt: new Date(Date.now() - (id === "m-1" ? 120_000 : 60_000)),
      createdAt: new Date(),
    })
    await db.insert(customShellCrmMessages).values([
      message("m-1", "in", "Can you quote for the kitchen?", "one@example.com"),
      message("m-2", "out", null, "two@example.com"),
    ])
    sent = []
    refuse = false
    setEmailProviderFactoryForTests(() => ({
      send: async (params) => {
        sent.push(params)
        return refuse ? { success: false, error: "Refused" } : { success: true, messageId: "re_1" }
      },
    }))
  })

  afterEach(() => setEmailProviderFactoryForTests(null))

  it("sends the note and the whole conversation, with nothing to thread on", async () => {
    const result = await forwardCrmThread(workspaceId, "thread-1", { to: "Builder@Example.com", note: "Can you price this?" }, null, db)
    expect(result.sent).toBe(true)
    const mail = sent[0]
    expect(mail?.to).toBe("builder@example.com")
    expect(mail?.subject).toBe("Fwd: Kitchen quote")
    expect(mail?.headers?.["In-Reply-To"]).toBeUndefined()
    expect(mail?.headers?.References).toBeUndefined()
    const id = mail?.headers?.["Message-ID"] ?? ""
    expect(id).not.toContain("one@example.com")
    expect(id).not.toContain("two@example.com")
    expect(mail?.text).toContain("Can you price this?")
    expect(mail?.text).toContain("Can you quote for the kitchen?")
    expect(mail?.text).toContain("Files: plan.pdf")
    // A message whose body never arrived is said so, not left out.
    expect(mail?.text).toContain("never arrived")
    expect((await listThreadForwards(workspaceId, "thread-1", db)).map((row) => row.toEmail)).toEqual(["builder@example.com"])
  })

  it("records nothing when the provider refuses", async () => {
    refuse = true
    expect(await forwardCrmThread(workspaceId, "thread-1", { to: "builder@example.com", note: "" }, null, db)).toEqual({ sent: false, error: "Refused" })
    expect(await listThreadForwards(workspaceId, "thread-1", db)).toEqual([])
  })

  it("refuses an address that is not one, and never forwards another workspace's conversation", async () => {
    await expect(forwardCrmThread(workspaceId, "thread-1", { to: "nope", note: "" }, null, db)).rejects.toThrow(CRM_FORWARD_BAD_ADDRESS)
    await expect(forwardCrmThread("ws-other", "thread-1", { to: "builder@example.com", note: "" }, null, db)).rejects.toThrow()
    expect(sent).toEqual([])
  })

  it("escapes nothing away from the text and reads an HTML-only message as text", () => {
    const text = forwardText("", "Hi", [
      { direction: "in", fromEmail: "a@b.com", fromName: "A", occurredAt: new Date(0), textBody: null, htmlBody: "<p>Hello <b>there</b></p>", attachments: [] },
    ])
    expect(text).toContain("Hello there")
    expect(text).not.toContain("<b>")
  })
})
