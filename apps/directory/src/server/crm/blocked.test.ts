import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import {
  blockCandidates,
  blockSender,
  isSenderBlocked,
  listBlockedSenders,
  normalizeBlockPattern,
  unblockSender,
} from "@/server/crm/blocked"
import { recordInboundEmail, type ResendInboundEvent } from "@/server/crm/inbound"
import { countInboxThreads, listInboxThreads } from "@/server/crm/inbox"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

function inboundEvent(
  overrides: Partial<NonNullable<ResendInboundEvent["data"]>> = {}
): ResendInboundEvent {
  return {
    type: "email.received",
    created_at: "2026-10-05T09:00:00.000Z",
    data: {
      email_id: `re_${Math.random().toString(36).slice(2)}`,
      from: "Spam Robot <deals@spamhouse.com>",
      to: ["leads@inbox.example.com"],
      received_for: "leads@inbox.example.com",
      subject: "Act now",
      message_id: `<${Math.random().toString(36).slice(2)}@spamhouse.com>`,
      ...overrides,
    },
  }
}

describe("the blocked list", () => {
  let db: CustomShellDb
  const workspaceId = "ws-crm"
  const otherWorkspaceId = "ws-other"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    for (const id of [workspaceId, otherWorkspaceId]) {
      await db.insert(customShellWorkspaces).values({
        id,
        userId: owner.id,
        name: id,
        settings: {},
        subdomain: `w-${id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })

  describe("what counts as a pattern", () => {
    it("takes a full address and a domain with an at sign", () => {
      expect(normalizeBlockPattern("spam@example.com")).toBe("spam@example.com")
      expect(normalizeBlockPattern("@example.com")).toBe("@example.com")
    })

    it("lowers and trims whatever was typed", () => {
      expect(normalizeBlockPattern("  Spam@Example.COM ")).toBe(
        "spam@example.com"
      )
      expect(normalizeBlockPattern("@Example.com")).toBe("@example.com")
    })

    it("reads a bare domain as the domain", () => {
      expect(normalizeBlockPattern("example.com")).toBe("@example.com")
    })

    it("refuses what is neither", () => {
      expect(normalizeBlockPattern("")).toBeNull()
      expect(normalizeBlockPattern("nonsense")).toBeNull()
      expect(normalizeBlockPattern("@")).toBeNull()
      expect(normalizeBlockPattern("@localhost")).toBeNull()
      expect(normalizeBlockPattern("a@b.com, c@d.com")).toBeNull()
      expect(normalizeBlockPattern("two words@example.com")).toBeNull()
      expect(normalizeBlockPattern(`${"a".repeat(260)}@example.com`)).toBeNull()
    })
  })

  /**
   * The pure half of the match: which two patterns could block one sender.
   * No database, so the branches the lookup can never reach are covered here.
   */
  describe("what could block one sender", () => {
    it("is the address and its domain", () => {
      expect(blockCandidates("Anyone@Example.com")).toEqual([
        "anyone@example.com",
        "@example.com",
      ])
    })

    it("is only the address when there is no domain to take", () => {
      expect(blockCandidates("nonsense")).toEqual(["nonsense"])
      expect(blockCandidates("trailing@")).toEqual(["trailing@"])
      expect(blockCandidates("@example.com")).toEqual(["@example.com"])
    })

    it("is nothing at all for an empty address", () => {
      expect(blockCandidates("   ")).toEqual([])
    })
  })

  describe("the match", () => {
    it("matches nothing when the list is empty", async () => {
      expect(
        await isSenderBlocked(workspaceId, "anyone@example.com", db)
      ).toBe(false)
    })

    it("matches an exact address, whatever the capitals", async () => {
      await blockSender(workspaceId, "Spam@Example.com", null, db)
      expect(await isSenderBlocked(workspaceId, "spam@example.com", db)).toBe(
        true
      )
      expect(await isSenderBlocked(workspaceId, "SPAM@EXAMPLE.COM", db)).toBe(
        true
      )
    })

    /** The one this is shaped around: never block somebody nobody aimed at. */
    it("does not match an address that merely contains the pattern", async () => {
      await blockSender(workspaceId, "jane@buyer.com", null, db)
      expect(
        await isSenderBlocked(workspaceId, "notjane@buyer.com", db)
      ).toBe(false)
      expect(
        await isSenderBlocked(workspaceId, "jane@buyer.com.co", db)
      ).toBe(false)
    })

    it("matches a whole domain and not one that merely ends with it", async () => {
      await blockSender(workspaceId, "@example.com", null, db)
      expect(
        await isSenderBlocked(workspaceId, "anyone@example.com", db)
      ).toBe(true)
      expect(
        await isSenderBlocked(workspaceId, "me@notexample.com", db)
      ).toBe(false)
    })

    it("leaves a subdomain of a blocked domain alone", async () => {
      await blockSender(workspaceId, "@example.com", null, db)
      expect(
        await isSenderBlocked(workspaceId, "sales@mail.example.com", db)
      ).toBe(false)
    })

    it("never reads another workspace's list", async () => {
      await blockSender(otherWorkspaceId, "@example.com", null, db)
      expect(
        await isSenderBlocked(workspaceId, "anyone@example.com", db)
      ).toBe(false)
    })
  })

  describe("keeping the list", () => {
    it("blocks once and says the second press added nothing", async () => {
      expect(await blockSender(workspaceId, "spam@example.com", "junk", db))
        .toEqual({ blocked: true, pattern: "spam@example.com", added: true })
      expect(await blockSender(workspaceId, "SPAM@example.com", null, db))
        .toEqual({ blocked: true, pattern: "spam@example.com", added: false })

      const list = await listBlockedSenders(workspaceId, db)
      expect(list).toHaveLength(1)
      expect(list[0].note).toBe("junk")
    })

    it("refuses a pattern that is neither an address nor a domain", async () => {
      expect(await blockSender(workspaceId, "nonsense", null, db)).toEqual({
        blocked: false,
      })
      expect(await listBlockedSenders(workspaceId, db)).toEqual([])
    })

    it("unblocks by id and lets the next mail through", async () => {
      await blockSender(workspaceId, "@example.com", null, db)
      const [row] = await listBlockedSenders(workspaceId, db)

      expect(await unblockSender(workspaceId, row.id, db)).toBe(true)
      expect(
        await isSenderBlocked(workspaceId, "anyone@example.com", db)
      ).toBe(false)
      expect(await listBlockedSenders(workspaceId, db)).toEqual([])
    })

    it("never unblocks another workspace's row", async () => {
      await blockSender(otherWorkspaceId, "@example.com", null, db)
      const [row] = await listBlockedSenders(otherWorkspaceId, db)

      expect(await unblockSender(workspaceId, row.id, db)).toBe(false)
      expect(await listBlockedSenders(otherWorkspaceId, db)).toHaveLength(1)
    })
  })

  describe("mail from a blocked sender", () => {
    beforeEach(async () => {
      await blockSender(workspaceId, "@spamhouse.com", "a spam run", db)
    })

    it("is still written, out of the default inbox", async () => {
      const recorded = await recordInboundEmail(workspaceId, inboundEvent(), db)
      expect(recorded.changed).toBe(1)

      // The message is there.
      const messages = await db
        .select({ id: customShellCrmMessages.id })
        .from(customShellCrmMessages)
        .where(eq(customShellCrmMessages.workspaceId, workspaceId))
      expect(messages).toHaveLength(1)

      // And the default inbox, which is the open conversations, is empty.
      const openInbox = await listInboxThreads(
        workspaceId,
        { status: "open" },
        db
      )
      expect(openInbox).toEqual([])

      // Found again by changing the status filter, which is the whole point of
      // keeping it rather than binning it.
      const everything = await listInboxThreads(
        workspaceId,
        { status: "all" },
        db
      )
      expect(everything).toHaveLength(1)
      expect(everything[0].status).toBe("closed")
    })

    it("does not count as unread", async () => {
      await recordInboundEmail(workspaceId, inboundEvent(), db)
      expect(await countInboxThreads(workspaceId, { status: "all" }, db))
        .toEqual({ all: 1, unread: 0 })
    })

    it("does not move the lead's stage", async () => {
      await recordInboundEmail(workspaceId, inboundEvent(), db)
      const [lead] = await db
        .select({
          stage: customShellCrmLeads.stage,
          followUpAt: customShellCrmLeads.followUpAt,
        })
        .from(customShellCrmLeads)
        .where(eq(customShellCrmLeads.workspaceId, workspaceId))
      expect(lead.stage).toBe("new")
      // Nothing to chase, so the follow-up job has nothing to say about it.
      expect(lead.followUpAt).toBeNull()
    })

    /**
     * The worst case this design exists for: somebody blocked after they had
     * already written in. Their next message must not raise the conversation
     * they had open.
     */
    it("closes a conversation that was open before the block", async () => {
      await db.insert(customShellCrmLeads).values({
        id: "lead-known",
        workspaceId,
        email: "deals@spamhouse.com",
        name: "Spam Robot",
        stage: "new",
        valueCents: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await db.insert(customShellCrmThreads).values({
        id: "thread-known",
        workspaceId,
        leadId: "lead-known",
        subject: "Act now",
        subjectKey: "act now",
        status: "open",
        lastMessageAt: new Date("2026-10-01T09:00:00.000Z"),
        lastDirection: "in",
        messageCount: 1,
        readAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await recordInboundEmail(workspaceId, inboundEvent(), db)

      const [thread] = await db
        .select({
          status: customShellCrmThreads.status,
          readAt: customShellCrmThreads.readAt,
          messageCount: customShellCrmThreads.messageCount,
        })
        .from(customShellCrmThreads)
        .where(eq(customShellCrmThreads.id, "thread-known"))
      expect(thread.status).toBe("closed")
      expect(thread.readAt).not.toBeNull()
      expect(thread.messageCount).toBe(2)
    })

    /**
     * Closing a thread anywhere else clears its snooze date, because a closed
     * thread holding a date nothing reads is a row that disagrees with itself.
     * Blocked mail closes a thread too, so it has to do the same.
     */
    it("clears the snooze date on a thread it closes", async () => {
      await db.insert(customShellCrmLeads).values({
        id: "lead-snoozed",
        workspaceId,
        email: "deals@spamhouse.com",
        stage: "new",
        valueCents: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await db.insert(customShellCrmThreads).values({
        id: "thread-snoozed",
        workspaceId,
        leadId: "lead-snoozed",
        subject: "Act now",
        subjectKey: "act now",
        status: "snoozed",
        snoozedUntil: new Date("2026-12-01T09:00:00.000Z"),
        lastMessageAt: new Date("2026-10-01T09:00:00.000Z"),
        lastDirection: "in",
        messageCount: 1,
        readAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await recordInboundEmail(workspaceId, inboundEvent(), db)

      const [thread] = await db
        .select({
          status: customShellCrmThreads.status,
          snoozedUntil: customShellCrmThreads.snoozedUntil,
        })
        .from(customShellCrmThreads)
        .where(eq(customShellCrmThreads.id, "thread-snoozed"))
      expect(thread.status).toBe("closed")
      expect(thread.snoozedUntil).toBeNull()
    })

    it("lets mail through again once the address is unblocked", async () => {
      const [row] = await listBlockedSenders(workspaceId, db)
      await unblockSender(workspaceId, row.id, db)

      await recordInboundEmail(workspaceId, inboundEvent(), db)
      const openInbox = await listInboxThreads(
        workspaceId,
        { status: "open" },
        db
      )
      expect(openInbox).toHaveLength(1)
      expect(openInbox[0].readAt).toBeNull()
    })

    it("leaves everybody else's mail alone", async () => {
      await recordInboundEmail(
        workspaceId,
        inboundEvent({ from: "Jane <jane@buyer.com>", subject: "A quote" }),
        db
      )
      const openInbox = await listInboxThreads(
        workspaceId,
        { status: "open" },
        db
      )
      expect(openInbox).toHaveLength(1)
      expect(openInbox[0].leadEmail).toBe("jane@buyer.com")
    })
  })
})
