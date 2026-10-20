import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { createLabel, setTaskLabels } from "@/server/project/labels"
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  setTaskMilestone,
  updateMilestone,
} from "@/server/project/milestones"
import {
  addProjectMember,
  copyProject,
  createProject,
  loadProjectPage,
  loadProjectsPage,
  removeProjectMember,
  setProjectClient,
  setProjectLead,
  setWholeTeam,
  updateProject,
} from "@/server/project/projects"
import { customShellNotifications } from "@/server/schema"
import { projectNoticeLinks } from "@/server/project/schema"
import { followTask } from "@/server/project/task-followers"
import { moveTask } from "@/server/project/task-changes"
import { addStep, assignTask, createTask, loadTaskDetail, setTaskStatus } from "@/server/project/tasks"
import { removeTeamMember } from "@/server/project/teams"
import { insertEmployee, joinTeam, projectFor, startTeam } from "@/server/project/test-people"
import {
  deleteTemplate,
  listMyTeamTemplates,
  renameTemplate,
  saveTemplate,
} from "@/server/project/templates"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let admin: CustomShellUser
let teamId: string
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertEmployee(database, { name: "Carla", email: "carla@example.test" })
  // The site admin runs the team; Anna, Ben and Carla are its employees.
  // Anna makes the Website and the site admin puts Ben and Carla on it.
  const started = await startTeam(database, [anna, ben, carla])
  admin = started.admin
  teamId = started.team.id
  website = (await projectFor(admin, anna.id, { name: "Website", color: "pink", description: "Hart Dental's site" }, database)).id
  await addProjectMember(admin.id, website, ben.id, database)
  await addProjectMember(admin.id, website, carla.id, database)
})

afterEach(async () => {
  await client.close()
})

async function task(title: string, by: CustomShellUser = anna, projectId = website) {
  return (
    await createTask(
      actor(by),
      { projectId, title, notes: "", assigneeUserId: null, dueDate: null, steps: [] },
      database
    )
  ).id
}

async function noticeKinds(userId: string) {
  const rows = await database
    .select({ kind: projectNoticeLinks.kind })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
  return rows.map((row) => row.kind)
}

const listRow = async (userId: string, projectId = website) =>
  (await loadProjectsPage(userId, database)).projects.find((row) => row.id === projectId)

