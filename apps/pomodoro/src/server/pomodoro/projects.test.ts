import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { createProject, listProjects } from "@/server/pomodoro/projects"
import { focusSessions, tasks } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The figures on a project's card on the Tasks page: how many tasks it holds
 * and how much finished focus it has earned, against a real database.
 */

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

async function addTask(projectId: string, status = "active") {
  const [task] = await db
    .insert(tasks)
    .values({ userId, title: "A task", plannedDate: "2026-10-07", projectId, status })
    .returning()
  return task
}

async function addFocus(taskId: string, minutes: number, status = "completed") {
  await db.insert(focusSessions).values({
    userId,
    taskId,
    mode: "focus",
    status,
    plannedSeconds: minutes * 60,
    accumulatedSeconds: minutes * 60,
    completedAt: status === "completed" ? new Date("2026-10-07T12:00:00Z") : null,
    idempotencyKey: `key-${Math.random()}`,
  })
}

describe("listProjects", () => {
  it("counts a project's tasks and finished focus, all time", async () => {
    const project = await createProject(userId, "Thesis")
    const task = await addTask(project.id)
    await addTask(project.id, "completed")
    // A carried copy is the same task on an earlier day, so it is not a second.
    await addTask(project.id, "carried")
    await addFocus(task.id, 25)
    await addFocus(task.id, 50)
    // A focus that was stopped part way earns nothing.
    await addFocus(task.id, 10, "cancelled")

    const [row] = await listProjects(userId)
    expect(row.taskCount).toBe(2)
    expect(row.focusSeconds).toBe(75 * 60)
  })

  it("starts a new project at nothing", async () => {
    const created = await createProject(userId, "Empty")
    expect(created).toMatchObject({ taskCount: 0, focusSeconds: 0 })
    const [row] = await listProjects(userId)
    expect(row).toMatchObject({ taskCount: 0, focusSeconds: 0 })
  })
})
