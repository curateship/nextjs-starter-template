import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { VIRAL_FOLDERS_NODE, VIRAL_PAGE_ERRORS, VIRAL_PROJECTS_NODE, VIRAL_SECTIONS_NODE } from "@/lib/viral/dashboard-page"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  getViralPage,
  getViralWidgets,
  saveViralPageBody,
  saveViralSections,
  saveViralWidgets,
  setViralPageLock,
} from "@/server/viral/dashboard-page"
import { archiveViralProjects, createViralFolder, createViralProject } from "@/server/viral/projects"

/**
 * The Viral dashboard's left page (task features/03) against a real
 * database with every migration replayed, so this also proves 0129 applies.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const types = (body: string) => (JSON.parse(body).content as { type: string }[]).map((node) => node.type)

describe("the dashboard's left page", () => {
  it("starts with Dashboards, Projects and Folders", async () => {
    const { page } = await getViralPage(user.id)
    expect(types(page.body).slice(0, 3)).toEqual([VIRAL_SECTIONS_NODE, VIRAL_PROJECTS_NODE, VIRAL_FOLDERS_NODE])
    expect(page.locked).toBe(false)
  })

  it("puts the Dashboards block back at the top and drops a second one", async () => {
    await saveViralPageBody(
      user.id,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] })
    )
    expect(types((await getViralPage(user.id)).page.body)[0]).toBe(VIRAL_SECTIONS_NODE)

    await saveViralPageBody(
      user.id,
      JSON.stringify({ type: "doc", content: [{ type: VIRAL_SECTIONS_NODE }, { type: "paragraph" }, { type: VIRAL_SECTIONS_NODE }] })
    )
    expect(types((await getViralPage(user.id)).page.body).filter((type) => type === VIRAL_SECTIONS_NODE)).toHaveLength(1)
  })

  it("keeps each person's page their own", async () => {
    await saveViralPageBody(user.id, JSON.stringify({ type: "doc", content: [{ type: VIRAL_SECTIONS_NODE }] }))
    expect(types((await getViralPage(user.id)).page.body)).not.toContain(VIRAL_PROJECTS_NODE)
    expect(types((await getViralPage(other.id)).page.body)).toContain(VIRAL_PROJECTS_NODE)
  })

  it("refuses a save while the page is locked", async () => {
    await setViralPageLock(user.id, true)
    await expect(saveViralPageBody(user.id, JSON.stringify({ type: "doc", content: [] }))).rejects.toThrow(
      VIRAL_PAGE_ERRORS.locked
    )
  })

  it("keeps the hidden rows and their order, never Overview", async () => {
    await saveViralSections(user.id, { hidden: ["formats", "overview" as never], order: ["vault", "projects", "vault"] })
    const { sections } = await getViralPage(user.id)
    expect(sections).toEqual({ hidden: ["formats"], order: ["vault", "projects"] })
  })

  it("starts Overview with the two widgets side by side, and keeps a change", async () => {
    expect((await getViralWidgets(user.id)).top.spots).toEqual(["new-and-rising", "vault-by-status"])
    await saveViralWidgets(user.id, { top: { columns: 1, spots: ["vault-by-status"] }, bottom: { columns: 0, spots: [] } })
    expect((await getViralWidgets(user.id)).top).toEqual({ columns: 1, spots: ["vault-by-status"] })
  })
})

describe("the left page's figures", () => {
  it("counts projects that aren't archived, and each folder's", async () => {
    const folder = await createViralFolder(user.id, "Fitness")
    await createViralProject(user.id, { name: "Gym tips", description: "", keywords: [], folderId: folder.id })
    const loose = await createViralProject(user.id, { name: "Desk stretches", description: "", keywords: [], folderId: null })
    const gone = await createViralProject(user.id, { name: "Old one", description: "", keywords: [], folderId: null })
    await archiveViralProjects(user.id, [gone.id], true)
    await createViralProject(other.id, { name: "Someone else's", description: "", keywords: [], folderId: null })

    const figures = await getViralPage(user.id)
    expect(figures.counts.projects).toBe(2)
    expect(figures.projects.map((project) => project.name)).toEqual(["Desk stretches", "Gym tips"])
    expect(figures.folders).toEqual({
      all: 2,
      none: 1,
      archived: 1,
      rows: [{ id: folder.id, name: "Fitness", count: 1 }],
    })
    expect(figures.projects.find((project) => project.id === loose.id)).toMatchObject({ vaultCount: 0, hookCount: 0 })
  })
})
