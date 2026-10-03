import { beforeEach, describe, expect, it } from "vitest"

import {
  countInboxThreads,
  getThread,
  listInboxThreads,
  listThreadMessages,
  markThreadRead,
  markThreadUnread,
  setThreadStatus,
} from "@/server/crm/inbox"
import { getLead, updateLead } from "@/server/crm/leads"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Every read the screen makes, run against a real database.
 *
 * This file exists because of one afternoon: the lead panel failed to load in
 * the browser, with nothing in the console, because an `ORDER BY` was built as
 * `due_at nulls last asc` instead of `due_at asc nulls last`. Type checks pass
 * on that, unit tests of the helpers around it pass on that, and only running
 * the query finds it. So every query the screen calls is run here, even where
 * the assertion is little more than "it came back".
 */
describe("the reads the CRM screen makes", () => {
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

    await db.insert(customShellCrmLeads).values([
      {
        id: "lead-1",
        workspaceId,
        email: "jane@buyer.com",
        name: "Jane Okafor",
        company: "Field & Oak",
        stage: "quoted",
        valueCents: 480000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "lead-2",
        workspaceId,
        email: "bob@other.com",
        name: null,
        stage: "new",
        valueCents: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "lead-elsewhere",
        workspaceId: otherWorkspaceId,
        email: "nosy@elsewhere.com",
        stage: "new",
        valueCents: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    await db.insert(customShellCrmThreads).values([
      {
        id: "thread-1",
        workspaceId,
        leadId: "lead-1",
        subject: "Kitchen quote",
        subjectKey: "kitchen quote",
        status: "open",
        lastMessageAt: new Date("2026-10-01T10:00:00.000Z"),
        lastDirection: "in",
        messageCount: 2,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "thread-2",
        workspaceId,
        leadId: "lead-2",
        subject: "Do you do flats",
        subjectKey: "do you do flats",
        status: "closed",
        lastMessageAt: new Date("2026-09-01T10:00:00.000Z"),
        lastDirection: "out",
        messageCount: 1,
        readAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "thread-elsewhere",
        workspaceId: otherWorkspaceId,
        leadId: "lead-elsewhere",
        subject: "Kitchen quote",
        subjectKey: "kitchen quote",
        status: "open",
        lastMessageAt: new Date("2026-10-02T10:00:00.000Z"),
        lastDirection: "in",
        messageCount: 1,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    await db.insert(customShellCrmMessages).values([
      {
        id: "message-1",
        workspaceId,
        threadId: "thread-1",
        direction: "in",
        fromEmail: "jane@buyer.com",
        fromName: "Jane Okafor",
        toEmail: "leads@example.com",
        subject: "Kitchen quote",
        textBody: "Could you quote a kitchen for the new shop?",
        attachments: [],
        bodyFetchedAt: new Date(),
        occurredAt: new Date("2026-09-30T10:00:00.000Z"),
        createdAt: new Date(),
      },
      {
        id: "message-2",
        workspaceId,
        threadId: "thread-1",
        direction: "out",
        fromEmail: "leads@example.com",
        toEmail: "jane@buyer.com",
        subject: "Re: Kitchen quote",
        textBody: "About $4,800 all in.",
        attachments: [],
        bodyFetchedAt: new Date(),
        occurredAt: new Date("2026-10-01T10:00:00.000Z"),
        createdAt: new Date(),
      },
    ])
  })

  describe("the inbox list", () => {
    it("answers this workspace's conversations, newest first", async () => {
      const threads = await listInboxThreads(workspaceId, {}, db)
      expect(threads.map((row) => row.id)).toEqual(["thread-1", "thread-2"])
      expect(threads[0].leadName).toBe("Jane Okafor")
      expect(threads[0].snippet).toBe("About $4,800 all in.")
    })

    it("never answers another workspace's", async () => {
      const threads = await listInboxThreads(workspaceId, {}, db)
      expect(threads.map((row) => row.id)).not.toContain("thread-elsewhere")
    })

    it("narrows by status", async () => {
      const open = await listInboxThreads(workspaceId, { status: "open" }, db)
      expect(open.map((row) => row.id)).toEqual(["thread-1"])
    })

    it("narrows by stage", async () => {
      const quoted = await listInboxThreads(workspaceId, { stage: "quoted" }, db)
      expect(quoted.map((row) => row.id)).toEqual(["thread-1"])
    })

    it("narrows to the unread", async () => {
      const unread = await listInboxThreads(
        workspaceId,
        { unreadOnly: true },
        db
      )
      expect(unread.map((row) => row.id)).toEqual(["thread-1"])
    })

    it("narrows to the ones to follow up", async () => {
      await updateLead(
        workspaceId,
        "lead-1",
        { followUpAt: new Date(Date.now() - 60_000) },
        db
      )
      const due = await listInboxThreads(workspaceId, { followUpDue: true }, db)
      expect(due.map((row) => row.id)).toEqual(["thread-1"])
    })

    it("searches the subject, the person and the words in the mail", async () => {
      const bySubject = await listInboxThreads(
        workspaceId,
        { search: "kitchen" },
        db
      )
      expect(bySubject.map((row) => row.id)).toEqual(["thread-1"])

      const byCompany = await listInboxThreads(
        workspaceId,
        { search: "field" },
        db
      )
      expect(byCompany.map((row) => row.id)).toEqual(["thread-1"])

      const byBody = await listInboxThreads(workspaceId, { search: "4,800" }, db)
      expect(byBody.map((row) => row.id)).toEqual(["thread-1"])

      const byNobody = await listInboxThreads(
        workspaceId,
        { search: "zzzz" },
        db
      )
      expect(byNobody).toEqual([])
    })
  })

  describe("the two tab counts", () => {
    it("counts everything and the unread part of it", async () => {
      expect(await countInboxThreads(workspaceId, {}, db)).toEqual({
        all: 2,
        unread: 1,
      })
    })

    /**
     * The one this describe block exists for. Pressing Unread used to drop the
     * All tab from 6 to 2, because All was counting whatever the list was
     * showing. A tab's own number must not move when you press it.
     */
    it("does not change when the unread filter goes on", async () => {
      const off = await countInboxThreads(workspaceId, {}, db)
      const on = await countInboxThreads(workspaceId, { unreadOnly: true }, db)
      expect(on).toEqual(off)
    })

    it("still obeys every other filter", async () => {
      const open = await countInboxThreads(workspaceId, { status: "open" }, db)
      expect(open).toEqual({ all: 1, unread: 1 })

      const searched = await countInboxThreads(
        workspaceId,
        { search: "flats" },
        db
      )
      expect(searched).toEqual({ all: 1, unread: 0 })
    })

    it("never counts another workspace's", async () => {
      const counts = await countInboxThreads(otherWorkspaceId, {}, db)
      expect(counts).toEqual({ all: 1, unread: 1 })
    })

    it("answers zero rather than nothing when none match", async () => {
      expect(await countInboxThreads(workspaceId, { search: "zzzz" }, db)).toEqual(
        { all: 0, unread: 0 }
      )
    })
  })

  describe("one conversation", () => {
    it("answers the thread and its mail oldest first", async () => {
      const thread = await getThread(workspaceId, "thread-1", db)
      expect(thread?.subject).toBe("Kitchen quote")

      const messages = await listThreadMessages(workspaceId, "thread-1", db)
      expect(messages.map((row) => row.id)).toEqual(["message-1", "message-2"])
    })

    it("refuses an id from another workspace", async () => {
      expect(await getThread(workspaceId, "thread-elsewhere", db)).toBeNull()
      expect(
        await listThreadMessages(workspaceId, "thread-elsewhere", db)
      ).toEqual([])
    })

    it("marks read, and back to unread again", async () => {
      expect(await markThreadRead(workspaceId, "thread-1", db)).toBe(true)
      expect((await countInboxThreads(workspaceId, {}, db)).unread).toBe(0)

      expect(await markThreadUnread(workspaceId, "thread-1", db)).toBe(true)
      expect((await countInboxThreads(workspaceId, {}, db)).unread).toBe(1)
    })

    it("opens, snoozes and closes", async () => {
      const until = new Date(Date.now() + 86_400_000)
      expect(
        await setThreadStatus(workspaceId, "thread-1", "snoozed", until, db)
      ).toBe(true)
      const snoozed = await getThread(workspaceId, "thread-1", db)
      expect(snoozed?.status).toBe("snoozed")
      expect(snoozed?.snoozedUntil).not.toBeNull()

      await setThreadStatus(workspaceId, "thread-1", "open", null, db)
      const open = await getThread(workspaceId, "thread-1", db)
      expect(open?.status).toBe("open")
      // Reopening clears the date rather than leaving one nothing reads.
      expect(open?.snoozedUntil).toBeNull()
    })
  })

  describe("the lead panel", () => {
    it("answers the lead", async () => {
      const lead = await getLead(workspaceId, "lead-1", db)
      expect(lead?.email).toBe("jane@buyer.com")
      expect(lead?.valueCents).toBe(480000)
    })

    it("refuses a lead from another workspace", async () => {
      expect(await getLead(workspaceId, "lead-elsewhere", db)).toBeNull()
    })
  })
})
