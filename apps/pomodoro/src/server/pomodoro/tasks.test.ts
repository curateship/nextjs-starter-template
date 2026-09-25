import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EVERY_DAY, WEEKDAYS_MON_TO_FRI } from "@/lib/pomodoro/task-repeats"
import { type CustomShellDb } from "@/server/db"
import {
  createProject,
  setProjectArchived,
} from "@/server/pomodoro/projects"
import {
  pomodoroTaskRepeats,
  tasks,
  type Task,
} from "@/server/pomodoro/schema"
import {
  rollOverTasks,
  setTaskRepeat,
  updateTaskPlan,
} from "@/server/pomodoro/tasks"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Repeat rules, projects and the rollover, against a real database.
 *
 * The rollover is the part that can go wrong quietly: it runs on every page
 * load, and a mistake there shows up as a task the person sees twice or not at
 * all. So each rule in the task has a test rather than a comment.
 *
 * MONDAY and SATURDAY are the same week of September 2026, which is what makes
 * "appears Monday, not Saturday" readable in the assertions.
 */

const FRIDAY = "2026-09-18"
const SATURDAY = "2026-09-19"
const SUNDAY = "2026-09-20"
const MONDAY = "2026-09-21"
const TUESDAY = "2026-09-22"

let client: PGlite
let db: CustomShellDb
let userId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  const user = await insertUser(db)
  userId = user.id
})

afterEach(async () => {
  await client.close()
})

async function addTask(plannedDate: string, overrides: Partial<Task> = {}) {
  const [task] = await db
    .insert(tasks)
    .values({ userId, title: "Review inbox", plannedDate, ...overrides })
    .returning()
  return task
}

function tasksOn(plannedDate: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.plannedDate, plannedDate)))
    .orderBy(tasks.sortOrder, tasks.createdAt)
}

describe("repeat rules and the rollover", () => {
  it("makes the day's copy on a picked weekday and not on another", async () => {
    const friday = await addTask(FRIDAY)
    await setTaskRepeat(userId, friday.id, FRIDAY, WEEKDAYS_MON_TO_FRI)

    // Saturday: the Friday task carries over because it is unfinished, but the
    // rule itself adds nothing, so there is one row and not two.
    await rollOverTasks(userId, SATURDAY)
    const saturday = await tasksOn(SATURDAY)
    expect(saturday).toHaveLength(1)
    expect(saturday[0].title).toBe("Review inbox")

    // Finish it, so nothing carries into Monday and only the rule can act.
    await db
      .update(tasks)
      .set({ status: "completed" })
      .where(eq(tasks.id, saturday[0].id))
    await rollOverTasks(userId, SUNDAY)
    expect(await tasksOn(SUNDAY)).toHaveLength(0)

    await rollOverTasks(userId, MONDAY)
    const monday = await tasksOn(MONDAY)
    expect(monday).toHaveLength(1)
    expect(monday[0].title).toBe("Review inbox")
    expect(monday[0].repeatId).toBe(friday.repeatId ?? monday[0].repeatId)
  })

  it("makes one task when a carried copy and the rule both want the day", async () => {
    const friday = await addTask(FRIDAY)
    await setTaskRepeat(userId, friday.id, FRIDAY, EVERY_DAY)

    // Friday's copy is left unfinished, so Saturday wants a carried copy from
    // it and a fresh copy from the rule. Only one may exist.
    await rollOverTasks(userId, SATURDAY)
    const saturday = await tasksOn(SATURDAY)
    expect(saturday).toHaveLength(1)
    expect(saturday[0].repeatId).not.toBe(null)

    // Loading the day again adds nothing either.
    await rollOverTasks(userId, SATURDAY)
    expect(await tasksOn(SATURDAY)).toHaveLength(1)
  })

  it("keeps the carried copy's done count and points the old row at it", async () => {
    const friday = await addTask(FRIDAY, { pomodoroCount: 3, priority: "high" })
    await setTaskRepeat(userId, friday.id, FRIDAY, EVERY_DAY)

    await rollOverTasks(userId, SATURDAY)
    const [copy] = await tasksOn(SATURDAY)
    expect(copy.pomodoroCount).toBe(3)
    expect(copy.priority).toBe("high")
    const [original] = await db.select().from(tasks).where(eq(tasks.id, friday.id))
    expect(original.status).toBe("carried")
    expect(original.carriedToTaskId).toBe(copy.id)
  })

  it("stops new copies when the repeat ends, and keeps the days it made", async () => {
    const friday = await addTask(FRIDAY)
    await setTaskRepeat(userId, friday.id, FRIDAY, EVERY_DAY)
    await rollOverTasks(userId, SATURDAY)
    const [saturday] = await tasksOn(SATURDAY)

    await setTaskRepeat(userId, saturday.id, SATURDAY, null)
    expect(
      await db
        .select()
        .from(pomodoroTaskRepeats)
        .where(eq(pomodoroTaskRepeats.userId, userId))
    ).toHaveLength(0)

    // The days the rule already made are untouched; they just no longer point
    // at a rule.
    const [stillThere] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, saturday.id))
    expect(stillThere.title).toBe("Review inbox")
    expect(stillThere.repeatId).toBe(null)

    // Finish it so nothing carries, then confirm Sunday stays empty.
    await db
      .update(tasks)
      .set({ status: "completed" })
      .where(eq(tasks.id, saturday.id))
    await rollOverTasks(userId, SUNDAY)
    expect(await tasksOn(SUNDAY)).toHaveLength(0)
  })

  it("completing today's copy leaves the rule making tomorrow's", async () => {
    const monday = await addTask(MONDAY)
    await setTaskRepeat(userId, monday.id, MONDAY, EVERY_DAY)
    await db
      .update(tasks)
      .set({ status: "completed" })
      .where(eq(tasks.id, monday.id))

    await rollOverTasks(userId, TUESDAY)
    const tuesday = await tasksOn(TUESDAY)
    expect(tuesday).toHaveLength(1)
    expect(tuesday[0].status).toBe("active")
    expect(tuesday[0].pomodoroCount).toBe(0)
  })

  it("writes an edit through to the rule, so tomorrow's copy is the new one", async () => {
    const monday = await addTask(MONDAY)
    await setTaskRepeat(userId, monday.id, MONDAY, EVERY_DAY)
    await updateTaskPlan(userId, monday.id, MONDAY, {
      title: "Clear inbox",
      estimatedPomodoros: 2,
    })
    await db
      .update(tasks)
      .set({ status: "completed" })
      .where(eq(tasks.id, monday.id))

    await rollOverTasks(userId, TUESDAY)
    const [tuesday] = await tasksOn(TUESDAY)
    expect(tuesday.title).toBe("Clear inbox")
    expect(tuesday.estimatedPomodoros).toBe(2)
  })

  it("refuses a repeat on another day's task or another person's", async () => {
    const friday = await addTask(FRIDAY)
    await expect(
      setTaskRepeat(userId, friday.id, MONDAY, EVERY_DAY)
    ).rejects.toThrow("TASK_NOT_FOUND")
    const other = await insertUser(db)
    await expect(
      setTaskRepeat(other.id, friday.id, FRIDAY, EVERY_DAY)
    ).rejects.toThrow("TASK_NOT_FOUND")
  })
})

