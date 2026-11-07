import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addDays, localNow } from "@/lib/project/days"
import { adminPageSchema, PERSONAL_PROJECT_ID, updateProjectSchema } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import {
  FINISHED_DAYS,
  loadAdminDashboard,
  setAdminPage,
  setAdminPageLock,
  setAdminStatusOrder,
  setAdminTimeZone,
} from "@/server/project/admin-dashboard"
import { createInvite } from "@/server/project/invites"
import { askForMoreTime } from "@/server/project/more-time"
import { addProjectMember, createProject, loadProjectsPage } from "@/server/project/projects"
import { listTeamNames } from "@/server/project/record-team"
import { projectSavedViewScreens } from "@/server/project/saved-views"
import { projectProjects, projectTasks, projectTeams } from "@/server/project/schema"
import { moveTask } from "@/server/project/task-changes"
import { assignTask, createTask, loadTaskDetail, setTaskStatus } from "@/server/project/tasks"
import { listTeams } from "@/server/project/teams"
import { insertSiteAdmin, startTeam } from "@/server/project/test-people"
import { loadMyDays } from "@/server/project/task-reminders"
import { saveSavedView } from "@/server/saved-views"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * The site admin's My dashboard (workspace/tasks/Admin/03-admin-dashboard.md).
 * Tyler, 23 Oct 2026: "Admin dashboard should have tasks that are assigned to
 * me and personal tasks", his own list on no team, and (since 6 Nov 2026) a
 * Need your attention tab and Projects blocks counting across every team.
 *
 * 2 March 2099 is a Monday; both teams are on UTC.
 */
const MONDAY = "2099-03-02"
const NOON = new Date(`${MONDAY}T12:00:00Z`)
/**
 * A day counted from the real today, for the Need your attention tab: a task
 * made now and read in 2099 would count as untouched for years.
 */
const inDays = (days: number) => addDays(localNow(new Date(), "UTC").day, days)

let client: PGlite
let database: CustomShellDb
let tyler: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let acme: string
let brand: string
let website: string
let logo: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name, currentWorkspaceId: user.currentWorkspaceId })

function task(projectId: string, title: string, assigneeUserId: string | null, dueDate: string | null = null) {
  return { projectId, title, notes: "", assigneeUserId, dueDate }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  tyler = await insertSiteAdmin(database)
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  acme = (await startTeam(database, [ben], { name: "Acme", admin: tyler })).team.id
  brand = (await startTeam(database, [carla], { name: "Brand", admin: tyler })).team.id
  website = (await inTeam(acme, () => createProject(tyler.id, { name: "Website", color: "blue" }, database))).id
  logo = (await inTeam(brand, () => createProject(tyler.id, { name: "Logo", color: "red" }, database))).id
  await addProjectMember(tyler.id, website, ben.id, database)
  await addProjectMember(tyler.id, logo, carla.id, database)
  await setAdminTimeZone(tyler.id, "UTC", database)
})

afterEach(async () => {
  await client.close()
})

describe("his own list", () => {
  it("lives on no team: not on Teams, not on Projects, and on My dashboard as Just me", async () => {
    const { id } = await createTask(actor(tyler), task(PERSONAL_PROJECT_ID, "Send the contract", tyler.id), database)
    const [row] = await database
      .select({ teamId: projectProjects.teamId, personalUserId: projectProjects.personalUserId })
      .from(projectTasks)
      .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
      .where(eq(projectTasks.id, id))
    expect(row.personalUserId).toBe(tyler.id)
    const [space] = await database.select().from(projectTeams).where(eq(projectTeams.id, row.teamId))
    expect(space.personalUserId).toBe(tyler.id)

    expect((await listTeamNames(database)).map((team) => team.name)).toEqual(["Acme", "Brand"])
    expect((await listTeams(tyler.id, database)).map((team) => team.name)).toEqual(["Acme", "Brand"])
    expect((await loadProjectsPage(tyler.id, database)).projects.map((project) => project.name).sort()).toEqual([
      "Logo",
      "Website",
    ])
    const dashboard = await loadAdminDashboard(tyler.id, database, NOON)
    expect(dashboard.tasks.map((card) => [card.title, card.projectName])).toEqual([["Send the contract", "Just me"]])
  })

  it("makes one space however many tasks go in it", async () => {
    await createTask(actor(tyler), task(PERSONAL_PROJECT_ID, "One", tyler.id), database)
    await createTask(actor(tyler), task(PERSONAL_PROJECT_ID, "Two", tyler.id), database)
    const spaces = await database.select().from(projectTeams).where(eq(projectTeams.personalUserId, tyler.id))
    expect(spaces).toHaveLength(1)
  })

  it("moves a task to any team's project, named with its team", async () => {
    const { id } = await createTask(actor(tyler), task(PERSONAL_PROJECT_ID, "Brief the designer", tyler.id), database)
    const detail = await loadTaskDetail(tyler.id, id, database)
    expect(detail.moveTargets.map((target) => target.name)).toEqual(["Acme · Website", "Brand · Logo"])
    expect(await moveTask(actor(tyler), { taskId: id, projectId: logo }, database)).toEqual({ keptAssignee: true })
    const dashboard = await loadAdminDashboard(tyler.id, database, NOON)
    expect(dashboard.tasks.map((card) => card.projectName)).toEqual(["Brand · Logo"])
  })
})

