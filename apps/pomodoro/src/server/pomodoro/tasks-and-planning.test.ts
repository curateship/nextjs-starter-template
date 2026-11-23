import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EVERY_DAY } from "@/lib/pomodoro/task-repeats"
import { type CustomShellDb } from "@/server/db"
import { loadFocusReport } from "@/server/pomodoro/focus-report"
import {
  createProject,
  loadProjectTargetProgress,
  renameProject,
} from "@/server/pomodoro/projects"
import {
  focusSessions,
  pomodoroProjects,
  pomodoroTaskSteps,
  tasks,
  type Task,
} from "@/server/pomodoro/schema"
import {
  addTaskStep,
  deleteTaskStep,
  listStepsForTasks,
  updateTaskStep,
} from "@/server/pomodoro/task-steps"
import {
  listAllTags,
  listPickableTags,
  listTagsForTasks,
  setTaskTags,
} from "@/server/pomodoro/task-tags"
import {
  countPlannedDays,
  rollOverTasks,
  setTaskRepeat,
  toggleTaskStatus,
  updateTaskPlan,
} from "@/server/pomodoro/tasks"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Tasks and planning (tasks-and-planning task 01), against a real database:
 * a day planned ahead, steps inside a task, a project's hours target, and
 * tags. Each "Accepted when" line in the task file has a test here.
 *
 * 2026-10-07 is a Wednesday, so THURSDAY is the next day and the week runs
 * Monday 5 Oct to Sunday 11 Oct.
 */

const TUESDAY = "2026-10-06"
const WEDNESDAY = "2026-10-07"
const THURSDAY = "2026-10-08"
const UTC = "UTC"

let client: PGlite
let db: CustomShellDb
let userId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
})

afterEach(async () => {
  await client.close()
})

async function addTask(plannedDate: string, overrides: Partial<Task> = {}) {
  const [task] = await db
    .insert(tasks)
    .values({ userId, title: "Write report", plannedDate, ...overrides })
    .returning()
  return task
}

function liveTasksOn(plannedDate: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.plannedDate, plannedDate),
        eq(tasks.status, "active")
      )
    )
    .orderBy(tasks.sortOrder, tasks.createdAt)
}

async function addCompletedFocus(
  taskId: string | null,
  minutes: number,
  completedAt: string
) {
  await db.insert(focusSessions).values({
    userId,
    taskId,
    mode: "focus",
    status: "completed",
    plannedSeconds: minutes * 60,
    accumulatedSeconds: minutes * 60,
    completedAt: new Date(completedAt),
    idempotencyKey: `key-${Math.random()}`,
  })
}

