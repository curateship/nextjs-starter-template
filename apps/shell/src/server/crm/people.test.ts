import { beforeEach, describe, expect, it } from "vitest"

import {
  countPeople,
  getLeadPeople,
  leadsForContacts,
  listLeadPeople,
  listPeopleOrder,
} from "@/server/crm/people"
import { type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The CRM People tab's reads, against a real database: contacts and leads in
 * one list, somebody who is both shown once, and nothing from another site.
 */
describe("the People tab's reads", () => {
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

  it("lists every contact, then each lead who is not one, once, newest first", async () => {
    const { rows, total } = await listPeopleOrder(workspaceId, { limit: 50, offset: 0 }, db)
    expect(rows).toEqual([
      { kind: "contact", id: "contact-dan" },
      { kind: "lead", id: "lead-carla" },
      { kind: "contact", id: "contact-anna" },
    ])
    expect(total).toBe(3)
  })

  it("pages the two kinds as one list", async () => {
    const second = await listPeopleOrder(workspaceId, { limit: 1, offset: 1 }, db)
    expect(second.rows).toEqual([{ kind: "lead", id: "lead-carla" }])
    expect(second.total).toBe(3)
  })

  it("sorts by name across both kinds", async () => {
    const { rows } = await listPeopleOrder(workspaceId, { sort: "name", direction: "asc", limit: 50, offset: 0 }, db)
    expect(rows.map((row) => row.id)).toEqual(["contact-anna", "lead-carla", "contact-dan"])
  })

  it("searches a lead's company as well as its address", async () => {
    const { rows } = await listPeopleOrder(workspaceId, { search: "plumbing", limit: 50, offset: 0 }, db)
    expect(rows).toEqual([{ kind: "lead", id: "lead-carla" }])
  })

  it("orders by status and by last emailed without failing", async () => {
    for (const sort of ["status", "emailed"] as const) {
      for (const direction of ["asc", "desc"] as const) {
        const { rows } = await listPeopleOrder(workspaceId, { sort, direction, limit: 50, offset: 0 }, db)
        expect(rows).toHaveLength(3)
      }
    }
  })

  it("counts everybody once, and every lead", async () => {
    expect(await countPeople(workspaceId, db)).toEqual({ all: 3, leads: 2 })
    expect(await countPeople(otherWorkspaceId, db)).toEqual({ all: 1, leads: 1 })
  })

  it("lists every lead under Leads, naming the contact a lead also is", async () => {
    const { leads, total } = await listLeadPeople(workspaceId, { limit: 50, offset: 0 }, db)
    expect(total).toBe(2)
    expect(leads.map((lead) => [lead.id, lead.contactId])).toEqual([
      ["lead-anna", "contact-anna"],
      ["lead-carla", null],
    ])
    expect(leads.find((lead) => lead.id === "lead-carla")?.newestThreadId).toBe("thread-carla")
  })

  it("fills leads in by id, never another site's", async () => {
    const leads = await getLeadPeople(workspaceId, ["lead-carla", "lead-elsewhere"], db)
    expect(leads.map((lead) => lead.id)).toEqual(["lead-carla"])
  })

  it("marks a contact who is also a lead, whatever the capitals", async () => {
    const found = await leadsForContacts(
      workspaceId,
      [
        { id: "contact-anna", email: "Anna@Example.test" },
        { id: "contact-dan", email: "dan@example.test" },
      ],
      db
    )
    expect([...found]).toEqual([["contact-anna", "lead-anna"]])
  })
})