// The status is worked out from late tasks by a rule the site admin sets (19 Oct 2026).
describe("project status", () => {
  it("starts at 1 and 3 late tasks, and the Projects table gets each open dated task to count", async () => {
    expect((await loadProjectPage(anna.id, website, database)).project).toMatchObject({ slowingAt: 1, behindAt: 3 })
    const dated = async (title: string, dueDate: string) =>
      (
        await createTask(
          actor(anna),
          { projectId: website, title, notes: "", assigneeUserId: null, dueDate, steps: [] },
          database
        )
      ).id
    await dated("Late", "2020-01-02")
    const finished = await dated("Done long ago", "2020-01-03")
    await setTaskStatus(actor(anna), { taskId: finished, status: "done", stuckReason: null }, database)
    await dated("Next year", "2099-01-01")
    await task("No date")
    const row = await listRow(anna.id)
    expect(row).toMatchObject({ slowingAt: 1, behindAt: 3 })
    // Done, undated and far-off tasks can't be late, so they aren't sent.
    expect(row?.dated).toEqual([{ dueDate: "2020-01-02", dueAt: null, status: "todo" }])
  })

  it("is the site admin's to set, and Behind can't start below Slowing down", async () => {
    await expect(updateProject(anna.id, { projectId: website, slowingAt: 2 }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    await expect(updateProject(admin.id, { projectId: website, slowingAt: 4 }, database)).rejects.toThrow(
      PROJECT_ERRORS.behindBeforeSlowing
    )
    // The same number for both is allowed: Slowing down then never shows.
    await updateProject(admin.id, { projectId: website, slowingAt: 3 }, database)
    await updateProject(admin.id, { projectId: website, slowingAt: 5, behindAt: 8 }, database)
    expect((await listRow(carla.id))).toMatchObject({ slowingAt: 5, behindAt: 8 })
  })
})

describe("project lead", () => {
  it("must be on the project, and shows on the Projects table", async () => {
    const other = (await projectFor(admin, anna.id, { name: "Office", color: "blue", description: "" }, database)).id
    await expect(setProjectLead(admin.id, { projectId: other, userId: ben.id }, database)).rejects.toThrow(
      PROJECT_ERRORS.leadNotMember
    )
    await setProjectLead(admin.id, { projectId: website, userId: carla.id }, database)
    expect((await listRow(anna.id))?.lead).toMatchObject({ id: carla.id, name: "Carla" })
    expect((await loadProjectPage(ben.id, website, database)).project.leadUserId).toBe(carla.id)
  })

  it("hears every Stuck, unblocked and Done, once even when also following", async () => {
    await setProjectLead(admin.id, { projectId: website, userId: carla.id }, database)
    const logo = await task("Logo", ben)
    await setTaskStatus(actor(ben), { taskId: logo, status: "stuck", stuckReason: "No brief" }, database)
    await setTaskStatus(actor(ben), { taskId: logo, status: "doing", stuckReason: null }, database)
    await followTask(carla.id, logo, database)
    await setTaskStatus(actor(ben), { taskId: logo, status: "done", stuckReason: null }, database)
    expect((await noticeKinds(carla.id)).sort()).toEqual(["task_done", "task_stuck", "task_unblocked"])
  })

  it("leaves with nobody leading when the lead leaves the project or the team", async () => {
    await inTeam(teamId, async () => {
      await setProjectLead(admin.id, { projectId: website, userId: carla.id }, database)
      await removeProjectMember(admin.id, website, carla.id, database)
      expect((await listRow(anna.id))?.lead).toBeNull()

      await setProjectLead(admin.id, { projectId: website, userId: ben.id }, database)
      await removeTeamMember(admin.id, ben.id, database)
      expect((await listRow(anna.id))?.lead).toBeNull()
    })
  })

  it("is picked by the site admin alone, and being lead changes no setting", async () => {
    await setProjectLead(admin.id, { projectId: website, userId: carla.id }, database)
    for (const person of [ben, carla]) {
      await expect(
        setProjectLead(person.id, { projectId: website, userId: person.id }, database)
      ).rejects.toThrow(PROJECT_ERRORS.onlySiteAdminSettings)
    }
    await expect(updateProject(carla.id, { projectId: website, name: "Website v2" }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    expect((await listRow(anna.id))?.lead?.name).toBe("Carla")
  })
})

describe("milestones", () => {
  it("count their tasks, done and open, and a task counts toward one", async () => {
    const design = await createMilestone(ben.id, { projectId: website, name: "Design signed off", dueDate: "2026-11-15" }, database)
    const launch = await createMilestone(ben.id, { projectId: website, name: "Launch", dueDate: null }, database)
    const tasks = [await task("Logo"), await task("Colours"), await task("Fonts")]
    for (const id of tasks) await setTaskMilestone(ben.id, { taskId: id, milestoneId: design.id }, database)
    await setTaskStatus(actor(ben), { taskId: tasks[0], status: "done", stuckReason: null }, database)
    await setTaskMilestone(ben.id, { taskId: tasks[2], milestoneId: launch.id }, database)

    expect(await listMilestones(website, database)).toMatchObject([
      { name: "Design signed off", dueDate: "2026-11-15", done: 1, total: 2 },
      { name: "Launch", dueDate: null, done: 0, total: 1 },
    ])
    const detail = await loadTaskDetail(ben.id, tasks[2], database)
    expect(detail.milestoneId).toBe(launch.id)
    expect(detail.milestones.map((m) => m.name)).toEqual(["Design signed off", "Launch"])
  })

  it("refuses another project's milestone, and moving a task frees it", async () => {
    const office = (await projectFor(admin, anna.id, { name: "Office", color: "blue", description: "" }, database)).id
    const elsewhere = await createMilestone(anna.id, { projectId: office, name: "Move in", dueDate: null }, database)
    const logo = await task("Logo")
    await expect(
      setTaskMilestone(anna.id, { taskId: logo, milestoneId: elsewhere.id }, database)
    ).rejects.toThrow(PROJECT_ERRORS.milestoneNotFound)
    const here = await createMilestone(anna.id, { projectId: website, name: "Design", dueDate: null }, database)
    await setTaskMilestone(anna.id, { taskId: logo, milestoneId: here.id }, database)
    await moveTask(actor(anna), { taskId: logo, projectId: office }, database)
    expect((await loadTaskDetail(anna.id, logo, database)).milestoneId).toBeNull()
  })

  it("can be picked in New task, only the task's own project's", async () => {
    // Tyler, 19 Oct 2026: "Add the milestone selection here", in New task's dropdown.
    const office = (await projectFor(admin, anna.id, { name: "Office", color: "blue", description: "" }, database)).id
    const elsewhere = await createMilestone(anna.id, { projectId: office, name: "Move in", dueDate: null }, database)
    const here = await createMilestone(anna.id, { projectId: website, name: "Design", dueDate: null }, database)
    const base = { projectId: website, notes: "", assigneeUserId: null, dueDate: null, steps: [] }
    await expect(
      createTask(actor(anna), { ...base, title: "Wrong one", milestoneId: elsewhere.id }, database)
    ).rejects.toThrow(PROJECT_ERRORS.milestoneNotFound)
    const { id } = await createTask(actor(anna), { ...base, title: "Logo", milestoneId: here.id }, database)
    expect((await loadTaskDetail(anna.id, id, database)).milestoneId).toBe(here.id)
  })

  it("can't be reached from outside the project", async () => {
    const office = (await projectFor(admin, anna.id, { name: "Office", color: "blue", description: "" }, database)).id
    const moveIn = await createMilestone(anna.id, { projectId: office, name: "Move in", dueDate: null }, database)
    await expect(
      updateMilestone(ben.id, { milestoneId: moveIn.id, name: "Mine now", dueDate: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.milestoneNotFound)
    await expect(deleteMilestone(ben.id, moveIn.id, database)).rejects.toThrow(PROJECT_ERRORS.milestoneNotFound)
  })

  it("frees its tasks when deleted", async () => {
    const design = await createMilestone(ben.id, { projectId: website, name: "Design", dueDate: null }, database)
    const logo = await task("Logo")
    await setTaskMilestone(ben.id, { taskId: logo, milestoneId: design.id }, database)
    await deleteMilestone(ben.id, design.id, database)
    expect((await loadTaskDetail(ben.id, logo, database)).milestoneId).toBeNull()
  })

  it("are copied by Copy project with no dates, tasks still linked", async () => {
    const design = await createMilestone(ben.id, { projectId: website, name: "Design", dueDate: "2026-11-15" }, database)
    const logo = await task("Logo")
    await setTaskMilestone(ben.id, { taskId: logo, milestoneId: design.id }, database)
    const copy = await copyProject(admin.id, { projectId: website, name: "Copy of Website" }, database)
    expect(await listMilestones(copy.id, database)).toMatchObject([{ name: "Design", dueDate: null, done: 0, total: 1 }])
  })
})

describe("clients", () => {
  it("is named by the site admin, offering only clients of projects the viewer can see", async () => {
    await inTeam(teamId, async () => {
      // The site admin makes Secret and is on no project, so only they see it.
      const secret = (
        await inTeam(teamId, () => createProject(admin.id, { name: "Secret", color: "red", description: "" }, database))
      ).id
      await setProjectClient(admin.id, { projectId: secret, client: "Hidden Co" }, database)
      await setProjectClient(admin.id, { projectId: website, client: "Hart Dental" }, database)
      expect((await listRow(ben.id))?.client).toBe("Hart Dental")
      expect((await loadProjectPage(ben.id, website, database)).teamClients).toEqual(["Hart Dental"])
      expect((await loadProjectPage(admin.id, website, database)).teamClients).toEqual(["Hart Dental", "Hidden Co"])
      await expect(setProjectClient(ben.id, { projectId: website, client: null }, database)).rejects.toThrow(
        PROJECT_ERRORS.onlySiteAdminSettings
      )
      await setProjectClient(admin.id, { projectId: website, client: null }, database)
      expect((await listRow(ben.id))?.client).toBeNull()
    })
  })
})

describe("whole-team projects", () => {
  it("puts everyone on, newcomers included, and nobody can leave while it's on", async () => {
    const office = (await projectFor(admin, ben.id, { name: "Office", color: "blue", description: "" }, database)).id
    await expect(setWholeTeam(ben.id, { projectId: office, wholeTeam: true }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    await setWholeTeam(admin.id, { projectId: office, wholeTeam: true }, database)
    const dan = await insertEmployee(database, { name: "Dan", email: "dan@example.test" })
    await joinTeam(database, teamId, dan)
    // The site admin is on no team, so "everyone on the team" leaves them off.
    const members = (await loadProjectPage(ben.id, office, database)).members.map((m) => m.name)
    expect(members).toEqual(["Anna", "Ben", "Carla", "Dan"])
    await expect(removeProjectMember(admin.id, office, dan.id, database)).rejects.toThrow(
      PROJECT_ERRORS.wholeTeamProject
    )
  })

  it("keeps everyone as ordinary members once off, and leaving the team still takes them off", async () => {
    await inTeam(teamId, async () => {
      const office = (await projectFor(admin, ben.id, { name: "Office", color: "blue", description: "" }, database)).id
      await setWholeTeam(admin.id, { projectId: office, wholeTeam: true }, database)
      await setWholeTeam(admin.id, { projectId: office, wholeTeam: false }, database)
      expect((await loadProjectPage(ben.id, office, database)).members).toHaveLength(3)
      await removeProjectMember(admin.id, office, carla.id, database)
      await setWholeTeam(admin.id, { projectId: office, wholeTeam: true }, database)
      await removeTeamMember(admin.id, carla.id, database)
      expect((await loadProjectPage(ben.id, office, database)).members.map((m) => m.name)).toEqual(["Anna", "Ben"])
    })
  })
})

describe("project templates", () => {
  it("saves a plan that never shows as a project and starts new ones like Copy project", async () => {
    const signedOff = await createMilestone(ben.id, { projectId: website, name: "Signed off", dueDate: "2026-11-15" }, database)
    const label = await createLabel(ben.id, { name: "Client", color: "pink" }, database)
    const logo = await task("Logo")
    await assignTask(actor(anna), { taskId: logo, assigneeUserId: ben.id }, database)
    await setTaskMilestone(ben.id, { taskId: logo, milestoneId: signedOff.id }, database)
    await setTaskLabels(ben.id, { taskId: logo, labelIds: [label.id] }, database)
    await addStep(actor(ben), { taskId: logo, text: "Sketch" }, database)
    await setTaskStatus(actor(ben), { taskId: logo, status: "done", stuckReason: null }, database)

    const saved = await saveTemplate(admin.id, { projectId: website, name: "Client website" }, database)
    expect(await listMyTeamTemplates(carla.id, database)).toEqual([
      { id: saved.id, name: "Client website", taskCount: 1, color: "pink" },
    ])
    expect((await loadProjectsPage(anna.id, database)).projects.map((p) => p.name)).toEqual(["Website"])

    // Changing the source afterwards leaves the template as it was saved.
    await task("Added later")
    const started = await projectFor(
      admin,
      carla.id,
      { name: "Website for Bloom", color: "blue", description: "", templateId: saved.id },
      database
    )
    const page = await loadProjectPage(carla.id, started.id, database)
    expect(page.project).toMatchObject({ color: "pink", description: "Hart Dental's site" })
    expect(page.milestones).toMatchObject([{ name: "Signed off", dueDate: null, total: 1 }])
    expect(page.tasks.map((t) => [t.title, t.status, t.assignee])).toEqual([["Logo", "todo", null]])
    const detail = await loadTaskDetail(carla.id, page.tasks[0].id, database)
    expect(detail.steps.map((s) => [s.text, s.done])).toEqual([["Sketch", false]])
    expect(detail.task.labels.map((l) => l.name)).toEqual(["Client"])
    expect(page.members.map((m) => m.name)).toEqual(["Carla"])
  })

  it("is saved, renamed and deleted by the site admin only, and stays in its team", async () => {
    await inTeam(teamId, async () => {
      await expect(saveTemplate(ben.id, { projectId: website, name: "Client website" }, database)).rejects.toThrow(
        PROJECT_ERRORS.onlySiteAdminSettings
      )
      const saved = await saveTemplate(admin.id, { projectId: website, name: "Client website" }, database)
      await expect(saveTemplate(admin.id, { projectId: website, name: "client WEBSITE" }, database)).rejects.toThrow(
        PROJECT_ERRORS.templateNameTaken
      )
      await expect(renameTemplate(ben.id, { templateId: saved.id, name: "Site" }, database)).rejects.toThrow(
        PROJECT_ERRORS.notRunningTeam
      )
      await renameTemplate(admin.id, { templateId: saved.id, name: "Site" }, database)

      const outsider = await insertEmployee(database, { name: "Olga", email: "olga@example.test" })
      const other = await startTeam(database, [outsider], { name: "Other" })
      await expect(
        inTeam(other.team.id, () =>
          createProject(other.admin.id, { name: "Stolen", color: "blue", description: "", templateId: saved.id }, database)
        )
      ).rejects.toThrow(PROJECT_ERRORS.templateNotFound)

      await expect(deleteTemplate(anna.id, saved.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
      await deleteTemplate(admin.id, saved.id, database)
      expect(await listMyTeamTemplates(anna.id, database)).toEqual([])
    })
  })
})
