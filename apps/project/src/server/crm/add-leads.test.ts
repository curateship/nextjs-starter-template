import { beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { addContactToLeads, addWorkspaceLeads, deleteLeads, setLeadsStage } from "@/server/crm/leads"
import { type CustomShellDb } from "@/server/db"
import { customShellContacts, customShellCrmLeads, customShellCrmThreads, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Leads added by hand or from a CSV file (9 Nov 2026), against a real database. */
describe("adding leads by hand or from a file", () => {
  let db: CustomShellDb
  const workspaceId = "ws-add-leads"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: owner.id,
      name: "Add leads",
      settings: {},
      subdomain: "w-add-leads",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmLeads).values({
      id: "lead-anna",
      workspaceId,
      email: "anna@example.test",
      name: "Anna",
      stage: "quoted",
      valueCents: 50000,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  const leads = () => db.select().from(customShellCrmLeads).where(eq(customShellCrmLeads.workspaceId, workspaceId))

  it("adds a new address at the stage given, and puts nobody on the subscriber list", async () => {
    const result = await addWorkspaceLeads(
      workspaceId,
      [{ email: " Ben@Example.test ", name: "Ben", company: "Ben Co", phone: "0123", stage: "contacted" }],
      "Added by hand",
      db
    )
    expect(result).toMatchObject({ added: 1, updated: 0, unchanged: 0 })
    const ben = (await leads()).find((lead) => lead.email === "ben@example.test")
    expect(ben).toMatchObject({ name: "Ben", company: "Ben Co", phone: "0123", stage: "contacted", source: "Added by hand" })
    expect(result.leadIds).toEqual([ben?.id])
    expect(await db.select().from(customShellContacts)).toHaveLength(0)
  })

  it("updates a lead already there, in any capitals, keeping their stage and deal", async () => {
    const result = await addWorkspaceLeads(
      workspaceId,
      [{ email: "ANNA@example.test", company: "Anna Ltd", name: null }],
      "CSV import",
      db
    )
    expect(result).toMatchObject({ added: 0, updated: 1, leadIds: ["lead-anna"] })
    const [anna] = await leads()
    expect(anna).toMatchObject({ name: "Anna", company: "Anna Ltd", stage: "quoted", valueCents: 50000 })
  })

  it("counts a row that changes nothing, and one address twice in a file as one lead", async () => {
    const result = await addWorkspaceLeads(
      workspaceId,
      [{ email: "anna@example.test", name: "Anna" }, { email: "cara@example.test" }, { email: "Cara@example.test", name: "Cara" }],
      "CSV import",
      db
    )
    expect(result).toMatchObject({ added: 1, updated: 0, unchanged: 1 })
    const cara = (await leads()).filter((lead) => lead.email === "cara@example.test")
    expect(cara).toHaveLength(1)
    expect(cara[0]).toMatchObject({ name: "Cara", stage: "new" })
  })

  it("moves picked leads to one stage, counting only those that moved", async () => {
    await addWorkspaceLeads(workspaceId, [{ email: "ben@example.test" }], "CSV import", db)
    const ids = (await leads()).map((lead) => lead.id)
    expect(await setLeadsStage(workspaceId, ids, "quoted", db)).toEqual({ changed: 1 })
    expect((await leads()).every((lead) => lead.stage === "quoted")).toBe(true)
    expect(await setLeadsStage("another-site", ids, "won", db)).toEqual({ changed: 0 })
  })

  it("deletes a lead with its conversations, and leaves the subscriber on the same address", async () => {
    await db.insert(customShellContacts).values({
      id: "contact-anna",
      workspaceId,
      email: "anna@example.test",
      status: "subscribed",
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmThreads).values({
      id: "thread-anna",
      workspaceId,
      leadId: "lead-anna",
      subject: "Hi",
      subjectKey: "hi",
      status: "open",
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(await deleteLeads("another-site", ["lead-anna"], db)).toEqual({ deleted: 0 })
    expect(await deleteLeads(workspaceId, ["lead-anna"], db)).toEqual({ deleted: 1 })
    expect(await leads()).toHaveLength(0)
    expect(await db.select().from(customShellCrmThreads)).toHaveLength(0)
    expect(await db.select().from(customShellContacts)).toHaveLength(1)
  })

  it("makes a subscriber a lead too, once, keeping them a subscriber", async () => {
    await db.insert(customShellContacts).values([
      { id: "c-dee", workspaceId, email: "Dee@Example.test", firstName: "Dee", lastName: "Ray", status: "subscribed", tags: [], createdAt: new Date(), updatedAt: new Date() },
      { id: "c-anna", workspaceId, email: "ANNA@example.test", status: "subscribed", tags: [], createdAt: new Date(), updatedAt: new Date() },
    ])
    const dee = await addContactToLeads(workspaceId, "c-dee", db)
    expect(dee?.existed).toBe(false)
    expect((await leads()).find((lead) => lead.id === dee?.leadId)).toMatchObject({ email: "dee@example.test", name: "Dee Ray", stage: "new" })
    expect(await addContactToLeads(workspaceId, "c-dee", db)).toEqual({ leadId: dee?.leadId, existed: true })
    expect(await addContactToLeads(workspaceId, "c-anna", db)).toEqual({ leadId: "lead-anna", existed: true })
    expect(await addContactToLeads("another-site", "c-dee", db)).toBeNull()
    expect(await db.select().from(customShellContacts)).toHaveLength(2)
  })
})
