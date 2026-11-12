import { beforeEach, describe, expect, it } from "vitest"

import {
  ADMIN_PAGE_LOCKED,
  getAdminPage,
  saveAdminPageBody,
  setAdminPageCover,
  setAdminPageLock,
} from "@/server/admin-dashboard/page"
import { type CustomShellDb } from "@/server/db"
import { customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const typesOf = (body: string) =>
  (JSON.parse(body) as { content: { type: string }[] }).content.map((node) => node.type)

/** The Admin dashboard's page, against a real database. */
describe("the Admin page", () => {
  let db: CustomShellDb
  const workspaceId = "ws-admin"

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

  it("starts the page with Dashboards and Plans", async () => {
    const page = await getAdminPage(workspaceId, "left", db)
    expect(typesOf(page.body)).toEqual(["noteAdminSections", "noteAdminPlans", "paragraph"])
    expect(page).toMatchObject({ locked: false, coverUrl: null })
  })

  it("keeps its own blocks and words, and drops a block it does not know", async () => {
    await saveAdminPageBody(
      workspaceId,
      "left",
      JSON.stringify({
        type: "doc",
        content: [
          { type: "noteAdminSections" },
          { type: "noteAdminPlans" },
          // A figure block from before Overview became widgets, and another dashboard's.
          { type: "noteAdminTopPages" },
          { type: "noteCrmStages" },
          { type: "paragraph", content: [{ type: "text", text: "Check spend on Mondays" }] },
        ],
      }),
      db
    )
    expect(typesOf((await getAdminPage(workspaceId, "left", db)).body)).toEqual([
      "noteAdminSections",
      "noteAdminPlans",
      "paragraph",
    ])
  })

  it("keeps the Dashboards block, wherever it was moved, and only once", async () => {
    // Emptied, the page still has its way between the sections.
    await saveAdminPageBody(workspaceId, "left", JSON.stringify({ type: "doc", content: [] }), db)
    expect(typesOf((await getAdminPage(workspaceId, "left", db)).body)).toEqual(["noteAdminSections", "paragraph"])

    // Moved under a line, it stays there; a second copy goes.
    await saveAdminPageBody(
      workspaceId,
      "left",
      JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Read me first" }] },
          { type: "noteAdminSections" },
          { type: "noteAdminSections" },
        ],
      }),
      db
    )
    expect(typesOf((await getAdminPage(workspaceId, "left", db)).body)).toEqual(["paragraph", "noteAdminSections"])
  })

  it("keeps the page's lock and cover, and refuses a save while locked", async () => {
    await setAdminPageLock(workspaceId, "left", true, db)
    await setAdminPageCover(workspaceId, "left", { coverUrl: "/media/cover.jpg", coverImages: ["/media/cover.jpg"] }, db)
    await expect(
      saveAdminPageBody(workspaceId, "left", JSON.stringify({ type: "doc", content: [] }), db)
    ).rejects.toThrow(ADMIN_PAGE_LOCKED)
    expect(await getAdminPage(workspaceId, "left", db)).toMatchObject({
      locked: true,
      coverUrl: "/media/cover.jpg",
      coverImages: ["/media/cover.jpg"],
    })
  })

  it("keeps the sky as a cover, and the pictures it had", async () => {
    expect(await getAdminPage(workspaceId, "left", db)).toMatchObject({ coverUrl: null, coverImages: [] })
    await setAdminPageCover(workspaceId, "left", { coverUrl: "sky", coverImages: ["/media/a.jpg", "/media/b.jpg"] }, db)
    expect(await getAdminPage(workspaceId, "left", db)).toMatchObject({
      coverUrl: "sky",
      coverImages: ["/media/a.jpg", "/media/b.jpg"],
    })
  })
})
