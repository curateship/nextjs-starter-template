import { createHmac } from "node:crypto"

import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { encryptSecret } from "@/server/auth/encryption"
import {
  fillMessageBody,
  parseInboundEvent,
  pendingBodyMessages,
  recordInboundEmail,
  type ResendInboundEvent,
} from "@/server/crm/inbound"
import { type CustomShellDb } from "@/server/db"
import { handleResendWebhook } from "@/server/email/resend-webhook"
import {
  setEmailProviderFactoryForTests,
  type ReceiveEmailResult,
} from "@/server/email/provider"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellEmailSettings,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const SECRET = `whsec_${Buffer.from("resend-signing-secret").toString("base64")}`

function headersFor(body: string) {
  const id = "msg_inbound_1"
  const ts = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64")
  const signature = createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64")
  return { id, timestamp: ts, signature: `v1,${signature}` }
}

function inboundEvent(
  overrides: Partial<NonNullable<ResendInboundEvent["data"]>> = {}
): ResendInboundEvent {
  return {
    type: "email.received",
    created_at: "2026-10-02T09:00:00.000Z",
    data: {
      email_id: "re_in_1",
      from: "Jane Smith <Jane@Buyer.com>",
      to: ["leads@inbox.example.com"],
      received_for: "leads@inbox.example.com",
      subject: "Can you quote a kitchen",
      message_id: "<first@buyer.com>",
      ...overrides,
    },
  }
}

