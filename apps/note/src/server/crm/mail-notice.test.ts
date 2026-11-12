import { beforeEach, describe, expect, it } from "vitest"

import { blockSender } from "@/server/crm/blocked"
import { recordInboundEmail, type ResendInboundEvent } from "@/server/crm/inbound"
import { type CustomShellDb } from "@/server/db"
import { customShellNotifications, customShellWorkspaces } from "@/server/schema"
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

  it("tells the site's owner who wrote in and about what", async () => {
    await recordInboundEmail(workspaceId, inboundEvent("Jane Doe <jane@example.com>"), db)
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
    await recordInboundEmail(workspaceId, inboundEvent("Jane Doe <jane@example.com>"), db)
    await recordInboundEmail(workspaceId, inboundEvent("Jane Doe <jane@example.com>", "Re: Kitchen quote"), db)
    expect(await notices()).toHaveLength(1)
  })

  it("rings for each conversation", async () => {
    await recordInboundEmail(workspaceId, inboundEvent("Jane Doe <jane@example.com>"), db)
    await recordInboundEmail(workspaceId, inboundEvent("Bob <bob@example.com>"), db)
    expect(await notices()).toHaveLength(2)
  })

  it("stays quiet for a blocked sender", async () => {
    await blockSender(workspaceId, "@spamhouse.com", "a spam run", db)
    const recorded = await recordInboundEmail(workspaceId, inboundEvent("Spam <deals@spamhouse.com>"), db)
    expect(recorded.changed).toBe(1)
    expect(await notices()).toEqual([])
  })
})