describe("the middle", () => {
  it("mixes every team's tasks handed to him with his own, each naming its team", async () => {
    await inTeam(acme, () => createTask(actor(tyler), task(website, "Review the copy", tyler.id), database))
    await inTeam(brand, () => createTask(actor(tyler), task(logo, "Review the logo", tyler.id), database))
    await inTeam(brand, () => createTask(actor(tyler), task(logo, "Carla's", carla.id), database))
    await createTask(actor(tyler), task(PERSONAL_PROJECT_ID, "Mine", tyler.id), database)
    const dashboard = await loadAdminDashboard(tyler.id, database, NOON)
    expect(dashboard.tasks.map((card) => `${card.title} (${card.projectName})`).sort()).toEqual([
      "Mine (Just me)",
      "Review the copy (Acme · Website)",
      "Review the logo (Brand · Logo)",
    ])
    expect(dashboard.projectTeams[website]).toBe(acme)
    // The table's Project chip, without the team.
    expect(dashboard.projectInfo[website]).toEqual({ name: "Website", color: "blue", teamName: "Acme", movable: true })
    const own = dashboard.tasks.find((card) => card.title === "Mine")!
    expect(dashboard.projectInfo[own.projectId]).toEqual({ name: "Just me", color: "slate", teamName: null, movable: false })
  })

  it("keeps his own Board order and time zone, and counts today in it", async () => {
    await setAdminStatusOrder(tyler.id, ["done", "todo", "doing", "stuck"], database)
    await setAdminTimeZone(tyler.id, "Pacific/Auckland", database)
    const dashboard = await loadAdminDashboard(tyler.id, database, new Date(`${MONDAY}T20:00:00Z`))
    expect(dashboard.statusOrder).toEqual(["done", "todo", "doing", "stuck", "archived"])
    // 8pm in London on Monday is Tuesday morning in Auckland.
    expect(dashboard.today).toBe("2099-03-03")
  })

  it("starts with no zone saved, counting in UTC until the browser's is saved", async () => {
    const other = await insertSiteAdmin(database, { name: "Other" })
    const dashboard = await loadAdminDashboard(other.id, database, NOON)
    expect(dashboard.savedZone).toBeNull()
    expect(dashboard.zone).toBe("UTC")
  })

  it("is the site admin's alone", async () => {
    await expect(loadAdminDashboard(ben.id, database, NOON)).rejects.toThrow()
    await expect(setAdminTimeZone(ben.id, "UTC", database)).rejects.toThrow()
    await expect(setAdminPage(ben.id, "", database)).rejects.toThrow()
  })

  it("keeps his own page under the sky, as the save sends it, and an emptied one as nothing", async () => {
    expect((await loadAdminDashboard(tyler.id, database, NOON)).page).toBe("")
    const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ship the redesign" }] }] }
    // Through the same check the save goes through, as the browser sends it.
    await setAdminPage(tyler.id, adminPageSchema.parse({ notes: body }).notes, database)
    expect((await loadAdminDashboard(tyler.id, database, NOON)).page).toContain("Ship the redesign")
    await setAdminPage(tyler.id, adminPageSchema.parse({ notes: { type: "doc", content: [{ type: "paragraph" }] } }).notes, database)
    expect((await loadAdminDashboard(tyler.id, database, NOON)).page).toBe("")
  })

  it("refuses changes to his page while it is locked, until he unlocks it", async () => {
    const body = (text: string) =>
      adminPageSchema.parse({ notes: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }).notes
    await setAdminPage(tyler.id, body("Before the lock"), database)
    await setAdminPageLock(tyler.id, true, database)
    expect((await loadAdminDashboard(tyler.id, database, NOON)).pageLocked).toBe(true)
    await expect(setAdminPage(tyler.id, body("While locked"), database)).rejects.toThrow("Your page is locked")
    expect((await loadAdminDashboard(tyler.id, database, NOON)).page).toContain("Before the lock")
    await setAdminPageLock(tyler.id, false, database)
    await setAdminPage(tyler.id, body("After the lock"), database)
    expect((await loadAdminDashboard(tyler.id, database, NOON)).page).toContain("After the lock")
    await expect(setAdminPageLock(ben.id, true, database)).rejects.toThrow()
  })

  it("keeps views under his own id, which nobody else can use", async () => {
    const screens = projectSavedViewScreens
    const view = await saveSavedView(
      tyler.id,
      { screen: `admin-tasks:${tyler.id}`, name: "High", filters: { priority: "high" } },
      database,
      screens
    )
    expect(view.name).toBe("High")
    const other = await insertSiteAdmin(database, { name: "Other" })
    await expect(
      saveSavedView(other.id, { screen: `admin-tasks:${tyler.id}`, name: "Mine", filters: { priority: "high" } }, database, screens)
    ).rejects.toThrow()
  })
})

