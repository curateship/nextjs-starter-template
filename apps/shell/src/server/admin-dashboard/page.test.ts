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

/** The Admin dashboard's left and right pages, against a real database. */
describe("the Admin pages", () => {
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

  it("starts the left page with the Plans block and the right page empty", async () => {
    const left = await getAdminPage(workspaceId, "left", db)
    expect(typesOf(left.body)).toEqual(["noteAdminPlans", "paragraph"])
    expect(left).toMatchObject({ locked: false, coverUrl: null })
    expect(typesOf((await getAdminPage(workspaceId, "right", db)).body)).toEqual(["paragraph"])
  })

  it("keeps its own blocks and words, drops a block it does not know, and keeps an emptied page empty", async () => {
    await saveAdminPageBody(
      workspaceId,
      "right",
      JSON.stringify({
        type: "doc",
        content: [
          { type: "noteAdminTopPages" },
          { type: "noteCrmStages" },
          { type: "paragraph", content: [{ type: "text", text: "Check spend on Mondays" }] },
        ],
      }),
      db
    )
    expect(typesOf((await getAdminPage(workspaceId, "right", db)).body)).toEqual(["noteAdminTopPages", "paragraph"])

    await saveAdminPageBody(workspaceId, "left", JSON.stringify({ type: "doc", content: [] }), db)
    expect(typesOf((await getAdminPage(workspaceId, "left", db)).body)).toEqual(["paragraph"])
  })

  it("keeps each page's lock and cover to itself", async () => {
    await setAdminPageLock(workspaceId, "left", true, db)
    await setAdminPageCover(workspaceId, "right", "/media/cover.jpg", db)
    await expect(
      saveAdminPageBody(workspaceId, "left", JSON.stringify({ type: "doc", content: [] }), db)
    ).rejects.toThrow(ADMIN_PAGE_LOCKED)

    expect(await getAdminPage(workspaceId, "left", db)).toMatchObject({ locked: true, coverUrl: null })
    expect(await getAdminPage(workspaceId, "right", db)).toMatchObject({ locked: false, coverUrl: "/media/cover.jpg" })
    await saveAdminPageBody(workspaceId, "right", JSON.stringify({ type: "doc", content: [] }), db)
  })
})