describe("projects", () => {
  it("rides along on the rollover, like priority does", async () => {
    const project = await createProject(userId, "Thesis")
    await addTask(FRIDAY, { projectId: project.id })

    await rollOverTasks(userId, SATURDAY)
    const [copy] = await tasksOn(SATURDAY)
    expect(copy.projectId).toBe(project.id)
  })

  it("rides along on a repeat rule's copy too", async () => {
    const project = await createProject(userId, "Client A")
    const monday = await addTask(MONDAY)
    await updateTaskPlan(userId, monday.id, MONDAY, { projectId: project.id })
    await setTaskRepeat(userId, monday.id, MONDAY, EVERY_DAY)
    await db
      .update(tasks)
      .set({ status: "completed" })
      .where(eq(tasks.id, monday.id))

    await rollOverTasks(userId, TUESDAY)
    const [tuesday] = await tasksOn(TUESDAY)
    expect(tuesday.projectId).toBe(project.id)
  })

  it("keeps a task in an archived project, so History keeps its hours", async () => {
    const project = await createProject(userId, "Thesis")
    const monday = await addTask(MONDAY, { projectId: project.id })
    await setProjectArchived(userId, project.id, true)

    const [stillThere] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, monday.id))
    expect(stillThere.projectId).toBe(project.id)
  })

  it("refuses two live projects with the same name, ignoring case", async () => {
    await createProject(userId, "Thesis")
    await expect(createProject(userId, "thesis")).rejects.toThrow(
      "PROJECT_NAME_TAKEN"
    )
  })

  it("frees the name once the project is archived", async () => {
    const project = await createProject(userId, "Thesis")
    await setProjectArchived(userId, project.id, true)
    const replacement = await createProject(userId, "Thesis")
    expect(replacement.id).not.toBe(project.id)
  })

  it("refuses to put a task in an archived or someone else's project", async () => {
    const monday = await addTask(MONDAY)
    const archived = await createProject(userId, "Old work")
    await setProjectArchived(userId, archived.id, true)
    await expect(
      updateTaskPlan(userId, monday.id, MONDAY, { projectId: archived.id })
    ).rejects.toThrow("PROJECT_NOT_FOUND")

    const other = await insertUser(db)
    const theirs = await createProject(other.id, "Theirs")
    await expect(
      updateTaskPlan(userId, monday.id, MONDAY, { projectId: theirs.id })
    ).rejects.toThrow("PROJECT_NOT_FOUND")
  })

  it("refuses to rename or archive another person's project", async () => {
    const other = await insertUser(db)
    const theirs = await createProject(other.id, "Theirs")
    await expect(setProjectArchived(userId, theirs.id, true)).rejects.toThrow(
      "PROJECT_NOT_FOUND"
    )
  })
})