describe("quick due dates", () => {
  // He is on no team, so Today and Tomorrow use his own zone and Monday to Friday.
  it("works out his days without a team", async () => {
    await setAdminTimeZone(tyler.id, "Pacific/Auckland", database)
    expect(await loadMyDays(tyler.id, database)).toEqual({
      zone: "Pacific/Auckland",
      workDays: [1, 2, 3, 4, 5],
      holidays: [],
    })
  })
})

describe("the Need your attention tab", () => {
  it("lists asks for more time that fall to him under Waiting on you, with who asked, the day and why", async () => {
    const mine = (
      await inTeam(acme, () => createTask(actor(tyler), task(website, "Homepage copy", ben.id, "2099-03-04"), database))
    ).id
    await askForMoreTime(actor(ben), { taskId: mine, day: "2099-03-06", reason: "Waiting on photos" }, database)
    // Ben's own task: nobody else handed it out, so it falls to the site admin too.
    const bens = (await createTask(actor(ben), task(website, "Ben's own", ben.id, "2099-03-04"), database)).id
    await askForMoreTime(actor(ben), { taskId: bens, day: "2099-03-05", reason: "Busy" }, database)
    const { attention } = await loadAdminDashboard(tyler.id, database, NOON)
    expect(attention.tasks.map((card) => [card.title, card.projectName, attention.heading[card.id]])).toEqual([
      ["Homepage copy", "Acme · Website", "waiting"],
      ["Ben's own", "Acme · Website", "waiting"],
    ])
    expect(attention.asks[mine]).toEqual({ askedByName: "Ben", day: "2099-03-06", reason: "Waiting on photos" })
  })

  it("leaves an ask whose hander can still answer it out of Waiting on you", async () => {
    const sent = await inTeam(acme, () => createInvite(actor(tyler), { email: "dan@example.test" }, database))
    await addProjectMember(tyler.id, website, sent.userId, database)
    const dan = { id: sent.userId, name: "Dan", currentWorkspaceId: null }
    const handed = (await createTask(dan, task(website, "From Dan", ben.id, inDays(2)), database)).id
    await askForMoreTime(actor(ben), { taskId: handed, day: inDays(4), reason: "More time" }, database)
    const { attention } = await loadAdminDashboard(tyler.id, database, new Date())
    expect(attention.asks).toEqual({})
    // Still due this week, so it shows there instead.
    expect(attention.heading[handed]).toBe("due")
  })

  it("lists tasks with nobody on them with whom Hand to offers, and drops one once handed out", async () => {
    const loose = (await inTeam(acme, () => createTask(actor(tyler), task(website, "Fix the footer", null), database))).id
    const before = (await loadAdminDashboard(tyler.id, database, new Date())).attention
    expect(before.heading[loose]).toBe("unassigned")
    expect(before.handTo[loose].map((person) => person.name)).toEqual(["Ben", "Tyler"])
    await assignTask(actor(tyler), { taskId: loose, assigneeUserId: ben.id }, database)
    const after = (await loadAdminDashboard(tyler.id, database, new Date())).attention
    expect(after.tasks.map((card) => card.id)).not.toContain(loose)
    expect(after.handTo).toEqual({})
  })

  it("puts each task under its first heading only: Stuck, Overdue, then Due this week, across every team", async () => {
    const stuck = (await inTeam(acme, () => createTask(actor(tyler), task(website, "Blocked copy", ben.id, inDays(2)), database))).id
    await setTaskStatus(actor(ben), { taskId: stuck, status: "stuck", stuckReason: "No photos" }, database)
    const late = (await inTeam(brand, () => createTask(actor(tyler), task(logo, "Late sketch", carla.id, inDays(-3)), database))).id
    const soon = (await inTeam(acme, () => createTask(actor(tyler), task(website, "Due Wednesday", ben.id, inDays(2)), database))).id
    await inTeam(acme, () => createTask(actor(tyler), task(website, "Due next month", ben.id, inDays(40)), database))
    const { attention } = await loadAdminDashboard(tyler.id, database, new Date())
    expect(attention.tasks.map((card) => [card.title, attention.heading[card.id]])).toEqual([
      ["Blocked copy", "stuck"],
      ["Late sketch", "overdue"],
      ["Due Wednesday", "due"],
    ])
    expect(new Set(attention.tasks.map((card) => card.id)).size).toBe(attention.tasks.length)
    expect([stuck, late, soon].every((id) => attention.heading[id])).toBe(true)
  })
})

