import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { createLabel, deleteLabel, setTaskLabels, updateLabel } from "@/server/project/labels"
import {
  addProjectMember,
  loadProjectPage,
  loadProjectsPage,
  removeProjectMember,
  setProjectStar,
} from "@/server/project/projects"
import { projectTasks } from "@/server/project/schema"
import { createSection, deleteSection, renameSection, reorderTasks } from "@/server/project/sections"
import { createTask, setTaskStatus, updateTask } from "@/server/project/tasks"
import { projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
/** The site admin, who runs the team without being on it. */
let admin: CustomShellUser
let projectId: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  ;({ admin } = await startTeam(database, [anna, ben, carla]))
  // Anna makes Website and is on it; the site admin adds Ben.
  projectId = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  await addProjectMember(admin.id, projectId, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

async function newTask(title: string) {
  return (
    await createTask(
      actor(anna),
      { projectId, title, notes: "", assigneeUserId: null, dueDate: null, steps: [] },
      database
    )
  ).id
}

const titles = async () => (await loadProjectPage(ben.id, projectId, database)).tasks.map((t) => t.title)

describe("labels", () => {
  it("lets anyone make one and put it on a task, and shows it on the card", async () => {
    const label = await createLabel(ben.id, { name: "Client", color: "pink" }, database)
    const taskId = await newTask("Fix the 404 page")
    await setTaskLabels(ben.id, { taskId, labelIds: [label.id] }, database)
    const page = await loadProjectPage(ben.id, projectId, database)
    expect(page.tasks[0].labels).toEqual([{ id: label.id, name: "Client", color: "pink" }])
    expect(page.labels.map((l) => l.name)).toEqual(["Client"])
  })

  it("refuses a second label with the same name, whatever its capitals", async () => {
    await createLabel(ben.id, { name: "Bug", color: "red" }, database)
    await expect(createLabel(carla.id, { name: "bug", color: "blue" }, database)).rejects.toThrow(
      PROJECT_ERRORS.labelNameTaken
    )
  })

  it("lets only the site admin rename and delete, and deleting takes it off every task", async () => {
    const label = await createLabel(ben.id, { name: "Bug", color: "red" }, database)
    const taskId = await newTask("Broken form")
    await setTaskLabels(ben.id, { taskId, labelIds: [label.id] }, database)
    await expect(updateLabel(ben.id, { labelId: label.id, name: "Bugs" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    await expect(deleteLabel(ben.id, label.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)

    await updateLabel(admin.id, { labelId: label.id, name: "Defect" }, database)
    expect((await loadProjectPage(ben.id, projectId, database)).tasks[0].labels[0].name).toBe("Defect")
    await deleteLabel(admin.id, label.id, database)
    expect((await loadProjectPage(ben.id, projectId, database)).tasks[0].labels).toEqual([])
  })

  it("refuses another team's label", async () => {
    const stranger = await insertUser(database, { name: "Stranger", email: "s@example.test" })
    await startTeam(database, [stranger], { name: "Other" })
    const theirs = await createLabel(stranger.id, { name: "Secret", color: "red" }, database)
    const taskId = await newTask("Mine")
    await expect(setTaskLabels(ben.id, { taskId, labelIds: [theirs.id] }, database)).rejects.toThrow(
      PROJECT_ERRORS.labelNotFound
    )
  })
})

describe("sections", () => {
  it("puts a task under a section, renames it everywhere, and deleting it leaves the task with none", async () => {
    // Sections are a project setting, so the site admin's alone.
    await expect(createSection(ben.id, { projectId, name: "Mine" }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    const section = await createSection(admin.id, { projectId, name: "Design" }, database)
    const taskId = await newTask("Pick the fonts")
    // Putting a task under one is not a setting: anyone on the project may.
    await updateTask(actor(ben), { taskId, sectionId: section.id }, database)
    await expect(renameSection(ben.id, { sectionId: section.id, name: "Nope" }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    await renameSection(admin.id, { sectionId: section.id, name: "Look and feel" }, database)
    let page = await loadProjectPage(ben.id, projectId, database)
    expect(page.sections).toEqual([{ id: section.id, name: "Look and feel" }])
    expect(page.tasks[0].section).toEqual({ id: section.id, name: "Look and feel" })

    await expect(deleteSection(ben.id, section.id, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    await deleteSection(admin.id, section.id, database)
    page = await loadProjectPage(ben.id, projectId, database)
    expect(page.sections).toEqual([])
    expect(page.tasks.map((t) => t.title)).toEqual(["Pick the fonts"])
    expect(page.tasks[0].section).toBeNull()
  })

  it("refuses another project's section", async () => {
    const other = await projectFor(admin, anna.id, { name: "Other", color: "red", description: "" }, database)
    const theirs = await createSection(admin.id, { projectId: other.id, name: "Elsewhere" }, database)
    const taskId = await newTask("Mine")
    await expect(updateTask(actor(ben), { taskId, sectionId: theirs.id }, database)).rejects.toThrow(
      PROJECT_ERRORS.sectionNotFound
    )
  })
})

describe("the project's order", () => {
  it("puts new tasks last, and a new order holds for everyone", async () => {
    const a = await newTask("First")
    const b = await newTask("Second")
    const c = await newTask("Third")
    expect(await titles()).toEqual(["First", "Second", "Third"])
    await reorderTasks(ben.id, { projectId, taskIds: [c, a, b] }, database)
    expect(await titles()).toEqual(["Third", "First", "Second"])
    expect((await loadProjectPage(anna.id, projectId, database)).tasks.map((t) => t.title)).toEqual([
      "Third",
      "First",
      "Second",
    ])
  })

  it("refuses tasks from another project, and anyone not on the project", async () => {
    const a = await newTask("Mine")
    const other = await projectFor(admin, anna.id, { name: "Other", color: "red", description: "" }, database)
    const theirs = (
      await createTask(
        actor(anna),
        { projectId: other.id, title: "Theirs", notes: "", assigneeUserId: null, dueDate: null, steps: [] },
        database
      )
    ).id
    await expect(reorderTasks(ben.id, { projectId, taskIds: [a, theirs] }, database)).rejects.toThrow(
      PROJECT_ERRORS.notInThisProject
    )
    await expect(reorderTasks(carla.id, { projectId, taskIds: [a] }, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })
})

describe("when a task became Done", () => {
  it("is set on Done, kept while Done and cleared when it leaves", async () => {
    const taskId = await newTask("Ship it")
    const finishedAt = async () =>
      (await database.select().from(projectTasks).where(eq(projectTasks.id, taskId)))[0].completedAt
    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    const first = await finishedAt()
    expect(first).toBeInstanceOf(Date)
    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    expect(await finishedAt()).toEqual(first)
    await setTaskStatus(actor(ben), { taskId, status: "doing", stuckReason: null }, database)
    expect(await finishedAt()).toBeNull()
  })
})

describe("stars", () => {
  it("are each person's own, put starred projects first, and go when the person leaves the project", async () => {
    await projectFor(admin, anna.id, { name: "Another", color: "red", description: "" }, database)
    await setProjectStar(ben.id, { projectId, starred: true }, database)
    const starred = async (user: CustomShellUser) =>
      (await loadProjectsPage(user.id, database)).projects.filter((p) => p.starred).map((p) => p.name)
    expect(await starred(ben)).toEqual(["Website"])
    expect(await starred(anna)).toEqual([])

    await removeProjectMember(admin.id, projectId, ben.id, database)
    await addProjectMember(admin.id, projectId, ben.id, database)
    expect(await starred(ben)).toEqual([])
  })

  it("can't be put on a project the person can't see", async () => {
    await expect(setProjectStar(carla.id, { projectId, starred: true }, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })
})
