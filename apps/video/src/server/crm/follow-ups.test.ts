import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { FOLLOW_UP_BATCH, notifyDueFollowUps } from "@/server/crm/follow-ups"
import { wakeSnoozedThreads } from "@/server/crm/inbox"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmThreads,
  customShellNotifications,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const WORKSPACE = "ws-crm"

describe("chasing a lead", () => {
  let db: CustomShellDb
  let ownerId: string

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    ownerId = owner.id
    await db.insert(customShellWorkspaces).values({
      id: WORKSPACE,
      userId: owner.id,
      name: "Test",
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  async function insertLead(
    id: string,
    overrides: Partial<{
      followUpAt: Date | null
      followUpNote: string | null
      stage: "new" | "contacted" | "quoted" | "won" | "lost"
      name: string | null
    }> = {}
  ) {
    await db.insert(customShellCrmLeads).values({
      id,
      workspaceId: WORKSPACE,
      email: `${id}@buyer.com`,
      // `??` would swallow an explicit null, which is exactly the case one of
      // these tests is about.
      name: overrides.name === undefined ? "Jane Smith" : overrides.name,
      stage: overrides.stage ?? "quoted",
      followUpAt:
        overrides.followUpAt === undefined
          ? new Date(Date.now() - 60 * 1000)
          : overrides.followUpAt,
      followUpNote: overrides.followUpNote ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  it("writes one notice for a date that has passed", async () => {
    await insertLead("lead-1", { followUpNote: "Ask about the quote" })

    expect(await notifyDueFollowUps(db)).toBe(1)

    const notices = await db.select().from(customShellNotifications)
    expect(notices).toHaveLength(1)
    expect(notices[0].type).toBe("crm_follow_up")
    expect(notices[0].recipientUserId).toBe(ownerId)
    expect(notices[0].message).toBe("Follow up with Jane Smith")
    expect(notices[0].detail).toBe("Ask about the quote")
  })

  it("says something useful when no note was typed", async () => {
    await insertLead("lead-1")
    await notifyDueFollowUps(db)

    const [notice] = await db.select().from(customShellNotifications)
    expect(notice.detail).toBe(
      "You set a date to chase this one, and the date has passed."
    )
  })

  it("falls back to the address when the lead has no name", async () => {
    await insertLead("lead-1", { name: null })
    await notifyDueFollowUps(db)

    const [notice] = await db.select().from(customShellNotifications)
    expect(notice.message).toBe("Follow up with lead-1@buyer.com")
  })

  it("fires once, not on every pass", async () => {
    await insertLead("lead-1")

    expect(await notifyDueFollowUps(db)).toBe(1)
    expect(await notifyDueFollowUps(db)).toBe(0)
    expect(await notifyDueFollowUps(db)).toBe(0)

    expect(await db.select().from(customShellNotifications)).toHaveLength(1)
  })

  it("leaves a date still in the future alone", async () => {
    await insertLead("lead-1", {
      followUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    expect(await notifyDueFollowUps(db)).toBe(0)
    expect(await db.select().from(customShellNotifications)).toHaveLength(0)
  })

  it("leaves a lead with no date alone", async () => {
    await insertLead("lead-1", { followUpAt: null })

    expect(await notifyDueFollowUps(db)).toBe(0)
  })

  it("does not chase a lead that is already won or lost", async () => {
    await insertLead("lead-won", { stage: "won" })
    await insertLead("lead-lost", { stage: "lost" })

    expect(await notifyDueFollowUps(db)).toBe(0)
  })

  it("is not starved by a batch full of leads it will never chase", async () => {
    // Won and lost leads keep whatever chase date they had, and they are never
    // notified, so they never get stamped either. A whole batch of them used
    // to fill the limit and push the one real lead out of every pass, forever.
    for (let index = 0; index < FOLLOW_UP_BATCH; index += 1) {
      await insertLead(`lead-won-${index}`, { stage: "won" })
    }
    await insertLead("lead-real", { stage: "quoted" })

    expect(await notifyDueFollowUps(db)).toBe(1)

    const [notice] = await db.select().from(customShellNotifications)
    expect(notice.message).toBe("Follow up with Jane Smith")
  })

  it("points the notice at their newest conversation", async () => {
    await insertLead("lead-1")
    await db.insert(customShellCrmThreads).values([
      {
        id: "thread-old",
        workspaceId: WORKSPACE,
        leadId: "lead-1",
        subject: "The first one",
        subjectKey: "the first one",
        lastMessageAt: new Date("2026-01-01T00:00:00.000Z"),
        lastDirection: "in",
        messageCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "thread-new",
        workspaceId: WORKSPACE,
        leadId: "lead-1",
        subject: "The newest one",
        subjectKey: "the newest one",
        lastMessageAt: new Date("2026-09-01T00:00:00.000Z"),
        lastDirection: "in",
        messageCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    await notifyDueFollowUps(db)
    const [notice] = await db.select().from(customShellNotifications)
    expect(notice.crmThreadId).toBe("thread-new")
  })

  it("still writes the notice for a lead with no conversation yet", async () => {
    await insertLead("lead-1")
    await notifyDueFollowUps(db)

    const [notice] = await db.select().from(customShellNotifications)
    expect(notice.crmThreadId).toBeNull()
  })

  it("chases again once the date is moved", async () => {
    await insertLead("lead-1")
    await notifyDueFollowUps(db)

    // Moving the date clears the stamp, which is what lets it fire again.
    await db
      .update(customShellCrmLeads)
      .set({
        followUpAt: new Date(Date.now() - 60 * 1000),
        followUpNotifiedAt: null,
      })
      .where(eq(customShellCrmLeads.id, "lead-1"))

    expect(await notifyDueFollowUps(db)).toBe(1)
    expect(await db.select().from(customShellNotifications)).toHaveLength(2)
  })

  it("wakes a conversation whose snooze has run out", async () => {
    await insertLead("lead-1", { followUpAt: null })
    await db.insert(customShellCrmThreads).values({
      id: "thread-1",
      workspaceId: WORKSPACE,
      leadId: "lead-1",
      subject: "Snoozed",
      subjectKey: "snoozed",
      status: "snoozed",
      snoozedUntil: new Date(Date.now() - 60 * 1000),
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(await wakeSnoozedThreads(db)).toBe(1)

    const [thread] = await db.select().from(customShellCrmThreads)
    expect(thread.status).toBe("open")
    expect(thread.snoozedUntil).toBeNull()
  })

  it("leaves a snooze that has not run out alone", async () => {
    await insertLead("lead-1", { followUpAt: null })
    await db.insert(customShellCrmThreads).values({
      id: "thread-1",
      workspaceId: WORKSPACE,
      leadId: "lead-1",
      subject: "Snoozed",
      subjectKey: "snoozed",
      status: "snoozed",
      snoozedUntil: new Date(Date.now() + 60 * 60 * 1000),
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(await wakeSnoozedThreads(db)).toBe(0)
    const [thread] = await db.select().from(customShellCrmThreads)
    expect(thread.status).toBe("snoozed")
  })
})
