import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

const sending = vi.hoisted(() => ({
  sendCrmReply: vi.fn(async () => ({ sent: true as const, messageId: "m-1", reopened: false })),
}))
vi.mock("@/server/crm/reply", () => sending)

import {
  cancelScheduledReply,
  changeScheduledReply,
  CRM_SCHEDULE_BAD_TIME,
  listScheduledReplies,
  scheduleReply,
  sendDueScheduledReplies,
} from "@/server/crm/scheduled-replies"
import { saveReplyDraft, listReplyDrafts } from "@/server/crm/reply-drafts"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmScheduledReplies,
  customShellCrmThreads,
  customShellNotifications,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Replies written now and sent later (CRM task 38, part 6). */
describe("scheduled replies", () => {
  let db: CustomShellDb
  let me: string
  const workspaceId = "ws-later"
  const later = () => new Date(Date.now() + 3_600_000)
  const files = { urls: ["https://cdn/x/plan.png"], uploads: [{ key: "crm-files/ws-later/replies/a/q.pdf", name: "q.pdf" }] }

  async function due(id: string) {
    await db
      .update(customShellCrmScheduledReplies)
      .set({ sendAt: new Date(Date.now() - 1000) })
      .where(eq(customShellCrmScheduledReplies.id, id))
  }

  beforeEach(async () => {
    sending.sendCrmReply.mockReset().mockResolvedValue({ sent: true, messageId: "m-1", reopened: false })
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    me = (await insertUser(db, { email: "me@example.com" })).id
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: me,
      name: "Later",
      settings: {},
      subdomain: "w-later",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmLeads).values({
      id: "lead-1",
      workspaceId,
      email: "jane@buyer.com",
      name: "Jane Okafor",
      stage: "new",
      valueCents: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmThreads).values({
      id: "thread-1",
      workspaceId,
      leadId: "lead-1",
      subject: "Kitchen",
      subjectKey: "kitchen",
      status: "open",
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it("keeps the reply for later and lets the box's draft go", async () => {
    await saveReplyDraft(workspaceId, me, "thread-1", "Hi Jane", db)
    await scheduleReply(workspaceId, me, "thread-1", { body: "Hi Jane", files, sendAt: later() }, db)
    const [reply] = await listScheduledReplies(workspaceId, "thread-1", db)
    expect(reply).toMatchObject({ body: "Hi Jane", files, state: "waiting" })
    expect(await listReplyDrafts(workspaceId, me, db)).toEqual({})
  })

  it("refuses a time already gone, and a conversation from elsewhere", async () => {
    await expect(
      scheduleReply(workspaceId, me, "thread-1", { body: "Hi", files, sendAt: new Date(Date.now() - 1) }, db)
    ).rejects.toThrow(CRM_SCHEDULE_BAD_TIME)
    await expect(
      scheduleReply("ws-elsewhere", me, "thread-1", { body: "Hi", files, sendAt: later() }, db)
    ).rejects.toThrow("CRM_THREAD_NOT_FOUND")
  })

  it("sends a due one once, as a normal reply with its files, then forgets it", async () => {
    const id = await scheduleReply(workspaceId, me, "thread-1", { body: "Hi Jane", files, sendAt: later() }, db)
    expect(await sendDueScheduledReplies(db)).toBe(0)
    await due(id)

    // Two passes at once: only one of them may send it.
    const [first, second] = await Promise.all([sendDueScheduledReplies(db), sendDueScheduledReplies(db)])
    expect(first + second).toBe(1)
    expect(sending.sendCrmReply).toHaveBeenCalledOnce()
    expect(sending.sendCrmReply).toHaveBeenCalledWith(workspaceId, "thread-1", "Hi Jane", db, files.urls, files.uploads)
    expect(await listScheduledReplies(workspaceId, "thread-1", db)).toEqual([])
  })

  it("keeps a refused one, failed with the reason, and tells whoever scheduled it", async () => {
    sending.sendCrmReply.mockResolvedValueOnce({ sent: false, error: "Domain not verified" } as never)
    const id = await scheduleReply(workspaceId, me, "thread-1", { body: "Hi", files, sendAt: later() }, db)
    await due(id)
    expect(await sendDueScheduledReplies(db)).toBe(0)

    const [reply] = await listScheduledReplies(workspaceId, "thread-1", db)
    expect(reply).toMatchObject({ state: "failed", error: "Domain not verified" })
    const [notice] = await db.select().from(customShellNotifications)
    expect(notice).toMatchObject({
      recipientUserId: me,
      type: "crm_follow_up",
      message: "Your reply to Jane Okafor did not go out",
      detail: "Domain not verified",
      crmThreadId: "thread-1",
    })

    // A new time makes it wait again.
    await changeScheduledReply(workspaceId, id, later(), db)
    expect((await listScheduledReplies(workspaceId, "thread-1", db))[0]).toMatchObject({ state: "waiting", error: null })
  })

  it("never sends to an address blocked since, and says why", async () => {
    const id = await scheduleReply(workspaceId, me, "thread-1", { body: "Hi", files, sendAt: later() }, db)
    await db.update(customShellCrmThreads).set({ status: "closed" }).where(eq(customShellCrmThreads.id, "thread-1"))
    await due(id)
    await sendDueScheduledReplies(db)
    expect(sending.sendCrmReply).not.toHaveBeenCalled()
    expect((await listScheduledReplies(workspaceId, "thread-1", db))[0]?.error).toContain("blocked")
  })

  it("cancels, handing back the words and files, and then nothing goes", async () => {
    const id = await scheduleReply(workspaceId, me, "thread-1", { body: "Hi Jane", files, sendAt: later() }, db)
    expect(await cancelScheduledReply(workspaceId, id, db)).toEqual({ threadId: "thread-1", body: "Hi Jane", files })
    await sendDueScheduledReplies(db)
    expect(sending.sendCrmReply).not.toHaveBeenCalled()
    await expect(cancelScheduledReply(workspaceId, id, db)).rejects.toThrow()
  })

  it("marks a reply stuck at sending as failed, and never sends it twice", async () => {
    const id = await scheduleReply(workspaceId, me, "thread-1", { body: "Hi", files, sendAt: later() }, db)
    await db
      .update(customShellCrmScheduledReplies)
      .set({ state: "sending", updatedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(customShellCrmScheduledReplies.id, id))
    await sendDueScheduledReplies(db)
    expect(sending.sendCrmReply).not.toHaveBeenCalled()
    expect((await listScheduledReplies(workspaceId, "thread-1", db))[0]).toMatchObject({ state: "failed" })
  })
})
