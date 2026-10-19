import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { recordInboundEmail } from "@/server/crm/inbound"
import { sendCrmReply } from "@/server/crm/reply"
import { getCrmReplySender } from "@/server/crm/sender"
import { type CustomShellDb } from "@/server/db"
import {
  setEmailProviderFactoryForTests,
  type SendEmailParams,
  type SendEmailResult,
} from "@/server/email/provider"
import {
  saveCrmQuoteReplies,
  saveCrmReplyName,
  saveCrmReplySignature,
} from "@/server/email/settings"
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
  // Every message the stubbed provider was handed, in order.
  let sent: SendEmailParams[] = []
  const sentFrom = () => sent.map((message) => message.from)

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

    sent = []
    setEmailProviderFactoryForTests(() => ({
      async send(message): Promise<SendEmailResult> {
        sent.push(message)
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
    // The webhook writes the message with no body — it carries metadata only
    // — and a second request fills it in. Standing in for that here, because
    // by the time somebody types a reply the body has arrived.
    await db
      .update(customShellCrmMessages)
      .set({ textBody: "Can you quote a kitchen?", bodyFetchedAt: new Date() })
      .where(eq(customShellCrmMessages.direction, "in"))

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

      expect(result).toEqual({
        sent: true,
        messageId: expect.any(String),
        reopened: false,
      })
      expect(sentFrom()).toEqual([`Tyler <${INBOUND}>`])
    })

    it("is the app name and the address when no name is saved", async () => {
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)
      expect(sentFrom()).toEqual([`Acme Kitchens <${INBOUND}>`])
    })

    it("stays one sender when the name holds a comma or a quote mark", async () => {
      await saveCrmReplyName(workspaceId, 'Tyler, "Acme" Ltd.', db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      // One pair of angle brackets and no comma outside them, or a mail server
      // reads the header as two senders.
      expect(sentFrom()).toEqual([`Tyler Acme Ltd. <${INBOUND}>`])
    })

    it("never sends the word null or an empty pair of brackets", async () => {
      await saveCrmReplyName(workspaceId, '",;', db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      // Nothing usable was typed, so the app name steps in.
      expect(sentFrom()).toEqual([`Acme Kitchens <${INBOUND}>`])
      expect(sentFrom()[0]).not.toContain("null")
      expect(sentFrom()[0]).not.toContain("<>")
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

  describe("the signature under a sent reply", () => {
    // Quoting is on by default and would be in the text too. These tests are
    // about the signature alone, so they compare the whole message against an
    // exact string with nothing else in it.
    beforeEach(async () => {
      await saveCrmQuoteReplies(workspaceId, false, db)
    })

    it("goes out in both the html and the plain text part", async () => {
      await saveCrmReplySignature(workspaceId, "Tyler\n01234 567890", db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      expect(sent).toHaveLength(1)
      expect(sent[0].html).toContain("<hr")
      expect(sent[0].html).toContain("01234 567890")
      expect(sent[0].text).toBe("On its way.\n\n-- \nTyler\n01234 567890")
    })

    it("sends no rule and no text part when none is saved", async () => {
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      expect(sent[0].html).not.toContain("<hr")
      expect(sent[0].text).toBe("On its way.")
    })

    it("keeps the signature out of the conversation on screen", async () => {
      await saveCrmReplySignature(workspaceId, "Tyler\n01234 567890", db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "On its way.", db)

      const [message] = await db
        .select()
        .from(customShellCrmMessages)
        .where(eq(customShellCrmMessages.direction, "out"))
      // The screen draws `textBody`, so the phone number must not be in it.
      expect(message.textBody).toBe("On its way.")
      // What actually went out is still recorded.
      expect(message.htmlBody).toContain("01234 567890")
    })

    it("saves a signature of only blank lines as null", async () => {
      await saveCrmReplySignature(workspaceId, "Tyler", db)
      await saveCrmReplySignature(workspaceId, "  \n\n  ", db)
      const [row] = await db
        .select()
        .from(customShellEmailSettings)
        .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      expect(row.crmReplySignature).toBeNull()
    })
  })

  describe("the message a reply quotes", () => {
    it("carries their words under the reply, in both parts", async () => {
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "Tuesday works.", db)

      expect(sent[0].text).toContain("Tuesday works.")
      expect(sent[0].text).toMatch(/On .+, Jane Smith wrote:/)
      expect(sent[0].html).toContain("border-left")
    })

    it("sends nothing extra when the switch is off", async () => {
      await saveCrmQuoteReplies(workspaceId, false, db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "Tuesday works.", db)

      expect(sent[0].text).toBe("Tuesday works.")
      expect(sent[0].html).not.toContain("border-left")
      expect(sent[0].html).not.toContain("wrote:")
    })

    it("quotes nothing, and never the word null, when no body arrived", async () => {
      const thread = await openThread()
      // The webhook writes the message before the body is fetched, which is
      // the state every inbound mail passes through.
      await db
        .update(customShellCrmMessages)
        .set({ textBody: null, htmlBody: null })
        .where(eq(customShellCrmMessages.direction, "in"))

      await sendCrmReply(workspaceId, thread.id, "Tuesday works.", db)
      expect(sent[0].text).toBe("Tuesday works.")
      expect(sent[0].text).not.toContain("null")
      expect(sent[0].html).not.toContain("null")
      expect(sent[0].html).not.toContain("wrote:")
    })

    it("puts the signature above the quote, the way Gmail does", async () => {
      await saveCrmReplySignature(workspaceId, "Tyler", db)
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "Tuesday works.", db)

      const text = sent[0].text ?? ""
      expect(text.indexOf("-- ")).toBeGreaterThan(text.indexOf("Tuesday works."))
      expect(text.indexOf("wrote:")).toBeGreaterThan(text.indexOf("-- "))
    })

    it("keeps the quote out of the conversation on screen", async () => {
      const thread = await openThread()
      await sendCrmReply(workspaceId, thread.id, "Tuesday works.", db)

      const [outbound] = await db
        .select()
        .from(customShellCrmMessages)
        .where(eq(customShellCrmMessages.direction, "out"))
      // The screen draws `textBody`, so their message must not be in it.
      expect(outbound.textBody).toBe("Tuesday works.")
    })
  })

  describe("answering a conversation that was put away", () => {
    /** Reads back the one thread's status and snooze date. */
    async function threadNow(threadId: string) {
      const [row] = await db
        .select({
          status: customShellCrmThreads.status,
          snoozedUntil: customShellCrmThreads.snoozedUntil,
        })
        .from(customShellCrmThreads)
        .where(eq(customShellCrmThreads.id, threadId))
      return row
    }

    it("puts a closed conversation back in the inbox", async () => {
      const thread = await openThread()
      await db
        .update(customShellCrmThreads)
        .set({ status: "closed" })
        .where(eq(customShellCrmThreads.id, thread.id))

      const result = await sendCrmReply(workspaceId, thread.id, "One more thing.", db)
      expect(result).toMatchObject({ sent: true, reopened: true })
      expect((await threadNow(thread.id)).status).toBe("open")
    })

    it("clears the snooze date as well as the status", async () => {
      const thread = await openThread()
      await db
        .update(customShellCrmThreads)
        .set({ status: "snoozed", snoozedUntil: new Date("2027-01-01T09:00:00Z") })
        .where(eq(customShellCrmThreads.id, thread.id))

      await sendCrmReply(workspaceId, thread.id, "One more thing.", db)
      const now = await threadNow(thread.id)
      expect(now.status).toBe("open")
      // Left behind, the thread would fall asleep again on a date that no
      // longer means anything.
      expect(now.snoozedUntil).toBeNull()
    })

    it("changes nothing about a conversation that was already open", async () => {
      const thread = await openThread()
      const result = await sendCrmReply(workspaceId, thread.id, "On its way.", db)
      expect(result).toMatchObject({ sent: true, reopened: false })
      expect((await threadNow(thread.id)).status).toBe("open")
    })

    it("leaves a closed conversation closed when the send is refused", async () => {
      setEmailProviderFactoryForTests(() => ({
        async send(): Promise<SendEmailResult> {
          return { success: false, error: "Resend said no" }
        },
        async receive() {
          return { success: false, error: "not used" }
        },
      }))

      const thread = await openThread()
      await db
        .update(customShellCrmThreads)
        .set({ status: "closed" })
        .where(eq(customShellCrmThreads.id, thread.id))

      const result = await sendCrmReply(workspaceId, thread.id, "One more thing.", db)
      expect(result).toEqual({ sent: false, error: "Resend said no" })
      // Nothing is written when the provider refuses, status included.
      expect((await threadNow(thread.id)).status).toBe("closed")
      const messages = await db
        .select()
        .from(customShellCrmMessages)
        .where(eq(customShellCrmMessages.direction, "out"))
      expect(messages).toHaveLength(0)
    })
  })
})