describe("planning a day ahead", () => {
  it("shows a Thursday task on Thursday only, and the rollover never copies it", async () => {
    const planned = await addTask(THURSDAY, { title: "Call the bank" })

    // Wednesday's load leaves Thursday alone.
    await rollOverTasks(userId, WEDNESDAY)
    expect(await liveTasksOn(WEDNESDAY)).toHaveLength(0)
    expect(await liveTasksOn(THURSDAY)).toHaveLength(1)

    // Thursday morning: still one copy, and it is the same row.
    await rollOverTasks(userId, THURSDAY)
    const thursday = await liveTasksOn(THURSDAY)
    expect(thursday.map((task) => task.id)).toEqual([planned.id])
  })

  it("puts yesterday's leftovers under the tasks planned for today", async () => {
    await addTask(THURSDAY, { title: "Planned one", sortOrder: 1 })
    await addTask(THURSDAY, { title: "Planned two", sortOrder: 2 })
    await addTask(WEDNESDAY, { title: "Leftover", sortOrder: 1 })

    await rollOverTasks(userId, THURSDAY)
    const thursday = await liveTasksOn(THURSDAY)
    expect(thursday.map((task) => task.title)).toEqual([
      "Planned one",
      "Planned two",
      "Leftover",
    ])
  })

  it("keeps the order of carried tasks unchanged when nothing was planned", async () => {
    await addTask(WEDNESDAY, { title: "First", sortOrder: 1 })
    await addTask(WEDNESDAY, { title: "Second", sortOrder: 2 })
    await rollOverTasks(userId, THURSDAY)
    const thursday = await liveTasksOn(THURSDAY)
    expect(thursday.map((task) => [task.title, task.sortOrder])).toEqual([
      ["First", 1],
      ["Second", 2],
    ])
  })

  it("counts each future day's active tasks", async () => {
    await addTask(THURSDAY)
    await addTask(THURSDAY)
    await addTask("2026-10-13")
    // Today and a day past the window are not counted.
    await addTask(WEDNESDAY)
    await addTask("2026-10-14")
    const counts = await countPlannedDays(userId, WEDNESDAY)
    expect(
      Object.fromEntries(counts.map((day) => [day.plannedDate, day.count]))
    ).toEqual({ [THURSDAY]: 2, "2026-10-13": 1 })
  })

  it("refuses to tick a task planned for a later day", async () => {
    const ahead = await addTask(THURSDAY)
    await expect(toggleTaskStatus(userId, ahead.id, WEDNESDAY)).rejects.toThrow(
      "TASK_NOT_FOUND"
    )
    const [row] = await db.select().from(tasks).where(eq(tasks.id, ahead.id))
    expect(row.status).toBe("active")
  })

  it("edits a task planned ahead but not one past the window", async () => {
    const ahead = await addTask(THURSDAY)
    const updated = await updateTaskPlan(userId, ahead.id, WEDNESDAY, {
      title: "Renamed",
    })
    expect(updated.title).toBe("Renamed")

    const tooFar = await addTask("2026-10-14")
    await expect(
      updateTaskPlan(userId, tooFar.id, WEDNESDAY, { title: "No" })
    ).rejects.toThrow("TASK_NOT_FOUND")
  })
})

describe("steps inside a task", () => {
  it("shows 3 of 5 after three ticks, and the last tick does not complete the task", async () => {
    const task = await addTask(WEDNESDAY)
    const steps = []
    for (const title of ["One", "Two", "Three", "Four", "Five"])
      steps.push(await addTaskStep(userId, task.id, title))
    for (const step of steps.slice(0, 3))
      await updateTaskStep(userId, step.id, { done: true })

    let saved = await listStepsForTasks([task.id])
    expect(saved.map((step) => step.title)).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
    ])
    expect(saved.filter((step) => step.done)).toHaveLength(3)

    for (const step of steps.slice(3))
      await updateTaskStep(userId, step.id, { done: true })
    saved = await listStepsForTasks([task.id])
    expect(saved.every((step) => step.done)).toBe(true)
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row.status).toBe("active")
  })

  it("refuses an eleventh step", async () => {
    const task = await addTask(WEDNESDAY)
    for (let index = 0; index < 10; index += 1)
      await addTaskStep(userId, task.id, `Step ${index + 1}`)
    await expect(addTaskStep(userId, task.id, "Eleven")).rejects.toThrow(
      "TOO_MANY_STEPS"
    )
  })

  it("deletes the steps with the task", async () => {
    const task = await addTask(WEDNESDAY)
    await addTaskStep(userId, task.id, "One")
    await db.delete(tasks).where(eq(tasks.id, task.id))
    expect(await db.select().from(pomodoroTaskSteps)).toHaveLength(0)
  })

  it("never lets another account touch a step", async () => {
    const task = await addTask(WEDNESDAY)
    const step = await addTaskStep(userId, task.id, "Mine")
    const stranger = (await insertUser(db)).id
    await expect(
      updateTaskStep(stranger, step.id, { done: true })
    ).rejects.toThrow("STEP_NOT_FOUND")
    await expect(deleteTaskStep(stranger, step.id)).rejects.toThrow(
      "STEP_NOT_FOUND"
    )
    await expect(addTaskStep(stranger, task.id, "Theirs")).rejects.toThrow(
      "TASK_NOT_FOUND"
    )
  })

  it("freezes the steps of a finished task", async () => {
    const task = await addTask(WEDNESDAY)
    const step = await addTaskStep(userId, task.id, "One")
    await toggleTaskStatus(userId, task.id, WEDNESDAY)
    await expect(
      updateTaskStep(userId, step.id, { done: true })
    ).rejects.toThrow("STEP_NOT_FOUND")
  })

  it("carries the steps with their ticks onto the next day", async () => {
    const task = await addTask(TUESDAY)
    const first = await addTaskStep(userId, task.id, "One")
    await addTaskStep(userId, task.id, "Two")
    await updateTaskStep(userId, first.id, { done: true })

    await rollOverTasks(userId, WEDNESDAY)
    const [carried] = await liveTasksOn(WEDNESDAY)
    const steps = await listStepsForTasks([carried.id])
    expect(steps.map((step) => [step.title, step.done])).toEqual([
      ["One", true],
      ["Two", false],
    ])
    // The old day's steps stay where they were.
    expect(await listStepsForTasks([task.id])).toHaveLength(2)
  })
})

