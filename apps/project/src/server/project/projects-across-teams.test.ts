import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { createLabel, updateLabel } from "@/server/project/labels"
import {
  addProjectMember,
  createProject,
  loadProjectPage,
  loadProjectsPage,
} from "@/server/project/projects"
import { searchTasks } from "@/server/project/search"
import { createTaskType, updateTaskType } from "@/server/project/task-types"
import { createTask } from "@/server/project/tasks"
import { insertSiteAdmin, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * The Teams dashboard, part 1 and 4 (workspace/tasks/Admin/02-teams-dashboard.md).
 * Tyler, 19 Oct 2026: no team dropdown, and "Admin sees all project". The site
 * admin is on no team, so each page names its team: a project its own, the
 * Task types page its filter's. The Projects dashboard and the header search
 * cover every team.
 */

let client: PGlite
let database: CustomShellDb
let tyler: CustomShellUser
let ben: CustomShellUser
let olga: CustomShellUser
let acme: string
let beta: string
let site: string
let shop: string

const project = (name: string) => ({ name, color: "blue" as const, description: "" })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  tyler = await insertSiteAdmin(database)
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  olga = await insertUser(database, { name: "Olga", email: "olga@example.test" })
  acme = (await startTeam(database, [ben], { name: "Acme", admin: tyler })).team.id
  beta = (await startTeam(database, [olga], { name: "Beta", admin: tyler })).team.id
  site = (await inTeam(acme, () => createProject(tyler.id, project("Site"), database))).id
  shop = (await inTeam(beta, () => createProject(tyler.id, project("Shop"), database))).id
})

afterEach(async () => {
  await client.close()
})

describe("a project page names its own team", () => {
  it("loads each project's own team's labels and task types, one after the other", async () => {
    await inTeam(acme, () => createLabel(tyler.id, { name: "Client", color: "pink" }, database))
    await inTeam(beta, () => createLabel(tyler.id, { name: "Bug", color: "red" }, database))
    await inTeam(acme, () => createTaskType(tyler.id, { name: "Video", icon: "video", color: "red" }, database))
    await inTeam(beta, () => createTaskType(tyler.id, { name: "Research", icon: "search", color: "blue" }, database))

    const first = await loadProjectPage(tyler.id, site, database)
    expect(first.labels.map((label) => label.name)).toEqual(["Client"])
    expect(first.taskTypes.map((type) => type.name)).toEqual(["Video"])
    const second = await loadProjectPage(tyler.id, shop, database)
    expect(second.labels.map((label) => label.name)).toEqual(["Bug"])
    expect(second.taskTypes.map((type) => type.name)).toEqual(["Research"])
    // A page naming another team changes nothing: the project decides.
    expect((await inTeam(acme, () => loadProjectPage(tyler.id, shop, database))).labels.map((l) => l.name)).toEqual([
      "Bug",
    ])
  })

  it("keeps an employee out of another team's project whatever a request names", async () => {
    await expect(inTeam(beta, () => loadProjectPage(ben.id, shop, database))).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })

  it("changes a label or type in its own team without the page naming it", async () => {
    const label = await inTeam(beta, () => createLabel(tyler.id, { name: "Bug", color: "red" }, database))
    await updateLabel(tyler.id, { labelId: label.id, name: "Defect" }, database)
    const type = await inTeam(beta, () =>
      createTaskType(tyler.id, { name: "Research", icon: "search", color: "blue" }, database)
    )
    await updateTaskType(tyler.id, { typeId: type.id, name: "Study" }, database)

    const page = await loadProjectPage(tyler.id, shop, database)
    expect(page.labels.map((l) => l.name)).toEqual(["Defect"])
    expect(page.taskTypes.map((t) => t.name)).toEqual(["Study"])
  })

  it("refuses a team-wide change from the site admin when no team is named", async () => {
    await expect(createProject(tyler.id, project("Nowhere"), database)).rejects.toThrow(PROJECT_ERRORS.noTeamNamed)
    await expect(createLabel(tyler.id, { name: "Loose", color: "red" }, database)).rejects.toThrow(
      PROJECT_ERRORS.noTeamNamed
    )
  })
})

describe("the Projects dashboard", () => {
  it("lists every team's projects for the site admin, each with its team, and narrows with the filter", async () => {
    const all = await loadProjectsPage(tyler.id, database)
    expect(all.siteAdmin).toBe(true)
    expect(all.teams.map((team) => team.name)).toEqual(["Acme", "Beta"])
    expect(all.teamFilter).toBeNull()
    expect(all.projects.map((row) => [row.name, row.team.name])).toEqual([
      ["Shop", "Beta"],
      ["Site", "Acme"],
    ])

    const onlyBeta = await loadProjectsPage(tyler.id, database, beta)
    expect(onlyBeta.teamFilter).toBe(beta)
    expect(onlyBeta.projects.map((row) => row.name)).toEqual(["Shop"])
    // A team that doesn't exist shows every team rather than nothing.
    expect((await loadProjectsPage(tyler.id, database, "gone")).projects).toHaveLength(2)
  })

  it("shows an employee their own team's projects and no other team", async () => {
    await addProjectMember(tyler.id, site, ben.id, database)
    const page = await loadProjectsPage(ben.id, database, beta)
    expect(page.siteAdmin).toBe(false)
    expect(page.teams).toEqual([])
    expect(page.team?.name).toBe("Acme")
    expect(page.projects.map((row) => row.name)).toEqual(["Site"])
  })

  it("offers New project in the team the site admin picks, and refuses one that doesn't exist", async () => {
    const made = await inTeam(beta, () => createProject(tyler.id, project("Launch"), database))
    expect(
      (await loadProjectsPage(tyler.id, database, beta)).projects.map((row) => row.name).sort()
    ).toEqual(["Launch", "Shop"])
    expect((await loadProjectPage(tyler.id, made.id, database)).project.teamId).toBe(beta)
    await expect(inTeam("gone", () => createProject(tyler.id, project("Lost"), database))).rejects.toThrow(
      PROJECT_ERRORS.noTeamNamed
    )
  })
})

describe("the header search", () => {
  it("covers every team for the site admin and only their own for an employee", async () => {
    const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })
    const task = (projectId: string, title: string) => ({
      projectId,
      title,
      notes: "",
      assigneeUserId: null,
      dueDate: null,
      steps: [],
    })
    await createTask(actor(tyler), task(site, "Logo for Acme"), database)
    await createTask(actor(tyler), task(shop, "Logo for Beta"), database)
    const titles = async (userId: string) => (await searchTasks(userId, "logo", database)).map((hit) => hit.title).sort()
    expect(await titles(tyler.id)).toEqual(["Logo for Acme", "Logo for Beta"])
    await addProjectMember(tyler.id, shop, olga.id, database)
    expect(await titles(olga.id)).toEqual(["Logo for Beta"])
  })
})
