import { beforeEach, describe, expect, it } from "vitest"

import { addInboundAddress } from "@/server/crm/addresses"
import {
  CRM_PAGE_LOCKED,
  getCrmBlockFigures,
  getCrmPage,
  saveCrmPageBody,
  setCrmPageCover,
  setCrmPageLock,
} from "@/server/crm/page"
import { type CustomShellDb } from "@/server/db"
import {
  customShellBroadcasts,
  customShellCrmLeads,
  customShellCrmThreads,
  customShellWorkspaces,
  customShellCrmPages,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** The CRM dashboard's left page and what its blocks draw, against a real database. */
describe("the CRM's left page", () => {
  let db: CustomShellDb
  const workspaceId = "ws-crm"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: owner.id,
      name: workspaceId,
      settings: {},
      subdomain: `w-${workspaceId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it("starts with the Dashboards block, then Follow up today", async () => {
    const page = await getCrmPage(workspaceId, db)
    expect(JSON.parse(page.body).content.map((node: { type: string }) => node.type)).toEqual([
      "noteCrmSections",
      "noteCrmFollowUps",
      "paragraph",
    ])
    expect(page).toMatchObject({ locked: false, coverUrl: null })
  })

  it("leaves out an Emails block saved before the addresses moved to the settings", async () => {
    await db.insert(customShellCrmPages).values({
      workspaceId,
      body: JSON.stringify({
        type: "doc",
        content: [
          { type: "noteCrmEmails" },
          { type: "paragraph", content: [{ type: "text", text: "Kept" }] },
        ],
      }),
      locked: false,
      coverUrl: null,
      updatedAt: new Date(),
    })
    const page = await getCrmPage(workspaceId, db)
    // The Dashboards block comes back at the top of a page saved before it.
    expect(JSON.parse(page.body).content.map((node: { type: string }) => node.type)).toEqual([
      "noteCrmSections",
      "paragraph",
    ])
  })

  it("keeps one Dashboards block where it was moved to", async () => {
    await saveCrmPageBody(
      workspaceId,
      JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Above it" }] },
          { type: "noteCrmSections" },
          { type: "noteCrmSections" },
        ],
      }),
      db
    )
    const saved = JSON.parse((await getCrmPage(workspaceId, db)).body)
    expect(saved.content.map((node: { type: string }) => node.type)).toEqual(["paragraph", "noteCrmSections"])
  })

  it("keeps the CRM's own blocks and words, and drops a block it does not know", async () => {
    await saveCrmPageBody(
      workspaceId,
      JSON.stringify({
        type: "doc",
        content: [
          { type: "noteCrmStages", attrs: { sneaky: "kept nothing" } },
          { type: "noteGridTrades" },
          { type: "paragraph", content: [{ type: "text", text: "Call the plumber" }] },
        ],
      }),
      db
    )
    const saved = JSON.parse((await getCrmPage(workspaceId, db)).body)
    expect(saved.content).toEqual([
      { type: "noteCrmSections" },
      { type: "noteCrmStages" },
      { type: "paragraph", content: [{ type: "text", text: "Call the plumber" }] },
    ])
  })

  it("refuses a save while locked, and keeps the cover", async () => {
    await setCrmPageCover(
      workspaceId,
      { coverUrl: "https://images.example.com/cover.jpg", coverImages: ["https://images.example.com/cover.jpg"] },
      db
    )
    await setCrmPageLock(workspaceId, true, db)
    await expect(saveCrmPageBody(workspaceId, JSON.stringify({ type: "doc", content: [] }), db)).rejects.toThrow(
      CRM_PAGE_LOCKED
    )
    expect(await getCrmPage(workspaceId, db)).toMatchObject({
      locked: true,
      coverUrl: "https://images.example.com/cover.jpg",
    })
  })

  it("counts open mail per address, with the mail from before the list under the first one", async () => {
    await addInboundAddress(workspaceId, { address: "sales@inbox.example.com" }, db)
    await addInboundAddress(workspaceId, { address: "support@inbox.example.com" }, db)
    await db.insert(customShellCrmLeads).values({
      id: "lead-1",
      workspaceId,
      email: "jane@example.com",
      stage: "quoted",
      followUpAt: new Date(Date.now() - 60_000),
      followUpNote: "Ask about the quote",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const thread = (id: string, toAddress: string | null, status: "open" | "closed") => ({
      id,
      workspaceId,
      leadId: "lead-1",
      subject: id,
      subjectKey: id,
      status,
      toAddress,
      lastMessageAt: new Date(),
      lastDirection: "in" as const,
      messageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmThreads).values([
      thread("t-old", null, "open"),
      thread("t-support", "Support@Inbox.Example.com", "open"),
      thread("t-closed", "support@inbox.example.com", "closed"),
    ])

    await db.insert(customShellBroadcasts).values({
      id: "b-1",
      workspaceId,
      name: "November news",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const figures = await getCrmBlockFigures(workspaceId, db)
    expect(figures.emails.map(({ address, open }) => [address, open])).toEqual([
      ["sales@inbox.example.com", 1],
      ["support@inbox.example.com", 1],
    ])
    expect(figures.openCount).toBe(2)
    // The Dashboards block's counts: everybody once (the lead, no contacts
    // yet), and the newsletters.
    expect(figures.peopleCount).toBe(1)
    expect(figures.broadcastCount).toBe(1)
    expect(figures.stages.quoted).toBe(1)
    expect(figures.followUps).toHaveLength(1)
    expect(figures.followUps[0]).toMatchObject({ email: "jane@example.com", note: "Ask about the quote" })
    expect(figures.followUps[0]?.threadId).toBeTruthy()
  })
})