describe("a project's hours target", () => {
  it("shows 4 of 10 hours for a weekly target with 4 hours logged", async () => {
    const project = await createProject(userId, "Client A")
    await renameProject(userId, project.id, "Client A", {
      hours: 10,
      period: "week",
    })
    const task = await addTask(WEDNESDAY, { projectId: project.id })
    // Two hours on Monday, two today, and one last Sunday that is not this
    // week.
    await addCompletedFocus(task.id, 120, "2026-10-05T10:00:00Z")
    await addCompletedFocus(task.id, 120, "2026-10-07T10:00:00Z")
    await addCompletedFocus(task.id, 60, "2026-10-04T10:00:00Z")

    const [progress] = await loadProjectTargetProgress(userId, WEDNESDAY, UTC)
    expect(progress).toEqual({
      projectId: project.id,
      targetHours: 10,
      targetPeriod: "week",
      focusSeconds: 4 * 3_600,
    })
  })

  it("counts the whole calendar month for a monthly target", async () => {
    const project = await createProject(userId, "Thesis")
    await renameProject(userId, project.id, "Thesis", {
      hours: 40,
      period: "month",
    })
    const task = await addTask(WEDNESDAY, { projectId: project.id })
    await addCompletedFocus(task.id, 60, "2026-10-01T10:00:00Z")
    await addCompletedFocus(task.id, 60, "2026-09-30T10:00:00Z")
    const [progress] = await loadProjectTargetProgress(userId, WEDNESDAY, UTC)
    expect(progress.focusSeconds).toBe(3_600)
  })

  it("leaves a project with no target out, and clears a target on null", async () => {
    const project = await createProject(userId, "Admin")
    expect(await loadProjectTargetProgress(userId, WEDNESDAY, UTC)).toEqual([])
    await renameProject(userId, project.id, "Admin", { hours: 5, period: "week" })
    const cleared = await renameProject(userId, project.id, "Admin", null)
    expect([cleared.targetHours, cleared.targetPeriod]).toEqual([null, null])
    // A rename without a target leaves the target alone.
    await renameProject(userId, project.id, "Admin", { hours: 5, period: "week" })
    const renamed = await renameProject(userId, project.id, "Admin work")
    expect(renamed.targetHours).toBe(5)
  })

  it("refuses a target with no period in the database itself", async () => {
    const project = await createProject(userId, "Half set")
    await expect(
      db
        .update(pomodoroProjects)
        .set({ targetHours: 10 })
        .where(eq(pomodoroProjects.id, project.id))
    ).rejects.toThrow()
  })
})

