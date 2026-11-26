import { beforeEach, describe, expect, it } from "vitest"

import {
  clearReplyDraft,
  listReplyDrafts,
  removeOldReplyDrafts,
  saveReplyDraft,
} from "@/server/crm/reply-drafts"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmReplyDrafts,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Half-written replies kept on the server (CRM task 38, part 5). */
describe("kept reply drafts", () => {
  let db: CustomShellDb
  let me: string
  let colleague: string
  const workspaceId = "ws-drafts"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    me = (await insertUser(db, { email: "me@example.com" })).id
    colleague = (await insertUser(db, { email: "colleague@example.com" })).id
    for (const id of [workspaceId, "ws-other"]) {
      await db.insert(customShellWorkspaces).values({
        id,
        userId: me,
        name: id,
        settings: {},
        subdomain: `w-${id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await db.insert(customShellCrmLeads).values({
        id: `lead-${id}`,
        workspaceId: id,
        email: "jane@buyer.com",
        stage: "new",
        valueCents: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await db.insert(customShellCrmThreads).values({
        id: `thread-${id}`,
        workspaceId: id,
        leadId: `lead-${id}`,
        subject: "Kitchen",
        subjectKey: "kitchen",
        status: "open",
        lastMessageAt: new Date(),
        lastDirection: "in",
        messageCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })

  it("keeps the words, changes them, and reads them back for that admin only", async () => {
    expect(await saveReplyDraft(workspaceId, me, "thread-ws-drafts", "Hi Jane,", db)).toBe(true)
    expect(await saveReplyDraft(workspaceId, me, "thread-ws-drafts", "Hi Jane, the quote is", db)).toBe(true)
    expect(await listReplyDrafts(workspaceId, me, db)).toEqual({ "thread-ws-drafts": "Hi Jane, the quote is" })
    expect(await listReplyDrafts(workspaceId, colleague, db)).toEqual({})
  })

  it("forgets the draft when the box is emptied, spaces included", async () => {
    await saveReplyDraft(workspaceId, me, "thread-ws-drafts", "Hi", db)
    await saveReplyDraft(workspaceId, me, "thread-ws-drafts", "   ", db)
    expect(await listReplyDrafts(workspaceId, me, db)).toEqual({})
  })

  it("writes nothing for another site's conversation", async () => {
    expect(await saveReplyDraft(workspaceId, me, "thread-ws-other", "Hi", db)).toBe(false)
    expect(await db.select().from(customShellCrmReplyDrafts)).toEqual([])
  })

  it("is forgotten once the reply is sent", async () => {
    await saveReplyDraft(workspaceId, me, "thread-ws-drafts", "Hi", db)
    await saveReplyDraft(workspaceId, colleague, "thread-ws-drafts", "Hello", db)
    await clearReplyDraft(workspaceId, me, "thread-ws-drafts", db)
    expect(await listReplyDrafts(workspaceId, me, db)).toEqual({})
    expect(await listReplyDrafts(workspaceId, colleague, db)).toEqual({ "thread-ws-drafts": "Hello" })
  })

  it("lets go of drafts nobody touched for 30 days", async () => {
    await saveReplyDraft(workspaceId, me, "thread-ws-drafts", "Old", db)
    await saveReplyDraft(workspaceId, colleague, "thread-ws-drafts", "Fresh", db)
    await db
      .update(customShellCrmReplyDrafts)
      .set({ updatedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where((await import("drizzle-orm")).eq(customShellCrmReplyDrafts.userId, me))
    expect(await removeOldReplyDrafts(db)).toBe(1)
    expect(await listReplyDrafts(workspaceId, colleague, db)).toEqual({ "thread-ws-drafts": "Fresh" })
  })
})
