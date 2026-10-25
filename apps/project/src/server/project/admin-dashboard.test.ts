import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { loadAdminDashboard, setAdminStatusOrder, setAdminTimeZone } from "@/server/project/admin-dashboard"
import { createInvite } from "@/server/project/invites"
import { createLabel } from "@/server/project/labels"
import { createMeeting } from "@/server/project/meetings"
import { createMilestone } from "@/server/project/milestones"
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
 * me and personal tasks", his own list on no team, and cards counting across
 * every team.
 *
 * 2 March 2099 is a Monday; both teams are on UTC.
 */
const MONDAY = "2099-03-02"
const NOON = new Date(`${MONDAY}T12:00:00Z`)

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
  return { projectId, title, notes: "", assigneeUserId, dueDate, steps: [] }
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
  website = (await inTeam(acme, () => createProject(tyler.id, { name: "Website", color: "blue", description: "" }, database))).id
  logo = (await inTeam(brand, () => createProject(tyler.id, { name: "Logo", color: "red", description: "" }, database))).id
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

describe("the cards", () => {
  it("lists asks for more time that fall to him, and not one someone else answers", async () => {
    const mine = (
      await inTeam(acme, () => createTask(actor(tyler), task(website, "Homepage copy", ben.id, "2099-03-04"), database))
    ).id
    await askForMoreTime(actor(ben), { taskId: mine, day: "2099-03-06", reason: "Waiting on photos" }, database)
    // Ben's own task: nobody else handed it out, so it falls to the site admin too.
    const bens = (await createTask(actor(ben), task(website, "Ben's own", ben.id, "2099-03-04"), database)).id
    await askForMoreTime(actor(ben), { taskId: bens, day: "2099-03-05", reason: "Busy" }, database)
    const dashboard = await loadAdminDashboard(tyler.id, database, NOON)
    expect(dashboard.cards.waiting.map((ask) => [ask.title, ask.askedByName, ask.day, ask.projectName])).toEqual([
      ["Homepage copy", "Ben", "2099-03-06", "Acme · Website"],
      ["Ben's own", "Ben", "2099-03-05", "Acme · Website"],
    ])
  })

  it("leaves out an ask whose hander can still answer it", async () => {
    const sent = await inTeam(acme, () => createInvite(actor(tyler), { email: "dan@example.test" }, database))
    await addProjectMember(tyler.id, website, sent.userId, database)
    const dan = { id: sent.userId, name: "Dan", currentWorkspaceId: null }
    const handed = (await createTask(dan, task(website, "From Dan", ben.id, "2099-03-04"), database)).id
    await askForMoreTime(actor(ben), { taskId: handed, day: "2099-03-06", reason: "More time" }, database)
    const dashboard = await loadAdminDashboard(tyler.id, database, NOON)
    expect(dashboard.cards.waiting).toEqual([])
  })

  it("lists tasks with nobody on them with whom Hand to offers, and hands one out", async () => {
    const loose = (await inTeam(acme, () => createTask(actor(tyler), task(website, "Fix the footer", null), database))).id
    const before = await loadAdminDashboard(tyler.id, database, NOON)
    expect(before.cards.unassigned.map((row) => [row.title, row.people.map((person) => person.name)])).toEqual([
      ["Fix the footer", ["Ben", "Tyler"]],
    ])
    await assignTask(actor(tyler), { taskId: loose, assigneeUserId: ben.id }, database)
    expect((await loadAdminDashboard(tyler.id, database, NOON)).cards.unassigned).toEqual([])
  })

  it("lists invites not taken, due this week, milestones, today's meetings and who finished what today", async () => {
    await inTeam(brand, () => createInvite(actor(tyler), { email: "eve@example.test" }, database))
    await inTeam(acme, () => createTask(actor(tyler), task(website, "Due Wednesday", ben.id, "2099-03-04"), database))
    await inTeam(acme, () => createTask(actor(tyler), task(website, "Due next month", ben.id, "2099-04-20"), database))
    await inTeam(brand, () => createMilestone(tyler.id, { projectId: logo, name: "First draft", dueDate: "2099-03-20" }, database))
    await inTeam(acme, () =>
      createMeeting(
        actor(tyler),
        {
          title: "Standup",
          color: "blue",
          day: MONDAY,
          startTime: "15:00",
          endTime: "15:15",
          repeatEvery: null,
          videoUrl: null,
          peopleIds: [ben.id],
        },
        database,
        NOON
      )
    )
    const done = (await inTeam(brand, () => createTask(actor(tyler), task(logo, "Sketches", carla.id), database))).id
    await setTaskStatus(actor(carla), { taskId: done, status: "done", stuckReason: null }, database)

    // Finished just now, so today is the real one.
    const { cards } = await loadAdminDashboard(tyler.id, database, new Date())
    expect(cards.doneToday.map((person) => [person.name, person.tasks.map((t) => t.title)])).toEqual([
      ["Carla", ["Sketches"]],
    ])
    const monday = await loadAdminDashboard(tyler.id, database, NOON)
    expect(monday.cards.invites.map((invite) => [invite.email, invite.teamName])).toEqual([["eve@example.test", "Brand"]])
    expect(monday.cards.milestones.map((row) => [row.name, row.projectName, row.openTasks])).toEqual([
      ["First draft", "Brand · Logo", 0],
    ])
    expect(monday.cards.dueThisWeek.map((card) => card.title)).toEqual(["Due Wednesday"])
    expect(monday.cards.meetings.map((meeting) => [meeting.title, meeting.teamName])).toEqual([["Standup", "Acme"]])
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
  it("takes the old team's tags off, since they belong to that team", async () => {
    const tag = await inTeam(acme, () => createLabel(tyler.id, { name: "Urgent", color: "red" }, database))
    const { id } = await inTeam(acme, () =>
      createTask(actor(tyler), { ...task(website, "Cross over", tyler.id), labelIds: [tag.id] }, database)
    )
    await moveTask(actor(tyler), { taskId: id, projectId: logo }, database)
    const [card] = (await loadAdminDashboard(tyler.id, database, NOON)).tasks
    expect([card.title, card.projectName, card.labels, card.type]).toEqual(["Cross over", "Brand · Logo", [], null])
  })
})