describe("tags on tasks", () => {
  it("files two tasks under admin and History totals only their sessions", async () => {
    const email = await addTask(WEDNESDAY, { title: "Email" })
    const invoices = await addTask(WEDNESDAY, { title: "Invoices" })
    const essay = await addTask(WEDNESDAY, { title: "Essay" })
    await setTaskTags(userId, email.id, ["Admin "])
    await setTaskTags(userId, invoices.id, ["admin", "money"])
    await setTaskTags(userId, essay.id, ["writing"])

    const tags = await listTagsForTasks([email.id, invoices.id, essay.id])
    const tagged = new Set(
      tags.filter((tag) => tag.name === "admin").map((tag) => tag.taskId)
    )
    expect(tagged).toEqual(new Set([email.id, invoices.id]))

    await addCompletedFocus(email.id, 25, "2026-10-07T09:00:00Z")
    await addCompletedFocus(invoices.id, 50, "2026-10-07T10:00:00Z")
    await addCompletedFocus(essay.id, 25, "2026-10-07T11:00:00Z")
    await addCompletedFocus(null, 25, "2026-10-07T12:00:00Z")

    const [admin] = (await listAllTags(userId)).filter(
      (tag) => tag.name === "admin"
    )
    const report = await loadFocusReport(userId, "7d", WEDNESDAY, UTC, 0, admin.id)
    expect(report.sessions.totalRows).toBe(2)
    expect(report.sessions.totalSeconds).toBe(75 * 60)
    expect(report.sessions.rows.map((row) => row.taskTitle).sort()).toEqual([
      "Email",
      "Invoices",
    ])
    // The figures above the table stay whole.
    const whole = await loadFocusReport(userId, "7d", WEDNESDAY, UTC)
    expect(whole.sessions.totalRows).toBe(4)
  })

  it("refuses a fourth tag and keeps one spelling per name", async () => {
    const task = await addTask(WEDNESDAY)
    await expect(
      setTaskTags(userId, task.id, ["a", "b", "c", "d"])
    ).rejects.toThrow("TOO_MANY_TAGS")
    expect(await setTaskTags(userId, task.id, ["Deep  Work", "deep work"])).toEqual([
      "deep work",
    ])
  })

  it("matches nothing for another account's tag", async () => {
    const stranger = (await insertUser(db)).id
    const theirs = await db
      .insert(tasks)
      .values({ userId: stranger, title: "Theirs", plannedDate: WEDNESDAY })
      .returning()
    await setTaskTags(stranger, theirs[0].id, ["admin"])
    const [theirTag] = await listAllTags(stranger)
    await addCompletedFocus(null, 25, "2026-10-07T09:00:00Z")
    const report = await loadFocusReport(userId, "7d", WEDNESDAY, UTC, 0, theirTag.id)
    expect(report.sessions.totalRows).toBe(0)
    await expect(setTaskTags(userId, theirs[0].id, ["mine"])).rejects.toThrow(
      "TASK_NOT_FOUND"
    )
  })

  it("drops a tag nobody used for 30 days from the picker without deleting it", async () => {
    const old = await addTask("2026-08-01", { status: "completed" })
    const recent = await addTask(TUESDAY, { status: "completed" })
    // Tags are written while a task is active, so these two are tagged first
    // and finished afterwards, the way a person would.
    await db.update(tasks).set({ status: "active" }).where(eq(tasks.id, old.id))
    await db.update(tasks).set({ status: "active" }).where(eq(tasks.id, recent.id))
    await setTaskTags(userId, old.id, ["reading"])
    await setTaskTags(userId, recent.id, ["email"])

    const picker = await listPickableTags(userId, WEDNESDAY)
    expect(picker.map((tag) => tag.name)).toEqual(["email"])
    expect((await listAllTags(userId)).map((tag) => tag.name)).toEqual([
      "email",
      "reading",
    ])
  })

  it("carries tags with a carried task, and a repeat copy wears its last copy's tags", async () => {
    const carried = await addTask(TUESDAY, { title: "Carry me" })
    await setTaskTags(userId, carried.id, ["admin"])

    const repeating = await addTask(TUESDAY, { title: "Inbox" })
    await setTaskRepeat(userId, repeating.id, TUESDAY, EVERY_DAY)
    await setTaskTags(userId, repeating.id, ["email"])
    await toggleTaskStatus(userId, repeating.id, TUESDAY)

    await rollOverTasks(userId, WEDNESDAY)
    const wednesday = await liveTasksOn(WEDNESDAY)
    const tags = await listTagsForTasks(wednesday.map((task) => task.id))
    const nameOf = (title: string) =>
      tags
        .filter(
          (tag) =>
            tag.taskId === wednesday.find((task) => task.title === title)?.id
        )
        .map((tag) => tag.name)
    expect(nameOf("Carry me")).toEqual(["admin"])
    expect(nameOf("Inbox")).toEqual(["email"])
  })
})
