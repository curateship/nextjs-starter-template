import { beforeEach, describe, expect, it } from "vitest"

import { countSubscribersAndLeads, listLeadPeople } from "@/server/crm/people"
import { type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The CRM Leads section's reads, against a real database: every lead, the
 * subscriber on the same address named, and nothing from another site.
 * Subscribers and leads are separate lists (9 Nov 2026).
 */
describe("the Leads section's reads", () => {
  let db: CustomShellDb
  const workspaceId = "ws-people"
  const otherWorkspaceId = "ws-people-other"
  const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`)

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
    await db.insert(customShellContacts).values([
      { id: "contact-anna", workspaceId, email: "Anna@Example.test", firstName: "Anna", status: "subscribed", tags: [], createdAt: at(1), updatedAt: at(1) },
      { id: "contact-dan", workspaceId, email: "dan@example.test", firstName: "Dan", status: "unsubscribed", tags: [], createdAt: at(3), updatedAt: at(3) },
    ])
    await db.insert(customShellCrmLeads).values([
      // The same person as contact-anna, in other capitals.
      { id: "lead-anna", workspaceId, email: "anna@example.test", name: "Anna Lee", stage: "quoted", valueCents: 120000, createdAt: at(4), updatedAt: at(4) },
      { id: "lead-carla", workspaceId, email: "carla@plumbing.test", name: "Carla", company: "Carla Plumbing", stage: "new", valueCents: 0, createdAt: at(2), updatedAt: at(2) },
      { id: "lead-elsewhere", workspaceId: otherWorkspaceId, email: "nosy@elsewhere.test", stage: "new", valueCents: 0, createdAt: at(5), updatedAt: at(5) },
    ])
    await db.insert(customShellCrmThreads).values({
      id: "thread-carla",
      workspaceId,
      leadId: "lead-carla",
      subject: "A leak",
      subjectKey: "a leak",
      status: "open",
      lastMessageAt: at(2),
      lastDirection: "in",
      messageCount: 1,
      readAt: null,
      createdAt: at(2),
      updatedAt: at(2),
    })
  })

  it("counts subscribers and leads apart, never another site's", async () => {
    expect(await countSubscribersAndLeads(workspaceId, db)).toEqual({ subscribers: 2, leads: 2 })
    expect(await countSubscribersAndLeads(otherWorkspaceId, db)).toEqual({ subscribers: 0, leads: 1 })
  })

  it("searches a lead's company as well as its address", async () => {
    const { leads } = await listLeadPeople(workspaceId, { search: "plumbing", limit: 50, offset: 0 }, db)
    expect(leads.map((lead) => lead.id)).toEqual(["lead-carla"])
  })

  it("lists every lead, naming the subscriber on the same address", async () => {
    const { leads, total } = await listLeadPeople(workspaceId, { limit: 50, offset: 0 }, db)
    expect(total).toBe(2)
    expect(leads.map((lead) => [lead.id, lead.contactId])).toEqual([
      ["lead-anna", "contact-anna"],
      ["lead-carla", null],
    ])
    expect(leads.find((lead) => lead.id === "lead-carla")?.newestThreadId).toBe("thread-carla")
  })

  it("sorts by stage in the pipeline's order, by deal value, and by company with blanks last", async () => {
    const order = async (sort: "stage" | "value" | "company", direction: "asc" | "desc") =>
      (await listLeadPeople(workspaceId, { sort, direction, limit: 50, offset: 0 }, db)).leads.map((lead) => lead.id)
    expect(await order("stage", "asc")).toEqual(["lead-carla", "lead-anna"])
    expect(await order("value", "desc")).toEqual(["lead-anna", "lead-carla"])
    expect(await order("company", "asc")).toEqual(["lead-carla", "lead-anna"])
    expect(await order("company", "desc")).toEqual(["lead-carla", "lead-anna"])
  })
})
