import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { recordInboundEmail } from "@/server/crm/inbound"
import { sendCrmReply } from "@/server/crm/reply"
import { getCrmReplySender } from "@/server/crm/sender"
import { type CustomShellDb } from "@/server/db"
import {
  setEmailProviderFactoryForTests,
  type SendEmailResult,
} from "@/server/email/provider"
import { saveCrmReplyName } from "@/server/email/settings"
import {
  customShellCrmMessages,
  customShellCrmThreads,
  customShellEmailSettings,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const INBOUND = "leads@inbox.example.com"

describe("who a CRM reply comes from", () => {
  let db: CustomShellDb
  const workspaceId = "ws-crm-sender"
  // Every From line the stubbed provider was handed, in order.
  let sentFrom: string[] = []

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const user = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: user.id,
      name: "Acme Kitchens",
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellEmailSettings).values({
      workspaceId,
      inboundAddress: INBOUND,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    sentFrom = []
    setEmailProviderFactoryForTests(() => ({
      async send(message): Promise<SendEmailResult> {
        sentFrom.push(message.from)
        return { success: true, messageId: "re_out_1" }
      },
      async receive() {
        return { success: false, error: "not used" }
      },
    }))
  })

  afterEach(() => {
    setEmailProviderFactoryForTests(null)
  })

  /** A conversation to answer, which is what `sendCrmReply` needs. */
  async function openThread() {
    await recordInboundEmail(
      workspaceId,
      {
        type: "email.received",
        created_at: "2026-10-03T09:00:00.000Z",
        data: {
          email_id: "re_in_1",
          from: "Jane Smith <jane@buyer.com>",
          to: [INBOUND],
          received_for: INBOUND,
          subject: "Can you quote a kitchen",
          message_id: "<first@buyer.com>",
        },
      },
      db
    )
    const [thread] = await db
      .select()
      .from(customShellCrmThreads)
      .where(eq(customShellCrmThreads.workspaceId, workspaceId))
    return thread
  }

  describe("saving the name", () => {
    it("saves what was typed, trimmed", async () => {
      await saveCrmReplyName(workspaceId, "  Tyler  ", db)
      const [row] = await db
        .select()
        .from(customShellEmailSettings)
        .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      expect(row.crmReplyName).toBe("Tyler")
    })

    it("saves a blank box as null rather than an empty string", async () => {
      await saveCrmReplyName(workspaceId, "Tyler", db)
      await saveCrmReplyName(workspaceId, "   ", db)
      const [row] = await db
        .select()
        .from(customShellEmailSettings)
        .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      expect(row.crmReplyName).toBeNull()
    })
  })

  describe("the sender it works out", () => {
    it("puts the saved name in front of the address", async () => {
      await saveCrmReplyName(workspaceId, "Tyler", db)
      expect(await getCrmReplySender(workspaceId, db)).toEqual({
        address: INBOUND,
        name: "Tyler",
        from: `Tyler <${INBOUND}>`,
      })
    })

    it("falls back to the app name when no name is saved", async () => {
      expect(await getCrmReplySender(workspaceId, db)).toEqual({
        address: INBOUND,
        name: "Acme Kitchens",
        from: `Acme Kitchens <${INBOUND}>`,
      })
    })

    it("answers nothing when the workspace has no inbound address", async () => {
      await db
        .update(customShellEmailSettings)
        .set({ inboundAddress: null })
        .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      expect(await getCrmReplySender(workspaceId, db)).toBeNull()
    })
  })

  describe("the From line the mail carries", () => {
    it("is the saved name and the inbound address", async () => {
      await saveCrmReplyName(workspaceId, "Tyler", db)
      const thread = await openThread()
      const result = await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      expect(result).toEqual({ sent: true, messageId: expect.any(String) })
      expect(sentFrom).toEqual([`Tyler <${INBOUND}>`])
    })

    it("is the app name and the address when no name is saved", async () => {
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)
      expect(sentFrom).toEqual([`Acme Kitchens <${INBOUND}>`])
    })

    it("stays one sender when the name holds a comma or a quote mark", async () => {
      await saveCrmReplyName(workspaceId, 'Tyler, "Acme" Ltd.', db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      // One pair of angle brackets and no comma outside them, or a mail server
      // reads the header as two senders.
      expect(sentFrom).toEqual([`Tyler Acme Ltd. <${INBOUND}>`])
    })

    it("never sends the word null or an empty pair of brackets", async () => {
      await saveCrmReplyName(workspaceId, '",;', db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      // Nothing usable was typed, so the app name steps in.
      expect(sentFrom).toEqual([`Acme Kitchens <${INBOUND}>`])
      expect(sentFrom[0]).not.toContain("null")
      expect(sentFrom[0]).not.toContain("<>")
    })

    it("writes down the name the customer saw beside the address", async () => {
      await saveCrmReplyName(workspaceId, "Tyler", db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      const [message] = await db
        .select()
        .from(customShellCrmMessages)
        .where(eq(customShellCrmMessages.direction, "out"))
      expect(message.fromEmail).toBe(INBOUND)
      expect(message.fromName).toBe("Tyler")
    })
  })
})
