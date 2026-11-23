import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { loadFocusReport, loadWeekReview } from "@/server/pomodoro/focus-report"
import { createProject, setProjectArchived } from "@/server/pomodoro/projects"
import { dailyFocusStats, focusSessions, tasks } from "@/server/pomodoro/schema"
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


/** One finished focus of `minutes`, completed at the given instant. */
async function addFocusAt(instant: string, minutes: number, taskId: string | null = null) {
  const seconds = minutes * 60
  await db.insert(focusSessions).values({
    userId,
    taskId,
    mode: "focus",
    status: "completed",
    plannedSeconds: seconds,
    accumulatedSeconds: seconds,
    completedAt: new Date(instant),
    idempotencyKey: `key-${Math.random()}`,
  })
}

async function addDay(localDate: string, minutes: number, sessions = 1) {
  await db.insert(dailyFocusStats).values({
    userId,
    localDate,
    focusSessions: sessions,
    focusSeconds: minutes * 60,
    tasksCompleted: 0,
  })
}

const hoursWithSessions = (report: Awaited<ReturnType<typeof loadFocusReport>>) =>
  report.hours.filter((hour) => hour.sessions > 0).map((hour) => hour.hour)

describe("the hour-of-day split", () => {
  it("always answers with all 24 hours, so the chart's axis never moves", async () => {
    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(report.hours).toHaveLength(24)
    expect(report.hours.map((hour) => hour.hour)).toEqual(
      Array.from({ length: 24 }, (_, index) => index)
    )
    expect(hoursWithSessions(report)).toEqual([])
  })

  it("puts a 9am and a 2pm focus in those two hours and nowhere else", async () => {
    await addFocusAt(`${TODAY}T09:15:00Z`, 25)
    await addFocusAt(`${TODAY}T09:45:00Z`, 25)
    await addFocusAt(`${TODAY}T14:05:00Z`, 50)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(hoursWithSessions(report)).toEqual([9, 14])
    expect(report.hours[9]).toMatchObject({ sessions: 2, focusSeconds: 3000 })
    expect(report.hours[14]).toMatchObject({ sessions: 1, focusSeconds: 3000 })
  })

  it("counts the hour in the profile's timezone, not in UTC", async () => {
    // 01:30 UTC is 21:30 the evening before in New York, so an evening focus
    // must read as the evening rather than as the small hours.
    await addFocusAt("2026-09-25T01:30:00Z", 25)

    const report = await loadFocusReport(userId, "7d", TODAY, "America/New_York")
    expect(hoursWithSessions(report)).toEqual([21])
  })

  it("counts every session in the range exactly once", async () => {
    await addFocusAt(`${TODAY}T09:15:00Z`, 25)
    await addFocusAt(`${TODAY}T11:00:00Z`, 25)
    await addFocusAt("2026-09-23T16:00:00Z", 25)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    const counted = report.hours.reduce((sum, hour) => sum + hour.sessions, 0)
    expect(counted).toBe(report.sessions.totalRows)
    expect(counted).toBe(3)
  })

  it("leaves out a session outside the range", async () => {
    await addFocusAt("2026-08-01T09:00:00Z", 25)

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    expect(hoursWithSessions(report)).toEqual([])
  })
})

/**
 * The week review. TODAY (25 Sep 2026) is a Friday, so this week starts Monday
 * 21 Sep and last week starts Monday 14 Sep.
 */
describe("the week review", () => {
  it("starts the week on the Monday before today", async () => {
    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.weekStart).toBe("2026-09-21")
  })

  it("starts the week on the same day when today is that Monday", async () => {
    const review = await loadWeekReview(userId, "2026-09-21", UTC)
    expect(review.weekStart).toBe("2026-09-21")
  })

  it("says six hours against four, and names the best day", async () => {
    await addDay("2026-09-21", 120)
    await addDay("2026-09-23", 240, 2)
    await addDay("2026-09-16", 240)

    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.thisWeekSeconds).toBe(6 * 3_600)
    expect(review.lastWeekSeconds).toBe(4 * 3_600)
    expect(review.hasLastWeek).toBe(true)
    expect(review.bestDay).toEqual({
      localDate: "2026-09-23",
      focusSeconds: 4 * 3_600,
    })
  })

  it("has no last week on an account that has never recorded a day before it", async () => {
    await addDay("2026-09-22", 90)

    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.hasLastWeek).toBe(false)
    expect(review.lastWeekSeconds).toBe(0)
  })

  // A quiet week is a real comparison, and it is not the first week.
  it("has a last week of zero when the account was active before it", async () => {
    await addDay("2026-09-01", 120)
    await addDay("2026-09-22", 90)

    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.hasLastWeek).toBe(true)
    expect(review.lastWeekSeconds).toBe(0)
  })

  it("has no best day and no project on an empty week", async () => {
    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.bestDay).toBeNull()
    expect(review.topProject).toBeNull()
    expect(review.thisWeekSeconds).toBe(0)
  })

  it("names the project that took the most of this week only", async () => {
    const clientA = await createProject(userId, "Client A")
    const thesis = await createProject(userId, "Thesis")
    const clientTask = await addTask(clientA.id)
    const thesisTask = await addTask(thesis.id)
    await addFocusAt("2026-09-22T10:00:00Z", 25, clientTask.id)
    await addFocusAt("2026-09-23T10:00:00Z", 25, clientTask.id)
    await addFocusAt("2026-09-24T10:00:00Z", 60, thesisTask.id)
    // Last week's much longer session must not win this week's row.
    await addFocusAt("2026-09-16T10:00:00Z", 600, clientTask.id)

    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.topProject).toEqual({ name: "Thesis", focusSeconds: 3600 })
  })

  it("names no project when this week's focus was on no task", async () => {
    await addFocusAt("2026-09-22T10:00:00Z", 25)

    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.topProject).toEqual({ name: null, focusSeconds: 1500 })
  })

  it("names the hour most of this week's sessions finished in", async () => {
    await addFocusAt("2026-09-22T16:10:00Z", 25)
    await addFocusAt("2026-09-23T16:40:00Z", 25)
    await addFocusAt("2026-09-24T09:00:00Z", 25)
    // Three sessions at 08:00 last week must not outvote this week's two.
    await addFocusAt("2026-09-15T08:00:00Z", 25)
    await addFocusAt("2026-09-16T08:00:00Z", 25)
    await addFocusAt("2026-09-17T08:00:00Z", 25)

    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.busiestHour).toBe(16)
  })

  it("names no busiest hour on an empty week", async () => {
    const review = await loadWeekReview(userId, TODAY, UTC)
    expect(review.busiestHour).toBeNull()
    expect(review.currentStreak).toBe(0)
  })
})
