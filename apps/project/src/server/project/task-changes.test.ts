import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { linesToTitles } from "@/lib/project/paste-lines"
import type { CustomShellDb } from "@/server/db"
import { submitCheckin } from "@/server/project/checkins"
import { addProjectMember, loadProjectPage } from "@/server/project/projects"
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
} from "@/server/project/task-changes"
import { sendMessage } from "@/server/project/task-chat"
import { createTask, loadTaskDetail } from "@/server/project/tasks"
import { projectFor, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let admin: CustomShellUser
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
  admin = (await startTeam(database, [anna, ben, carla])).admin
  website = (await projectFor(admin, anna.id, { name: "Website", color: "blue" }, database)).id
  brand = (await projectFor(admin, anna.id, { name: "Brand", color: "pink" }, database)).id
  // A project's members are the site admin's to change.
  await addProjectMember(admin.id, website, ben.id, database)
  await addProjectMember(admin.id, website, carla.id, database)
  await addProjectMember(admin.id, brand, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

async function task(title: string, assignee: CustomShellUser | null = null, projectId = website) {
  return (
    await createTask(
      actor(anna),
      { projectId, title, notes: "", assigneeUserId: assignee?.id ?? null, dueDate: null },
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
  it("copies the title and notes, To do with nobody, and leaves the chat behind", async () => {
    const original = await task("Build the contact form", ben)
    await sendMessage(actor(anna), { chat: { taskId: original }, body: "First thoughts", replyToId: null }, database)

    const { id } = await duplicateTask(actor(ben), original, database)
    const copy = await loadTaskDetail(ben.id, id, database)
    expect(copy.task.title).toBe("Build the contact form (copy)")
    expect(copy.task.status).toBe("todo")
    expect(copy.task.assignee).toBeNull()
    expect(copy.comments).toHaveLength(0)

    const before = await loadTaskDetail(ben.id, original, database)
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
    const hidden = (await projectFor(admin, anna.id, { name: "Hidden", color: "red" }, database)).id
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
      { projectId: "personal", title: "Mine alone", notes: "", assigneeUserId: ben.id, dueDate: null },
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

  it("puts each task in the bin, and refuses one its person may not delete", async () => {
    const a = await task("One")
    const b = await task("Two")
    const outcome = await changeManyTasks(actor(anna), { taskIds: [a, b], change: { kind: "delete" } }, database)
    expect(outcome.changed).toEqual([a, b])
    const deleted = await database.select().from(projectTaskEvents).where(eq(projectTaskEvents.kind, "deleted"))
    expect(deleted.map((e) => e.taskId).sort()).toEqual([a, b].sort())
    // Anna made it, so Ben, who runs nothing, can't delete it.
    const c = await task("Three")
    const refused = await changeManyTasks(actor(ben), { taskIds: [c], change: { kind: "delete" } }, database)
    expect(refused.refused[0]).toMatchObject({ title: "Three", reason: PROJECT_ERRORS.cantDeleteTask })
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
