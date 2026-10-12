import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { acceptInvite, createInvite } from "@/server/project/invites"
import { createLabel, setTaskLabels } from "@/server/project/labels"
import { restoreTask } from "@/server/project/planning"
import { loadProjectActivity } from "@/server/project/project-activity"
import {
  addProjectMember,
  copyProject,
  createProject,
  loadProjectPage,
  loadProjectsPage,
  updateProject,
} from "@/server/project/projects"
import { createSection } from "@/server/project/sections"
import { sendMessage } from "@/server/project/task-chat"
import {
  acceptTask,
  addStep,
  createTask,
  deleteTask,
  loadTaskDetail,
  setTaskStatus,
  updateStep,
  updateTask,
} from "@/server/project/tasks"
import { createTeam } from "@/server/project/teams"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let website: string

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
  website = (await createProject(anna.id, { name: "Bloom Bakery", color: "pink", description: "Site for Bloom" }, database)).id
  await addProjectMember(anna.id, website, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

async function task(title: string, assignee: CustomShellUser | null = ben, dueDate: string | null = null) {
  return (
    await createTask(
      actor(anna),
      { projectId: website, title, notes: "", assigneeUserId: assignee?.id ?? null, dueDate, steps: [] },
      database
    )
  ).id
}

describe("copying a project", () => {
  it("copies tasks, steps, labels and sections, with no people, dates, chat or history", async () => {
    const design = await createSection(anna.id, { projectId: website, name: "Design" }, database)
    const brief = await task("Write the brief", ben, "2099-03-04")
    await updateTask(actor(anna), { taskId: brief, sectionId: design.id }, database)
    const step = await addStep(actor(anna), { taskId: brief, text: "Call the client" }, database)
    await updateStep(actor(anna), { stepId: step.id, done: true }, database)
    const label = await createLabel(anna.id, { name: "Client", color: "pink" }, database)
    await setTaskLabels(anna.id, { taskId: brief, labelIds: [label.id] }, database)
    await sendMessage(actor(ben), { chat: { taskId: brief }, body: "Started", replyToId: null }, database)
    await setTaskStatus(actor(ben), { taskId: brief, status: "done", stuckReason: null }, database)
    const binned = await task("Old idea")
    await deleteTask(actor(anna), binned, database)
    await task("Launch")

    const { id } = await copyProject(ben.id, { projectId: website, name: "Hart Dental" }, database)
    const copy = await loadProjectPage(ben.id, id, database)
    expect(copy.project).toMatchObject({ name: "Hart Dental", color: "pink", description: "Site for Bloom" })
    expect(copy.members.map((m) => m.name)).toEqual(["Ben"])
    expect(copy.sections.map((s) => s.name)).toEqual(["Design"])
    expect(copy.tasks.map((t) => t.title)).toEqual(["Write the brief", "Launch"])
    const first = copy.tasks[0]
    expect(first).toMatchObject({ status: "todo", assignee: null, dueDate: null, commentCount: 0 })
    expect(first.section?.name).toBe("Design")
    expect(first.labels.map((l) => l.name)).toEqual(["Client"])
    const detail = await loadTaskDetail(ben.id, first.id, database)
    expect(detail.steps.map((s) => [s.text, s.done])).toEqual([["Call the client", false]])
    expect(detail.history).toEqual([])

    const original = await loadProjectPage(anna.id, website, database)
    expect(original.tasks.find((t) => t.id === brief)?.status).toBe("done")
    expect(original.members.map((m) => m.name)).toEqual(["Anna", "Ben"])
  })

  it("refuses a project the person can't see", async () => {
    await expect(copyProject(carla.id, { projectId: website, name: "Mine" }, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })
})

describe("a project's due date and progress", () => {
  it("counts done out of every task not in the bin, and moves when one is marked Done", async () => {
    const a = await task("One")
    await task("Two")
    const binned = await task("Gone")
    await deleteTask(actor(anna), binned, database)
    await updateProject(anna.id, { projectId: website, dueDate: "2099-11-30" }, database)
    let row = (await loadProjectsPage(anna.id, database)).projects[0]
    expect(row.dueDate).toBe("2099-11-30")
    expect(row.counts).toEqual({ todo: 2, doing: 0, done: 0, stuck: 0 })
    await setTaskStatus(actor(ben), { taskId: a, status: "done", stuckReason: null }, database)
    row = (await loadProjectsPage(anna.id, database)).projects[0]
    expect(row.counts.done).toBe(1)
    expect((await loadProjectPage(anna.id, website, database)).project.dueDate).toBe("2099-11-30")
  })
})

describe("the Activity tab", () => {
  it("lists each kind of change once, newest first, to people who can see the project", async () => {
    const id = await task("Build the contact form")
    await acceptTask(actor(ben), id, database)
    await setTaskStatus(actor(ben), { taskId: id, status: "doing", stuckReason: null }, database)
    await sendMessage(actor(ben), { chat: { taskId: id }, body: "Halfway", replyToId: null }, database)
    await deleteTask(actor(anna), id, database)
    await restoreTask(actor(anna), id, database)

    const activity = await loadProjectActivity(ben.id, { projectId: website }, database)
    // Making a task and handing it over happen in the same moment, so only
    // the set of lines and their newest-first order by time are fixed.
    expect(activity.entries.map((e) => `${e.kind}:${e.actorName}`).sort()).toEqual(
      [
        "created:Anna",
        "handed_over:Anna",
        "accepted:Ben",
        "status_changed:Ben",
        "commented:Ben",
        "deleted:Anna",
        "restored:Anna",
      ].sort()
    )
    const times = activity.entries.map((e) => e.at)
    expect([...times].sort().reverse()).toEqual(times)
    expect(activity.entries[0].kind).toBe("restored")
    expect(activity.entries.find((e) => e.kind === "status_changed")?.reason).toBe("doing")
    expect(activity.more).toBe(false)
    await expect(loadProjectActivity(carla.id, { projectId: website }, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })

  it("pages 50 at a time", async () => {
    for (let i = 0; i < 26; i++) await task(`Task ${i}`)
    const first = await loadProjectActivity(anna.id, { projectId: website }, database)
    expect(first.entries).toHaveLength(50)
    expect(first.more).toBe(true)
    const last = first.entries[49]
    const second = await loadProjectActivity(
      anna.id,
      { projectId: website, before: { at: last.at, id: last.id } },
      database
    )
    // 26 tasks made and handed to Ben: 52 lines, none shown twice or skipped.
    const ids = [...first.entries, ...second.entries].map((e) => e.id)
    expect(new Set(ids).size).toBe(52)
    expect(second.more).toBe(false)
  })
})
