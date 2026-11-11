import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { notifyUnansweredThreads } from "@/server/crm/follow-ups"
import { type CustomShellDb } from "@/server/db"
import { saveCrmUnansweredDays } from "@/server/email/settings"
import {
  customShellCrmLeads,
  customShellCrmThreads,
  customShellNotifications,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Chase unanswered mail (CRM task 11), against a real database. */
describe("chasing unanswered mail", () => {
  let db: CustomShellDb
  let ownerId: string
  const workspaceId = "ws-crm"
  const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000)

  const thread = (id: string, values: Partial<typeof customShellCrmThreads.$inferInsert> = {}) => ({
    id,
    workspaceId,
    leadId: "lead-1",
    subject: `Subject ${id}`,
    subjectKey: id,
    status: "open" as const,
    lastMessageAt: fourDaysAgo,
    lastDirection: "in" as const,
    messageCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
  })

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
    await db.insert(customShellCrmLeads).values([
      { id: "lead-1", workspaceId, email: "jane@example.com", name: "Jane", stage: "quoted", createdAt: new Date(), updatedAt: new Date() },
      { id: "lead-won", workspaceId, email: "won@example.com", stage: "won", createdAt: new Date(), updatedAt: new Date() },
    ])
  })

  const notices = () => db.select().from(customShellNotifications)

  it("chases once a conversation they wrote last, after three days, and never twice", async () => {
    await db.insert(customShellCrmThreads).values(thread("waiting"))
    expect(await notifyUnansweredThreads(db)).toBe(1)
    const [notice] = await notices()
    expect(notice).toMatchObject({ recipientUserId: ownerId, type: "crm_follow_up", crmThreadId: "waiting" })
    expect(notice?.message).toBe("Jane has waited 4 days for an answer")
    expect(await notifyUnansweredThreads(db)).toBe(0)
  })

  it("leaves alone one you answered, one snoozed, one closed, one too recent and a Won lead", async () => {
    await db.insert(customShellCrmThreads).values([
      thread("answered", { lastDirection: "out" }),
      thread("snoozed", { status: "snoozed" }),
      thread("closed", { status: "closed" }),
      thread("recent", { lastMessageAt: new Date(Date.now() - 86_400_000) }),
      thread("won", { leadId: "lead-won" }),
    ])
    expect(await notifyUnansweredThreads(db)).toBe(0)
    expect(await notices()).toEqual([])
  })

  it("follows the site's number of days, and 0 turns it off", async () => {
    await db.insert(customShellCrmThreads).values(thread("waiting"))
    await saveCrmUnansweredDays(workspaceId, 5, db)
    expect(await notifyUnansweredThreads(db)).toBe(0)
    await saveCrmUnansweredDays(workspaceId, 0, db)
    expect(await notifyUnansweredThreads(db)).toBe(0)
    await saveCrmUnansweredDays(workspaceId, 2, db)
    expect(await notifyUnansweredThreads(db)).toBe(1)
  })

  it("chases again once the stamp is cleared, as a new message from them does", async () => {
    await db.insert(customShellCrmThreads).values(thread("waiting"))
    expect(await notifyUnansweredThreads(db)).toBe(1)
    await db.update(customShellCrmThreads).set({ unansweredNotifiedAt: null }).where(eq(customShellCrmThreads.id, "waiting"))
    expect(await notifyUnansweredThreads(db)).toBe(1)
  })
})
