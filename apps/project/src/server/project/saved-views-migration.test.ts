import { readFile } from "node:fs/promises"

import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { addProjectMember } from "@/server/project/projects"
import { listSavedViews } from "@/server/project/saved-views"
import { projectSavedViews } from "@/server/project/schema"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { createTestDatabase } from "@/server/test-support"

/*
 * drizzle/0129 copies Project's own saved views into the shell's saved_views
 * table (20 Oct 2026). The test database has already run it on an empty table,
 * so the rows are written to the old table first and the file is run again,
 * the way it runs on a database that has views.
 */

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const copyViews = async () =>
  client.exec(
    await readFile(new URL("../../../drizzle/0129_project_saved_views_to_shell.sql", import.meta.url), "utf8")
  )

describe("moving Project's saved views into the shell", () => {
  it("keeps every view, on its project or on My tasks, and copies nothing twice", async () => {
    const anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
    const ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
    const { admin, team } = await startTeam(database, [anna, ben])
    const website = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
    await addProjectMember(admin.id, website, ben.id, database)
    const created = new Date("2099-03-02T09:00:00.000Z")
    await database.insert(projectSavedViews).values([
      {
        id: "view-1",
        teamId: team.id,
        userId: anna.id,
        projectId: website,
        name: "Ben's stuck tasks",
        filters: { status: "stuck", person: ben.id },
        names: { person: "Ben" },
        createdAt: created,
      },
      {
        id: "view-2",
        teamId: team.id,
        userId: anna.id,
        projectId: null,
        name: "Doing",
        filters: { status: "doing" },
        names: {},
        createdAt: created,
      },
    ])

    await copyViews()
    await copyViews()

    expect(await listSavedViews(anna.id, team.id, website, database)).toEqual([
      {
        id: "view-1",
        name: "Ben's stuck tasks",
        filters: { status: "stuck", person: ben.id },
        names: { person: "Ben" },
      },
    ])
    expect(await listSavedViews(anna.id, team.id, null, database)).toEqual([
      { id: "view-2", name: "Doing", filters: { status: "doing" }, names: {} },
    ])
    expect(await listSavedViews(ben.id, team.id, website, database)).toEqual([])
  })
})
