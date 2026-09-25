import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { loadFocusReport } from "@/server/pomodoro/focus-report"
import { createProject, setProjectArchived } from "@/server/pomodoro/projects"
import { focusSessions, tasks } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * History's per-project split, against a real database.
 *
 * The rule it has to keep: every completed focus in the range is counted
 * exactly once. A session on no task, and a task in no project, belong in the
 * "No project" row rather than being dropped, or the bars stop adding up to
 * the total printed above them.
 */

const TODAY = "2026-09-25"
const UTC = "UTC"

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

async function addTask(projectId: string | null) {
  const [task] = await db
    .insert(tasks)
    .values({ userId, title: "A task", plannedDate: TODAY, projectId })
    .returning()
  return task
}

/** One finished focus of `minutes`, completed at noon UTC today. */
async function addCompletedFocus(taskId: string | null, minutes: number) {
  const seconds = minutes * 60
  await db.insert(focusSessions).values({
    userId,
    taskId,
    mode: "focus",
    status: "completed",
    plannedSeconds: seconds,
    accumulatedSeconds: seconds,
    completedAt: new Date(`${TODAY}T12:00:00Z`),
    idempotencyKey: `key-${Math.random()}`,
  })
}

const projectRow = (
  report: Awaited<ReturnType<typeof loadFocusReport>>,
  name: string | null
) => report.topProjects.find((row) => row.name === name)

describe("the per-project split", () => {
  it("splits two projects by focus time, biggest first", async () => {
    const clientA = await createProject(userId, "Client A")
    const thesis = await createProject(userId, "Thesis")
    const clientTask = await addTask(clientA.id)
    const thesisTask = await addTask(thesis.id)
    await addCompletedFocus(clientTask.id, 25)
    await addCompletedFocus(clientTask.id, 25)
    await addCompletedFocus(thesisTask.id, 25)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(report.topProjects.map((row) => row.name)).toEqual([
      "Client A",
      "Thesis",
    ])
    expect(projectRow(report, "Client A")).toMatchObject({
      sessions: 2,
      focusSeconds: 3000,
    })
    expect(projectRow(report, "Thesis")).toMatchObject({
      sessions: 1,
      focusSeconds: 1500,
    })
  })

  it("puts a task in no project and a session on no task in one neutral row", async () => {
    const loose = await addTask(null)
    await addCompletedFocus(loose.id, 25)
    await addCompletedFocus(null, 25)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(report.topProjects).toHaveLength(1)
    expect(projectRow(report, null)).toMatchObject({
      projectId: null,
      sessions: 2,
      focusSeconds: 3000,
    })
  })

  it("keeps an archived project's hours after it leaves the picker", async () => {
    const project = await createProject(userId, "Old work")
    const task = await addTask(project.id)
    await addCompletedFocus(task.id, 50)
    await setProjectArchived(userId, project.id, true)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(projectRow(report, "Old work")).toMatchObject({
      sessions: 1,
      focusSeconds: 3000,
    })
  })

  // Nothing is silently left out of the grouping, so up to the card's cap of
  // eight projects the bars add up to the total the page prints.
  it("counts every session in the range exactly once", async () => {
    const project = await createProject(userId, "Client A")
    const inProject = await addTask(project.id)
    const loose = await addTask(null)
    await addCompletedFocus(inProject.id, 25)
    await addCompletedFocus(loose.id, 25)
    await addCompletedFocus(null, 10)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    const totalSessions = report.topProjects.reduce(
      (sum, row) => sum + row.sessions,
      0
    )
    expect(totalSessions).toBe(report.sessions.totalRows)
    expect(totalSessions).toBe(3)
  })

  it("leaves out a break and another person's focus", async () => {
    const project = await createProject(userId, "Client A")
    const task = await addTask(project.id)
    await addCompletedFocus(task.id, 25)
    await db.insert(focusSessions).values({
      userId,
      taskId: task.id,
      mode: "short",
      status: "completed",
      plannedSeconds: 300,
      accumulatedSeconds: 300,
      completedAt: new Date(`${TODAY}T13:00:00Z`),
      idempotencyKey: "a-break",
    })
    const other = await insertUser(db)
    await db.insert(focusSessions).values({
      userId: other.id,
      mode: "focus",
      status: "completed",
      plannedSeconds: 1500,
      accumulatedSeconds: 1500,
      completedAt: new Date(`${TODAY}T14:00:00Z`),
      idempotencyKey: "someone-else",
    })

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(report.topProjects).toHaveLength(1)
    expect(projectRow(report, "Client A")).toMatchObject({
      sessions: 1,
      focusSeconds: 1500,
    })
  })
})
