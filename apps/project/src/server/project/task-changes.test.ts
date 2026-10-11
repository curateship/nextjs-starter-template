import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { linesToTitles } from "@/lib/project/paste-lines"
import type { CustomShellDb } from "@/server/db"
import { submitCheckin } from "@/server/project/checkins"
import { acceptInvite, createInvite } from "@/server/project/invites"
import { createLabel, setTaskLabels } from "@/server/project/labels"
import {
  addProjectMember,
  createProject,
  loadProjectPage,
  removeProjectMember,
} from "@/server/project/projects"
import {
  projectCheckinItems,
  projectNoticeLinks,
  projectTaskEvents,
} from "@/server/project/schema"
import {
  changeManyTasks,
  createTasksFromLines,
  duplicateTask,
  moveTask,
  promoteStep,
} from "@/server/project/task-changes"
import { addComment } from "@/server/project/task-chat"
import {
  addStep,
  createTask,
  loadTaskDetail,
  updateStep,
} from "@/server/project/tasks"
import { createTeam } from "@/server/project/teams"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let website: string
let brand: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  for (const person of [ben, carla]) {
    const sent = await createInvite(
      { ...actor(anna), currentWorkspaceId: anna.currentWorkspaceId },
      { email: person.email, role: "member" },
      database
    )
    await acceptInvite(person, sent.inviteId, database)
  }
  website = (await createProject(anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  brand = (await createProject(anna.id, { name: "Brand", color: "pink", description: "" }, database)).id
  await addProjectMember(anna.id, website, ben.id, database)
  await addProjectMember(anna.id, website, carla.id, database)
  await addProjectMember(anna.id, brand, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

async function task(title: string, assignee: CustomShellUser | null = null, projectId = website) {
  return (
    await createTask(
      actor(anna),
      { projectId, title, notes: "", assigneeUserId: assignee?.id ?? null, dueDate: null, steps: [] },
      database
    )
  ).id
}

async function noticesFor(user: CustomShellUser, kind: string) {
  return database
    .select({ message: customShellNotifications.message, detail: customShellNotifications.detail })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(and(eq(customShellNotifications.recipientUserId, user.id), eq(projectNoticeLinks.kind, kind)))
}

describe("pasting a list", () => {
  it("drops blank lines and bullet marks", () => {
    expect(linesToTitles("- Call the printer\n\n* Book the room\n1. Send notes\n[ ] Pay\n  • Tidy  ")).toEqual([
      "Call the printer",
      "Book the room",
      "Send notes",
      "Pay",
      "Tidy",
    ])
  })

  it("makes one task per line with the same person and date, each handed over and told", async () => {
    const titles = Array.from({ length: 8 }, (_, i) => `Line ${i + 1}`)
    const { ids } = await createTasksFromLines(
      actor(anna),
      { projectId: website, titles, assigneeUserId: ben.id, dueDate: "2099-03-06" },
      database
    )
    expect(ids).toHaveLength(8)
    const page = await loadProjectPage(anna.id, website, database)
    expect(page.tasks.map((t) => t.title)).toEqual(titles)
    expect(page.tasks.every((t) => t.assignee?.id === ben.id && t.dueDate === "2099-03-06")).toBe(true)
    expect(await noticesFor(ben, "task_assigned")).toHaveLength(8)
  })

  it("refuses more than 50 lines, and makes none", async () => {
    const titles = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`)
    await expect(
      createTasksFromLines(actor(anna), { projectId: website, titles, assigneeUserId: null, dueDate: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.tooManyLines)
    expect((await loadProjectPage(anna.id, website, database)).tasks).toHaveLength(0)
  })
})

describe("duplicating", () => {
  it("copies the title, notes, labels and unticked steps, To do with nobody, and leaves the chat behind", async () => {
    const original = await task("Build the contact form", ben)
    const step = await addStep(actor(anna), { taskId: original, text: "Spam protection" }, database)
    await updateStep(actor(anna), { stepId: step.id, done: true }, database)
    const label = await createLabel(anna.id, { name: "Client", color: "pink" }, database)
    await setTaskLabels(anna.id, { taskId: original, labelIds: [label.id] }, database)
    await addComment(actor(anna), { taskId: original, body: "First thoughts" }, database)

    const { id } = await duplicateTask(actor(ben), original, database)
    const copy = await loadTaskDetail(ben.id, id, database)
    expect(copy.task.title).toBe("Build the contact form (copy)")
    expect(copy.task.status).toBe("todo")
    expect(copy.task.assignee).toBeNull()
    expect(copy.steps.map((s) => [s.text, s.done])).toEqual([["Spam protection", false]])
    expect(copy.task.labels.map((l) => l.name)).toEqual(["Client"])
    expect(copy.comments).toHaveLength(0)

    const before = await loadTaskDetail(ben.id, original, database)
    expect(before.steps[0].done).toBe(true)
    expect(before.comments).toHaveLength(1)
  })
})

describe("moving to another project", () => {
  it("keeps the person when they're on the new project, with history, and old check-in lines stay put", async () => {
    const id = await task("Logo files", ben)
    await submitCheckin(ben.id, { answers: [], picks: [id] }, database)
    await moveTask(actor(anna), { taskId: id, projectId: brand }, database)
    const detail = await loadTaskDetail(ben.id, id, database)
    expect(detail.task.projectId).toBe(brand)
    expect(detail.task.assignee?.id).toBe(ben.id)
    expect(detail.history.find((entry) => entry.kind === "moved")).toMatchObject({ fromProjectName: "Website" })
    const [line] = await database.select().from(projectCheckinItems).where(eq(projectCheckinItems.taskId, id))
    expect(line.projectId).toBe(website)
  })

  it("moves with nobody assigned when the person isn't on the new project, and old members lose sight of it", async () => {
    const id = await task("Spam filter", carla)
    const { keptAssignee } = await moveTask(actor(anna), { taskId: id, projectId: brand }, database)
    expect(keptAssignee).toBe(false)
    const detail = await loadTaskDetail(anna.id, id, database)
    expect(detail.task.assignee).toBeNull()
    expect(detail.task.formerAssigneeName).toBe("Carla")
    await expect(loadTaskDetail(carla.id, id, database)).rejects.toThrow(PROJECT_ERRORS.taskNotFound)
  })

  it("refuses a project the person can't see, and never names it to them later", async () => {
    const hidden = (await createProject(anna.id, { name: "Hidden", color: "red", description: "" }, database)).id
    const id = await task("Mine", ben)
    await expect(moveTask(actor(ben), { taskId: id, projectId: hidden }, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
    // Anna moves a task out of Hidden into Brand: Ben, on Brand only, isn't told where it came from.
    const secret = await task("From the hidden one", null, hidden)
    await moveTask(actor(anna), { taskId: secret, projectId: brand }, database)
    const seen = await loadTaskDetail(ben.id, secret, database)
    expect(seen.history.find((entry) => entry.kind === "moved")).toMatchObject({ fromProjectName: null })
    const owner = await loadTaskDetail(anna.id, secret, database)
    expect(owner.history.find((entry) => entry.kind === "moved")).toMatchObject({ fromProjectName: "Hidden" })
  })

  it("never moves a shared task into a Just me list", async () => {
    const own = await createTask(
      actor(ben),
      { projectId: "personal", title: "Mine alone", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    const personalId = (await loadTaskDetail(ben.id, own.id, database)).task.projectId
    const shared = await task("Team work", ben)
    await expect(moveTask(actor(ben), { taskId: shared, projectId: personalId }, database)).rejects.toThrow(
      PROJECT_ERRORS.personalProject
    )
  })
})

describe("changing many at once", () => {
  it("changes each task on its own, with history and notices, and refuses one alone", async () => {
    const a = await task("One")
    const b = await task("Two")
    const elsewhere = await task("Brand only", null, brand)
    const outcome = await changeManyTasks(
      actor(carla),
      { taskIds: [a, b, elsewhere], change: { kind: "assign", assigneeUserId: ben.id } },
      database
    )
    expect(outcome.changed).toEqual([a, b])
    // Carla isn't on Brand, so that task can't be named to her.
    expect(outcome.refused).toEqual([{ taskId: elsewhere, title: "", reason: PROJECT_ERRORS.taskNotFound }])
    expect(await noticesFor(ben, "task_assigned")).toHaveLength(2)
    const events = await database
      .select()
      .from(projectTaskEvents)
      .where(eq(projectTaskEvents.kind, "handed_over"))
    expect(events.map((e) => e.taskId).sort()).toEqual([a, b].sort())
  })

  it("marks several Stuck with one reason and tells each hander", async () => {
    const a = await task("One", ben)
    const b = await task("Two", ben)
    const outcome = await changeManyTasks(
      actor(ben),
      { taskIds: [a, b], change: { kind: "status", status: "stuck", stuckReason: "Waiting on copy" } },
      database
    )
    expect(outcome.changed).toHaveLength(2)
    expect(await noticesFor(anna, "task_stuck")).toHaveLength(2)
  })

  it("says why a task was refused", async () => {
    const a = await task("Brand logo", null, brand)
    const outcome = await changeManyTasks(
      actor(anna),
      { taskIds: [a], change: { kind: "assign", assigneeUserId: carla.id } },
      database
    )
    expect(outcome.refused[0]).toMatchObject({ title: "Brand logo", reason: PROJECT_ERRORS.notProjectMember })
  })
})

describe("a step that becomes a task", () => {
  it("makes a task from the step, takes the step off and links the two in their histories", async () => {
    const parent = await task("Build the contact form", ben)
    const step = await addStep(actor(anna), { taskId: parent, text: "Spam protection" }, database)
    await updateStep(actor(anna), { stepId: step.id, assigneeUserId: carla.id }, database)
    const { id } = await promoteStep(actor(anna), step.id, database)

    const made = await loadTaskDetail(anna.id, id, database)
    expect(made.task.title).toBe("Spam protection")
    expect(made.task.assignee?.id).toBe(carla.id)
    expect(made.history.find((e) => e.kind === "from_step")).toMatchObject({
      relatedTask: { id: parent, title: "Build the contact form" },
    })
    const from = await loadTaskDetail(anna.id, parent, database)
    expect(from.steps).toHaveLength(0)
    expect(from.history.find((e) => e.kind === "became_task")).toMatchObject({
      reason: "Spam protection",
      relatedTask: { id, title: "Spam protection" },
    })
  })
})

describe("steps with a person and a date", () => {
  it("saves both, tells the person once, and clears them when they leave the project", async () => {
    const parent = await task("Launch page", ben)
    const step = await addStep(actor(anna), { taskId: parent, text: "Write the headline" }, database)
    await updateStep(actor(anna), { stepId: step.id, assigneeUserId: carla.id, dueDate: "2099-03-05" }, database)
    await updateStep(actor(anna), { stepId: step.id, done: false }, database)
    let detail = await loadTaskDetail(anna.id, parent, database)
    expect(detail.steps[0]).toMatchObject({ assignee: { id: carla.id }, dueDate: "2099-03-05" })
    expect(await noticesFor(carla, "task_step")).toEqual([
      { message: "Anna gave you a step", detail: "Launch page: Write the headline" },
    ])

    await removeProjectMember(anna.id, website, carla.id, database)
    detail = await loadTaskDetail(anna.id, parent, database)
    expect(detail.steps[0].assignee).toBeNull()
  })

  it("refuses someone who isn't on the project", async () => {
    const parent = await task("Brand task", null, brand)
    const step = await addStep(actor(anna), { taskId: parent, text: "Pick colours" }, database)
    await expect(
      updateStep(actor(anna), { stepId: step.id, assigneeUserId: carla.id }, database)
    ).rejects.toThrow(PROJECT_ERRORS.notProjectMember)
  })
})