describe("the Projects blocks", () => {
  it("names every open project's people and counts what got finished today, pinned or not", async () => {
    const done = (await inTeam(acme, () => createTask(actor(tyler), task(website, "Hero image", ben.id), database))).id
    await setTaskStatus(actor(ben), { taskId: done, status: "done", stuckReason: null }, database)

    const dashboard = await loadAdminDashboard(tyler.id, database, new Date())
    expect(dashboard.projects.map((project) => project.name)).toEqual(["Logo", "Website"])
    expect(dashboard.projectCards.people[website]).toEqual({ faces: [{ id: ben.id, name: "Ben", avatarUrl: "" }], total: 1 })
    expect(dashboard.projectCards.people[logo]).toEqual({ faces: [{ id: carla.id, name: "Carla", avatarUrl: "" }], total: 1 })
    expect(dashboard.projectCards.finished[website]).toHaveLength(FINISHED_DAYS)
    expect(dashboard.projectCards.finished[website].at(-1)).toBe(1)
  })

  it("stay on his page, with the Daily card and rating blocks, while a project's page drops all four", async () => {
    const body = {
      type: "doc",
      content: [
        { type: "noteProject", attrs: { projectId: website } },
        { type: "noteHabit", attrs: { habitId: "habit-1" } },
        { type: "noteRatingMonth" },
        { type: "noteRatingTrend" },
        // Not filled in yet, so never saved.
        { type: "noteProject", attrs: { projectId: null } },
      ],
    }
    await setAdminPage(tyler.id, adminPageSchema.parse({ notes: body }).notes, database)
    const page = JSON.parse((await loadAdminDashboard(tyler.id, database, NOON)).page)
    expect(page.content).toEqual([
      { type: "noteProject", attrs: { projectId: website } },
      // The Daily card holds nothing; a habit's id from before 6 Nov 2026 is dropped.
      { type: "noteHabit" },
      { type: "noteRatingMonth" },
      { type: "noteRatingTrend" },
    ])
    expect(updateProjectSchema.parse({ projectId: website, notes: body }).notes).toBe("")
  })
})

describe("Just me from the Project chip", () => {
  it("moves a team task he is doing into his own list, made then, and nobody else's", async () => {
    const { id } = await inTeam(acme, () => createTask(actor(tyler), task(website, "Mine now", tyler.id), database))
    await moveTask(actor(tyler), { taskId: id, projectId: PERSONAL_PROJECT_ID }, database)
    const dashboard = await loadAdminDashboard(tyler.id, database, NOON)
    expect(dashboard.tasks.map((card) => [card.title, card.projectName])).toEqual([["Mine now", "Just me"]])

    // Ben's task stays shared: a task someone else is doing never goes into his list.
    const bens = (await inTeam(acme, () => createTask(actor(tyler), task(website, "Ben's", ben.id), database))).id
    await expect(moveTask(actor(tyler), { taskId: bens, projectId: dashboard.tasks[0].projectId }, database)).rejects.toThrow()
  })
})

describe("moving to another team from the Project chip", () => {
  it("puts the task in the other team's project", async () => {
    const { id } = await inTeam(acme, () => createTask(actor(tyler), task(website, "Cross over", tyler.id), database))
    await moveTask(actor(tyler), { taskId: id, projectId: logo }, database)
    const [card] = (await loadAdminDashboard(tyler.id, database, NOON)).tasks
    expect([card.title, card.projectName]).toEqual(["Cross over", "Brand · Logo"])
  })
})
