import { beforeEach, describe, expect, it } from "vitest"

import { listInboxThreads } from "@/server/crm/inbox"
import {
  CRM_LEAD_NOT_FOUND,
  CRM_LEAD_TAG_INVALID,
  CRM_LEAD_TAG_LIMIT_REACHED,
  changeLeadTag,
  listLeadTags,
  listWorkspaceLeadTags,
} from "@/server/crm/lead-tags"
import { type CustomShellDb } from "@/server/db"
import { customShellCrmLeads, customShellCrmThreads, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Tags on a lead (CRM task 27), against a real database. */
describe("tags on a lead", () => {
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
    const lead = (id: string, workspace: string) => ({
      id,
      workspaceId: workspace,
      email: `${id}@example.com`,
      stage: "new" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmLeads).values([lead("lead-1", workspaceId), lead("lead-2", workspaceId), lead("lead-x", otherWorkspaceId)])
    await db.insert(customShellCrmThreads).values(
      ["lead-1", "lead-2"].map((leadId) => ({
        id: `thread-${leadId}`,
        workspaceId,
        leadId,
        subject: leadId,
        subjectKey: leadId,
        status: "open" as const,
        lastMessageAt: new Date(),
        lastDirection: "in" as const,
        messageCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    )
  })

  it("adds one spelling, capitals and spaces aside, and says when nothing changed", async () => {
    expect(await changeLeadTag(workspaceId, "lead-1", "add", "  Kitchen ", db)).toBe("added")
    expect(await changeLeadTag(workspaceId, "lead-1", "add", "KITCHEN", db)).toBe("unchanged")
    expect((await listLeadTags(["lead-1"], db)).get("lead-1")).toEqual(["kitchen"])
    expect(await changeLeadTag(workspaceId, "lead-1", "remove", "Kitchen", db)).toBe("removed")
    expect(await changeLeadTag(workspaceId, "lead-1", "remove", "kitchen", db)).toBe("unchanged")
  })

  it("refuses a comma, an empty tag and one too long", async () => {
    for (const bad of ["a, b", "   ", "x".repeat(61)]) {
      await expect(changeLeadTag(workspaceId, "lead-1", "add", bad, db)).rejects.toThrow(CRM_LEAD_TAG_INVALID)
    }
  })

  it("holds 30 tags at most", async () => {
    for (let index = 0; index < 30; index += 1) await changeLeadTag(workspaceId, "lead-1", "add", `tag ${index}`, db)
    await expect(changeLeadTag(workspaceId, "lead-1", "add", "one more", db)).rejects.toThrow(CRM_LEAD_TAG_LIMIT_REACHED)
  })

  it("never touches another workspace's lead, nor lists its tags", async () => {
    await expect(changeLeadTag(workspaceId, "lead-x", "add", "theirs", db)).rejects.toThrow(CRM_LEAD_NOT_FOUND)
    await changeLeadTag(otherWorkspaceId, "lead-x", "add", "theirs", db)
    await changeLeadTag(workspaceId, "lead-2", "add", "landlord", db)
    expect(await listWorkspaceLeadTags(workspaceId, db)).toEqual(["landlord"])
  })

  it("narrows the inbox to one tag, and carries every row's tags", async () => {
    await changeLeadTag(workspaceId, "lead-2", "add", "landlord", db)
    await changeLeadTag(workspaceId, "lead-2", "add", "kitchen", db)
    const rows = await listInboxThreads(workspaceId, { status: "all", tag: "Landlord" }, db)
    expect(rows.map((row) => row.id)).toEqual(["thread-lead-2"])
    expect(rows[0]?.tags).toEqual(["kitchen", "landlord"])
  })
})