describe("inbound mail", () => {
  let db: CustomShellDb
  const workspaceId = "ws-crm"

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-encryption-key"
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const user = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: user.id,
      name: "Test",
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellEmailSettings).values({
      workspaceId,
      resendApiKeyEncrypted: encryptSecret("re_test_key"),
      resendWebhookSecretEncrypted: encryptSecret(SECRET),
      inboundAddress: "leads@inbox.example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterEach(() => {
    setEmailProviderFactoryForTests(null)
  })

  function stubReceive(result: ReceiveEmailResult) {
    setEmailProviderFactoryForTests(() => ({
      async send() {
        return { success: true, messageId: "sent" }
      },
      async receive() {
        return result
      },
    }))
  }

  it("writes a lead, a conversation and a message", async () => {
    const result = await recordInboundEmail(workspaceId, inboundEvent(), db)
    expect(result.changed).toBe(1)

    const [lead] = await db.select().from(customShellCrmLeads)
    expect(lead.email).toBe("jane@buyer.com")
    expect(lead.name).toBe("Jane Smith")
    expect(lead.stage).toBe("new")
    expect(lead.source).toBe("Email")

    const [thread] = await db.select().from(customShellCrmThreads)
    expect(thread.subject).toBe("Can you quote a kitchen")
    expect(thread.subjectKey).toBe("can you quote a kitchen")
    expect(thread.messageCount).toBe(1)
    expect(thread.readAt).toBeNull()
    expect(thread.lastDirection).toBe("in")

    const [message] = await db.select().from(customShellCrmMessages)
    expect(message.direction).toBe("in")
    expect(message.fromEmail).toBe("jane@buyer.com")
    expect(message.toEmail).toBe("leads@inbox.example.com")
    expect(message.rfcMessageId).toBe("first@buyer.com")
    expect(message.bodyFetchedAt).toBeNull()
  })

  it("never adds the sender to the newsletter list", async () => {
    await recordInboundEmail(workspaceId, inboundEvent(), db)
    const contacts = await db.select().from(customShellContacts)
    expect(contacts).toHaveLength(0)
  })

  it("links a contact that already exists on the address", async () => {
    await db.insert(customShellContacts).values({
      id: "contact-jane",
      workspaceId,
      email: "JANE@buyer.com",
      status: "subscribed",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await recordInboundEmail(workspaceId, inboundEvent(), db)
    const [lead] = await db.select().from(customShellCrmLeads)
    expect(lead.contactId).toBe("contact-jane")
  })

  it("writes one message when the same event arrives twice", async () => {
    const event = inboundEvent()
    expect((await recordInboundEmail(workspaceId, event, db)).changed).toBe(1)
    expect((await recordInboundEmail(workspaceId, event, db)).changed).toBe(0)

    const messages = await db.select().from(customShellCrmMessages)
    expect(messages).toHaveLength(1)
    const threads = await db.select().from(customShellCrmThreads)
    expect(threads).toHaveLength(1)
  })

  it("puts a reply in the same conversation and makes it unread again", async () => {
    await recordInboundEmail(workspaceId, inboundEvent(), db)
    await db
      .update(customShellCrmThreads)
      .set({ readAt: new Date() })
      .where(eq(customShellCrmThreads.workspaceId, workspaceId))

    await recordInboundEmail(
      workspaceId,
      inboundEvent({
        email_id: "re_in_2",
        subject: "Re: Can you quote a kitchen",
        message_id: "<second@buyer.com>",
      }),
      db
    )

    const threads = await db.select().from(customShellCrmThreads)
    expect(threads).toHaveLength(1)
    expect(threads[0].messageCount).toBe(2)
    expect(threads[0].readAt).toBeNull()
    // The subject on screen stays the one the first mail arrived with.
    expect(threads[0].subject).toBe("Can you quote a kitchen")
  })

  it("starts a second conversation for a different subject", async () => {
    await recordInboundEmail(workspaceId, inboundEvent(), db)
    await recordInboundEmail(
      workspaceId,
      inboundEvent({
        email_id: "re_in_2",
        subject: "A different job entirely",
        message_id: "<other@buyer.com>",
      }),
      db
    )

    const threads = await db.select().from(customShellCrmThreads)
    expect(threads).toHaveLength(2)
    const leads = await db.select().from(customShellCrmLeads)
    expect(leads).toHaveLength(1)
  })

  it("keeps two people writing the same subject apart", async () => {
    await recordInboundEmail(workspaceId, inboundEvent(), db)
    await recordInboundEmail(
      workspaceId,
      inboundEvent({
        email_id: "re_in_2",
        from: "bob@other.com",
        message_id: "<bob@other.com>",
      }),
      db
    )

    const threads = await db.select().from(customShellCrmThreads)
    expect(threads).toHaveLength(2)
    const leads = await db.select().from(customShellCrmLeads)
    expect(leads).toHaveLength(2)
  })

  it("refuses an event with nothing it can file the mail under", () => {
    expect(parseInboundEvent({ type: "email.delivered" })).toBeNull()
    expect(parseInboundEvent(inboundEvent({ email_id: "" }))).toBeNull()
    expect(parseInboundEvent(inboundEvent({ from: "" }))).toBeNull()
    expect(parseInboundEvent(inboundEvent({ from: "not-an-address" }))).toBeNull()
  })

  it("records the attachment names and admits it does not know the sizes", async () => {
    await recordInboundEmail(
      workspaceId,
      inboundEvent({
        attachments: [
          { id: "att_1", filename: "plan.pdf", content_type: "application/pdf" },
          { filename: "" },
        ],
      }),
      db
    )
    const [message] = await db.select().from(customShellCrmMessages)
    expect(message.attachments).toEqual([
      {
        id: "att_1",
        filename: "plan.pdf",
        contentType: "application/pdf",
        size: null,
      },
    ])
  })

  describe("fetching the body", () => {
    it("fills the text, the html and the header it replied to", async () => {
      stubReceive({
        success: true,
        email: {
          text: "Morning, what would a kitchen cost?",
          html: "<p>Morning</p>",
          messageId: "<first@buyer.com>",
          inReplyTo: null,
        },
      })
      const { messageId } = await recordInboundEmail(
        workspaceId,
        inboundEvent(),
        db
      )
      expect(await fillMessageBody(workspaceId, messageId!, db)).toBe(true)

      const [message] = await db.select().from(customShellCrmMessages)
      expect(message.textBody).toBe("Morning, what would a kitchen cost?")
      expect(message.htmlBody).toBe("<p>Morning</p>")
      expect(message.bodyFetchedAt).not.toBeNull()
      expect(message.bodyAttempts).toBe(1)
    })

    it("counts the attempt when the fetch fails and gives up after five", async () => {
      stubReceive({ success: false, error: "Resend is down" })
      const { messageId } = await recordInboundEmail(
        workspaceId,
        inboundEvent(),
        db
      )

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await fillMessageBody(workspaceId, messageId!, db)
      }

      const [message] = await db.select().from(customShellCrmMessages)
      expect(message.bodyFetchedAt).toBeNull()
      expect(message.bodyAttempts).toBe(5)
    })

    it("offers a body it never got to the retry once it is a minute old", async () => {
      stubReceive({ success: false, error: "Resend is down" })
      const { messageId } = await recordInboundEmail(
        workspaceId,
        inboundEvent(),
        db
      )

      // Written a moment ago, so the retry leaves it to the webhook's own go.
      expect(await pendingBodyMessages(25, db)).toEqual([])

      await db
        .update(customShellCrmMessages)
        .set({ createdAt: new Date(Date.now() - 5 * 60 * 1000) })
        .where(eq(customShellCrmMessages.id, messageId!))
      expect(await pendingBodyMessages(25, db)).toEqual([
        { id: messageId, workspaceId },
      ])
    })

    it("moves a renamed reply into the conversation its header points at", async () => {
      stubReceive({
        success: true,
        email: { text: "first", html: null, messageId: null, inReplyTo: null },
      })
      await recordInboundEmail(workspaceId, inboundEvent(), db)

      // The reply's subject was rewritten, so the subject rule puts it in a
      // thread of its own. The header is what knows better.
      const { messageId } = await recordInboundEmail(
        workspaceId,
        inboundEvent({
          email_id: "re_in_2",
          subject: "New plan for the kitchen",
          message_id: "<second@buyer.com>",
        }),
        db
      )
      expect(await db.select().from(customShellCrmThreads)).toHaveLength(2)

      stubReceive({
        success: true,
        email: {
          text: "actually, about that",
          html: null,
          messageId: "<second@buyer.com>",
          inReplyTo: "<first@buyer.com>",
        },
      })
      await fillMessageBody(workspaceId, messageId!, db)

      const threads = await db.select().from(customShellCrmThreads)
      expect(threads).toHaveLength(1)
      expect(threads[0].messageCount).toBe(2)

      const messages = await db
        .select()
        .from(customShellCrmMessages)
        .orderBy(asc(customShellCrmMessages.occurredAt))
      expect(messages).toHaveLength(2)
      expect(messages[0].threadId).toBe(messages[1].threadId)
    })

    it("leaves a conversation that holds other mail alone", async () => {
      stubReceive({
        success: true,
        email: { text: "x", html: null, messageId: null, inReplyTo: null },
      })
      await recordInboundEmail(workspaceId, inboundEvent(), db)
      // Two in the second thread, so it is a conversation somebody may have
      // read rather than a row made a moment ago.
      const second = await recordInboundEmail(
        workspaceId,
        inboundEvent({
          email_id: "re_in_2",
          subject: "Separate job",
          message_id: "<second@buyer.com>",
        }),
        db
      )
      await recordInboundEmail(
        workspaceId,
        inboundEvent({
          email_id: "re_in_3",
          subject: "Re: Separate job",
          message_id: "<third@buyer.com>",
        }),
        db
      )

      stubReceive({
        success: true,
        email: {
          text: "y",
          html: null,
          messageId: "<second@buyer.com>",
          inReplyTo: "<first@buyer.com>",
        },
      })
      await fillMessageBody(workspaceId, second.messageId!, db)

      expect(await db.select().from(customShellCrmThreads)).toHaveLength(2)
    })
  })

  it("refuses to fetch a body for another workspace's message", async () => {
    stubReceive({
      success: true,
      email: { text: "secret", html: null, messageId: null, inReplyTo: null },
    })
    const { messageId } = await recordInboundEmail(
      workspaceId,
      inboundEvent(),
      db
    )

    // An admin of some other workspace handing over this message's id. No body
    // comes back either way; what must not happen is the fetch running, which
    // would spend this workspace's email allowance, count an attempt against
    // this message, and let `mergeByHeaders` move it between conversations.
    expect(await fillMessageBody("ws-somebody-else", messageId!, db)).toBe(false)

    const [message] = await db.select().from(customShellCrmMessages)
    expect(message.bodyFetchedAt).toBeNull()
    expect(message.bodyAttempts).toBe(0)
  })

  it("records mail arriving through the signed webhook", async () => {
    stubReceive({
      success: true,
      email: { text: "hello", html: null, messageId: null, inReplyTo: null },
    })
    const body = JSON.stringify(inboundEvent())
    const result = await handleResendWebhook(body, headersFor(body), db)

    expect(result).toEqual({ outcome: "applied", changed: 1 })
    const [message] = await db.select().from(customShellCrmMessages)
    expect(message.textBody).toBe("hello")
  })
})
