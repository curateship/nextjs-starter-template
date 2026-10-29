import { PGlite } from "@electric-sql/pglite"
import { count, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { onTeamHref } from "@/lib/project/notices"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { deleteLabel } from "@/server/project/labels"
import { createProject, setProjectArchived } from "@/server/project/projects"
import * as schema from "@/server/project/schema"
import { createTeam, deleteTeam, listTeams } from "@/server/project/teams"
import { insertSiteAdmin, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * The Teams dashboard (workspace/tasks/Admin/02-teams-dashboard.md). Tyler,
 * 19 Oct 2026: "There should be a team dashboard to create, edit and delete
 * teams and there should be no team dropdown in the navigation."
 */

let client: PGlite
let database: CustomShellDb
let tyler: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  tyler = await insertSiteAdmin(database)
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
})

afterEach(async () => {
  await client.close()
})

/** Every table that holds a team's rows, by its `team_id`. */
const TEAM_TABLES = [
  schema.projectAnnouncementViews,
  schema.projectCheckins,
  schema.projectLabels,
  schema.projectMeetings,
  schema.projectProjects,
  schema.projectSavedViews,
  schema.projectStepLists,
  schema.projectTaskFiles,
  schema.projectTaskTypes,
  schema.projectTeamHolidays,
  schema.projectTeamJoins,
  schema.projectTeamMembers,
  schema.projectTeamMorningNotices,
  schema.projectTimeOff,
] as const

async function rowsLeft(teamId: string) {
  let left = 0
  for (const table of TEAM_TABLES) {
    const [row] = await database.select({ n: count() }).from(table).where(eq(table.teamId, teamId))
    left += Number(row.n)
  }
  return left
}

function project(name: string) {
  return { name, color: "blue" as const, description: "" }
}

describe("the Teams dashboard", () => {
  it("lists every team by name with its people and projects, for the site admin alone", async () => {
    const acme = (await startTeam(database, [ben], { admin: tyler })).team
    await createTeam(tyler.id, { name: "Beta", timeZone: "UTC" }, database)
    const site = await inTeam(acme.id, () => createProject(tyler.id, project("Site"), database))
    const old = await inTeam(acme.id, () => createProject(tyler.id, project("Old"), database))
    await setProjectArchived(tyler.id, old.id, true, database)

    const teams = await listTeams(tyler.id, database)
    expect(teams.map((team) => team.name)).toEqual(["Acme", "Beta"])
    expect(teams[0]).toMatchObject({ people: 1, openProjects: 1, archivedProjects: 1 })
    expect(teams[1]).toMatchObject({ people: 0, openProjects: 0, archivedProjects: 0 })
    expect(site.id).toBeTruthy()
    await expect(listTeams(ben.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
  })
})

describe("deleting a team", () => {
  it("is refused while anyone is on it or a project is open", async () => {
    const acme = (await startTeam(database, [ben], { admin: tyler })).team
    await expect(deleteTeam(tyler.id, acme.id, database)).rejects.toThrow(PROJECT_ERRORS.teamNotEmpty)

    const beta = await createTeam(tyler.id, { name: "Beta", timeZone: "UTC" }, database)
    await inTeam(beta.id, () => createProject(tyler.id, project("Live"), database))
    await expect(deleteTeam(tyler.id, beta.id, database)).rejects.toThrow(PROJECT_ERRORS.teamNotEmpty)
    expect((await listTeams(tyler.id, database)).map((team) => team.name)).toEqual(["Acme", "Beta"])
  })

  it("takes an empty team and everything left in it, archived projects included", async () => {
    const beta = await createTeam(tyler.id, { name: "Beta", timeZone: "UTC" }, database)
    const old = await inTeam(beta.id, () => createProject(tyler.id, project("Old"), database))
    await setProjectArchived(tyler.id, old.id, true, database)
    expect(await rowsLeft(beta.id)).toBeGreaterThan(0)

    await deleteTeam(tyler.id, beta.id, database)
    expect(await rowsLeft(beta.id)).toBe(0)
    expect(await listTeams(tyler.id, database)).toEqual([])
  })

  it("is the site admin's alone, and says so for a team that is gone", async () => {
    const beta = await createTeam(tyler.id, { name: "Beta", timeZone: "UTC" }, database)
    await expect(deleteTeam(ben.id, beta.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    await deleteTeam(tyler.id, beta.id, database)
    await expect(deleteTeam(tyler.id, beta.id, database)).rejects.toThrow(PROJECT_ERRORS.teamNotFound)
  })
})

describe("a team's own records", () => {
  it("tell an employee only that the site admin changes them, whether or not one exists", async () => {
    await startTeam(database, [ben], { admin: tyler })
    await expect(deleteLabel(ben.id, "no-such-label", database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    await expect(deleteLabel(tyler.id, "no-such-label", database)).rejects.toThrow(PROJECT_ERRORS.labelNotFound)
  })
})

describe("a site admin's notice", () => {
  it("opens a team page as that team's own page, and anything else as it is", () => {
    expect(onTeamHref("t1", "/team")).toBe("/teams/t1")
    expect(onTeamHref("t1", "/team?day=2099-03-02")).toBe("/teams/t1?day=2099-03-02")
    expect(onTeamHref("t1", "/team/members")).toBe("/teams/t1/members")
    expect(onTeamHref("t1", "/projects/p1")).toBe("/projects/p1")
    expect(onTeamHref("t1", "/teams/t2")).toBe("/teams/t2")
  })
})
