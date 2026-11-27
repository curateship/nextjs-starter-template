import { beforeEach, describe, expect, it } from "vitest"

import { blockSender } from "@/server/crm/blocked"
import { recordInboundEmail, sendOwedMailNotice, type ResendInboundEvent } from "@/server/crm/inbound"
import { eq } from "drizzle-orm"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmMessages,
  customShellCrmThreads,
  customShellNotifications,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

function inboundEvent(from: string, subject = "Kitchen quote"): ResendInboundEvent {
  return {
    type: "email.received",
    created_at: "2026-11-07T09:00:00.000Z",
    data: {
      email_id: `re_${Math.random().toString(36).slice(2)}`,
      from,
      to: ["leads@inbox.example.com"],
      received_for: "leads@inbox.example.com",
      subject,
      message_id: `<${Math.random().toString(36).slice(2)}@example.com>`,
    },
  }
}

/** A notice when mail lands (CRM task 10), through the real inbound path. */
describe("the notice when mail lands", () => {
  let db: CustomShellDb
  let ownerId: string
  const workspaceId = "ws-crm"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    ownerId = owner.id
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: owner.id,
      name: workspaceId,
      settings: {},
      subdomain: `w-${workspaceId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  const notices = () => db.select().from(customShellNotifications)

  /**
   * Mail arriving the way the webhook takes it: written, then (with no body to
   * fetch here) the notice a new conversation owed is sent.
   */
  async function arrive(event: ResendInboundEvent) {
    const recorded = await recordInboundEmail(workspaceId, event, db)
    if (recorded.owedNotice) await sendOwedMailNotice(workspaceId, recorded.owedNotice, db)
    return recorded
  }

  it("tells the site's owner who wrote in and about what", async () => {
    await arrive(inboundEvent("Jane Doe <jane@example.com>"))
    const [notice] = await notices()
    expect(notice).toMatchObject({
      recipientUserId: ownerId,
      type: "crm_mail_arrived",
      message: "Jane Doe wrote in",
      detail: "Kitchen quote",
    })
    expect(notice?.crmThreadId).toBeTruthy()
  })

  it("rings once for a back-and-forth inside the hour", async () => {
    await arrive(inboundEvent("Jane Doe <jane@example.com>"))
    await arrive(inboundEvent("Jane Doe <jane@example.com>", "Re: Kitchen quote"))
    expect(await notices()).toHaveLength(1)
  })

  it("rings for each conversation", async () => {
    await arrive(inboundEvent("Jane Doe <jane@example.com>"))
    await arrive(inboundEvent("Bob <bob@example.com>"))
    expect(await notices()).toHaveLength(2)
  })

  it("stays quiet for a blocked sender", async () => {
    await blockSender(workspaceId, "@spamhouse.com", "a spam run", db)
    const recorded = await arrive(inboundEvent("Spam <deals@spamhouse.com>"))
    expect(recorded.changed).toBe(1)
    expect(await notices()).toEqual([])
  })

  /** Machines' mail rings no bell (CRM task 38, part 4). */
  it("stays quiet for a no-reply address", async () => {
    const recorded = await arrive(inboundEvent("Shop <noreply@shop.com>"))
    expect(recorded.changed).toBe(1)
    expect(await notices()).toEqual([])
  })

  it("owes a new conversation's notice until its headers are read, and drops it if they say robot", async () => {
    const recorded = await recordInboundEmail(workspaceId, inboundEvent("News <news@shop.com>"), db)
    expect(await notices()).toEqual([])
    expect(recorded.owedNotice).toBeTruthy()
    // As the body fetch does when it finds a List-Unsubscribe header.
    await db.update(customShellCrmThreads).set({ robot: true }).where(eq(customShellCrmThreads.id, await threadOf(recorded.messageId!)))
    await sendOwedMailNotice(workspaceId, recorded.owedNotice!, db)
    expect(await notices()).toEqual([])
  })

  it("rings for the older conversation when the body fetch moves a reply into it", async () => {
    const first = await arrive(inboundEvent("Jane Doe <jane@example.com>"))
    const parentId = await threadOf(first.messageId!)
    await db.delete(customShellNotifications)
    // A reply under a new subject starts its own conversation, then its
    // In-Reply-To header moves it into Jane's first one, and the new one goes.
    const reply = await recordInboundEmail(workspaceId, inboundEvent("Jane Doe <jane@example.com>", "New idea"), db)
    const startedId = await threadOf(reply.messageId!)
    await db.update(customShellCrmMessages).set({ threadId: parentId }).where(eq(customShellCrmMessages.id, reply.messageId!))
    await db.delete(customShellCrmThreads).where(eq(customShellCrmThreads.id, startedId))

    await sendOwedMailNotice(workspaceId, reply.owedNotice!, db)
    const [notice] = await notices()
    expect(notice?.crmThreadId).toBe(parentId)
  })

  async function threadOf(messageId: string) {
    const [row] = await db
      .select({ threadId: customShellCrmMessages.threadId })
      .from(customShellCrmMessages)
      .where(eq(customShellCrmMessages.id, messageId))
    return row!.threadId
  }
})
