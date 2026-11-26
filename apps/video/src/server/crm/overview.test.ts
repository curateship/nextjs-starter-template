import { beforeEach, describe, expect, it } from "vitest"

import { getCrmOverviewFigures } from "@/server/crm/overview"
import { type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The CRM Overview's Inbox widgets (CRM task 38, part 2), against a real
 * database, because the typical answer time is a hand-written query.
 */
describe("the CRM Overview's figures", () => {
  let db: CustomShellDb
  const workspaceId = "ws-overview"
  const hour = 3_600_000
  const day = 24 * hour
  const recent = (daysAgo: number, hoursIn = 0) => new Date(Date.now() - daysAgo * day + hoursIn * hour)

  async function thread(
    id: string,
    messages: { direction: "in" | "out"; at: Date }[],
    options: { status?: "open" | "closed"; read?: boolean } = {}
  ) {
    const last = messages[messages.length - 1]
    await db.insert(customShellCrmThreads).values({
      id,
      workspaceId,
      leadId: "lead-1",
      subject: id,
      subjectKey: id,
      status: options.status ?? "open",
      lastMessageAt: last.at,
      lastDirection: last.direction,
      messageCount: messages.length,
      readAt: options.read ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmMessages).values(
      messages.map((message, index) => ({
        id: `${id}-${index}`,
        workspaceId,
        threadId: id,
        direction: message.direction,
        fromEmail: message.direction === "in" ? "jane@buyer.com" : "leads@example.com",
        toEmail: message.direction === "in" ? "leads@example.com" : "jane@buyer.com",
        subject: id,
        textBody: "Hello",
        attachments: [],
        bodyFetchedAt: new Date(),
        occurredAt: message.at,
        createdAt: new Date(),
      }))
    )
  }

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: owner.id,
      name: "Overview",
      settings: {},
      subdomain: "w-overview",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmLeads).values({
      id: "lead-1",
      workspaceId,
      email: "jane@buyer.com",
      stage: "new",
      valueCents: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it("takes the middle first-answer time, leaving out the unanswered and the blocked", async () => {
    // Answered after 1, 3 and 30 hours: the typical one is 3 hours.
    await thread("one", [{ direction: "in", at: recent(5) }, { direction: "out", at: recent(5, 1) }], { read: true })
    await thread("three", [{ direction: "in", at: recent(4) }, { direction: "out", at: recent(4, 3) }], { read: true })
    await thread("thirty", [{ direction: "in", at: recent(3) }, { direction: "out", at: recent(3, 30) }], { read: true })
    await thread("unanswered", [{ direction: "in", at: recent(1) }])
    await thread("blocked", [{ direction: "in", at: recent(2) }, { direction: "out", at: recent(2, 1) }], {
      status: "closed",
      read: true,
    })
    // Started before the 30 days, answered inside them: not counted.
    await thread("old", [{ direction: "in", at: recent(40) }, { direction: "out", at: recent(2) }], { read: true })

    const figures = await getCrmOverviewFigures(workspaceId, db)
    expect(figures.answered).toBe(3)
    expect(figures.typicalFirstAnswerMs).toBe(3 * hour)
    expect(figures.unread).toBe(1)
  })

  it("says no answers yet, rather than zero hours, when nothing was answered", async () => {
    await thread("waiting", [{ direction: "in", at: recent(1) }])
    const figures = await getCrmOverviewFigures(workspaceId, db)
    expect(figures.typicalFirstAnswerMs).toBeNull()
    expect(figures.answered).toBe(0)
  })

  it("draws every one of the 30 days, zero days as zero, and leaves blocked mail out", async () => {
    await thread("today", [{ direction: "in", at: recent(0) }, { direction: "in", at: recent(0) }])
    await thread("blocked", [{ direction: "in", at: recent(0) }], { status: "closed", read: true })

    const figures = await getCrmOverviewFigures(workspaceId, db)
    expect(figures.mailPerDay).toHaveLength(30)
    expect(figures.mailPerDay.at(-1)).toEqual({ day: new Date().toISOString().slice(0, 10), mail: 2 })
    expect(figures.mailPerDay.slice(0, -1).every((point) => point.mail === 0)).toBe(true)
  })

  it("counts Waiting the way the Inbox does", async () => {
    await thread("long", [{ direction: "in", at: recent(5) }])
    const figures = await getCrmOverviewFigures(workspaceId, db)
    expect(figures.waitingOn).toBe(true)
    expect(figures.waiting).toBe(1)
  })
})
