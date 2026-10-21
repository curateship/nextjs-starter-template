import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { dayOffNote } from "@/lib/project/days-off"
import { timeOnTasks } from "@/lib/project/clock"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { addHoliday } from "@/server/project/holidays"
import { createLabel } from "@/server/project/labels"
import { answerMoreTime, askForMoreTime } from "@/server/project/more-time"
import { addProjectMember } from "@/server/project/projects"
import {
  projectNoticeLinks,
  projectTaskClockRuns,
  projectTaskEvents,
  projectTaskLabels,
  projectTasks,
} from "@/server/project/schema"
import { changeManyTasks } from "@/server/project/task-changes"
import { projectClockSeconds } from "@/server/project/task-clock-runs"
import { createTaskType } from "@/server/project/task-types"
import { loadDaysOff, loadNeedsAttention } from "@/server/project/team-running"
import { listTeams } from "@/server/project/teams"
import { addTimeOff } from "@/server/project/time-off"
import {
  assignTask,
  createTask,
  listTaskCards,
  loadTaskDetail,
  setTaskStatus,
  updateTask,
} from "@/server/project/tasks"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

/*
 * The seven features Tyler picked on 20 Oct 2026
 * (`workspace/tasks/New features 20 Oct/01-seven-features.md`). Dates are in
 * 2099 so nothing here meets the real today. 2 March 2099 is a Monday and the
 * team is on UTC. Anna hands work to Ben; the site admin runs the team.
 */
const MONDAY = "2099-03-02"
const WEDNESDAY = "2099-03-04"
const FRIDAY = "2099-03-06"
const NEXT_MONDAY = "2099-03-09"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let admin: CustomShellUser
let teamId: string
let projectId: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  const started = await startTeam(database, [anna, ben])
  admin = started.admin
  teamId = started.team.id
  const project = await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)
  projectId = project.id
  await addProjectMember(admin.id, projectId, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

/** A task Anna hands to Ben, or makes for herself. */
async function task(title: string, { by = anna, to = ben, due = null as string | null } = {}) {
  const made = await createTask(
    actor(by),
    { projectId, title, notes: "", assigneeUserId: to?.id ?? null, dueDate: due, steps: [] },
    database
  )
  return made.id
}

async function row(taskId: string) {
  const [found] = await database.select().from(projectTasks).where(eq(projectTasks.id, taskId))
  return found
}

async function noticeKinds() {
  return (await database.select({ kind: projectNoticeLinks.kind }).from(projectNoticeLinks)).map((n) => n.kind)
}

describe("part 1, a due date on a day off", () => {
  it("lists time off and holidays as dates only, and words the warning", async () => {
    await addTimeOff(ben.id, { firstDay: WEDNESDAY, lastDay: FRIDAY }, database)
    await inTeam(teamId, () => addHoliday(admin.id, { day: NEXT_MONDAY, name: "Founders Day" }, database))
    const daysOff = await loadDaysOff(anna.id, database)
    expect(daysOff.away[ben.id]).toEqual([{ first: WEDNESDAY, last: FRIDAY }])
    expect(daysOff.holidays).toEqual([{ day: NEXT_MONDAY, name: "Founders Day" }])
    expect(dayOffNote(daysOff, WEDNESDAY, { id: ben.id, name: "Ben" })).toBe("Ben is away Mar 4, 2099.")
    expect(dayOffNote(daysOff, NEXT_MONDAY, { id: anna.id, name: "Anna" })).toBe(
      "Mar 9, 2099 is a team holiday, Founders Day."
    )
    expect(dayOffNote(daysOff, MONDAY, { id: ben.id, name: "Ben" })).toBeNull()
    expect(dayOffNote(daysOff, WEDNESDAY, null)).toBeNull()
  })

  it("counts a bulk due date that lands on someone's day off", async () => {
    await addTimeOff(ben.id, { firstDay: WEDNESDAY, lastDay: WEDNESDAY }, database)
    const bens = await task("Ben's")
    const annas = await task("Anna's", { to: anna })
    const outcome = await changeManyTasks(
      actor(anna),
      { taskIds: [bens, annas], change: { kind: "due", dueDate: WEDNESDAY } },
      database
    )
    expect(outcome.changed).toHaveLength(2)
    expect(outcome.onDaysOff).toBe(1)
  })
})

describe("part 2, ask for more time", () => {
  it("asks whoever handed it out, and a yes moves the date and counts as a move", async () => {
    const id = await task("Homepage", { due: WEDNESDAY })
    await askForMoreTime(actor(ben), { taskId: id, day: FRIDAY, reason: "Waiting on the photos" }, database)
    expect(await noticeKinds()).toContain("task_time_asked")
    const annaSees = await loadTaskDetail(anna.id, id, database)
    expect(annaSees.moreTime).toMatchObject({ day: FRIDAY, askedByName: "Ben", answererName: "Anna", canAnswer: true })
    const benSees = await loadTaskDetail(ben.id, id, database)
    expect(benSees.moreTime?.canAnswer).toBe(false)

    await answerMoreTime(actor(anna), { taskId: id, answer: "yes" }, database)
    const after = await row(id)
    expect(after.dueDate).toBe(FRIDAY)
    expect(after.moreTimeDay).toBeNull()
    const [card] = await listTaskCards(eq(projectTasks.id, id), database)
    expect(card.dueMoves).toBe(1)
    expect(await noticeKinds()).toContain("task_time_answered")
    const kinds = (await loadTaskDetail(ben.id, id, database)).history.map((entry) => entry.kind)
    expect(kinds).toEqual(expect.arrayContaining(["time_asked", "time_agreed"]))
  })

  it("a no keeps the date and says why", async () => {
    const id = await task("Homepage", { due: WEDNESDAY })
    await askForMoreTime(actor(ben), { taskId: id, day: FRIDAY, reason: "Photos" }, database)
    await answerMoreTime(actor(anna), { taskId: id, answer: "no", reason: "The client needs it" }, database)
    const after = await row(id)
    expect(after.dueDate).toBe(WEDNESDAY)
    expect(after.moreTimeDay).toBeNull()
  })

  it("refuses an ask from anyone but the person doing it, and for an earlier day", async () => {
    const id = await task("Homepage", { due: WEDNESDAY })
    await expect(
      askForMoreTime(actor(anna), { taskId: id, day: FRIDAY, reason: "x" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.cantAskForTime)
    await expect(
      askForMoreTime(actor(ben), { taskId: id, day: MONDAY, reason: "x" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.askForLaterDay)
    const undated = await task("No date")
    await expect(
      askForMoreTime(actor(ben), { taskId: undated, day: FRIDAY, reason: "x" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.askNeedsDueDate)
  })

  it("the site admin answers a task the person made for themselves", async () => {
    const id = await task("My own", { by: ben, due: WEDNESDAY })
    await askForMoreTime(actor(ben), { taskId: id, day: FRIDAY, reason: "Busy week" }, database)
    expect((await loadTaskDetail(ben.id, id, database)).moreTime?.answererName).toBeNull()
    await expect(answerMoreTime(actor(anna), { taskId: id, answer: "yes" }, database)).rejects.toThrow(
      PROJECT_ERRORS.cantAnswerTime
    )
    await inTeam(teamId, () => answerMoreTime(actor(admin), { taskId: id, answer: "yes" }, database))
    expect((await row(id)).dueDate).toBe(FRIDAY)
  })

  it("ends the ask once the date has already moved that far", async () => {
    const id = await task("Moved", { due: WEDNESDAY })
    await askForMoreTime(actor(ben), { taskId: id, day: FRIDAY, reason: "x" }, database)
    await updateTask(actor(anna), { taskId: id, dueDate: NEXT_MONDAY }, database)
    expect((await loadTaskDetail(anna.id, id, database)).moreTime).toBeNull()
    await expect(answerMoreTime(actor(anna), { taskId: id, answer: "yes" }, database)).rejects.toThrow(
      PROJECT_ERRORS.noTimeAsked
    )
  })

  it("ends the ask when the task is handed on or Done", async () => {
    const handed = await task("Handed", { due: WEDNESDAY })
    await askForMoreTime(actor(ben), { taskId: handed, day: FRIDAY, reason: "x" }, database)
    await assignTask(actor(anna), { taskId: handed, assigneeUserId: anna.id }, database)
    expect((await loadTaskDetail(anna.id, handed, database)).moreTime).toBeNull()
    await expect(answerMoreTime(actor(anna), { taskId: handed, answer: "yes" }, database)).rejects.toThrow(
      PROJECT_ERRORS.noTimeAsked
    )

    const done = await task("Done", { due: WEDNESDAY })
    await askForMoreTime(actor(ben), { taskId: done, day: FRIDAY, reason: "x" }, database)
    await setTaskStatus(actor(ben), { taskId: done, status: "done", stuckReason: null }, database)
    await setTaskStatus(actor(ben), { taskId: done, status: "doing", stuckReason: null }, database)
    expect((await loadTaskDetail(anna.id, done, database)).moreTime).toBeNull()
  })
})

describe("part 3, every team's morning on the Teams dashboard", () => {
  it("says Day off, Not yet, or who has checked in, and counts Stuck and overdue", async () => {
    const stuck = await task("Stuck one", { due: MONDAY })
    await setTaskStatus(actor(ben), { taskId: stuck, status: "stuck", stuckReason: "No key" }, database)
    await task("Late", { due: MONDAY })
    await task("Not late", { due: FRIDAY })

    const [early] = await listTeams(admin.id, database, at(`${WEDNESDAY}T06:00:00Z`))
    expect(early.today).toEqual({ state: "not_yet" })
    expect(early.stuck).toBe(1)
    expect(early.overdue).toBe(2)

    const [later] = await listTeams(admin.id, database, at(`${WEDNESDAY}T12:00:00Z`))
    expect(later.today).toEqual({ state: "counted", checkedIn: 0, expected: 2 })

    const [saturday] = await listTeams(admin.id, database, at("2099-03-07T12:00:00Z"))
    expect(saturday.today).toEqual({ state: "day_off" })
  })
})

describe("part 4, time on the project", () => {
  it("adds every stretch, fix and running clock on its tasks, leaving out the bin", async () => {
    const id = await task("Clocked")
    await database.insert(projectTaskClockRuns).values([
      { id: "r1", taskId: id, userId: ben.id, kind: "run", startedAt: at(`${MONDAY}T09:00:00Z`), stoppedAt: at(`${MONDAY}T10:00:00Z`), seconds: 3600 },
      { id: "r2", taskId: id, userId: ben.id, kind: "fix", startedAt: at(`${MONDAY}T11:00:00Z`), stoppedAt: at(`${MONDAY}T11:00:00Z`), seconds: -600 },
      { id: "r3", taskId: id, userId: ben.id, kind: "run", startedAt: at(`${MONDAY}T12:00:00Z`) },
    ])
    const totals = await projectClockSeconds([projectId], database, at(`${MONDAY}T12:30:00Z`))
    expect(totals.get(projectId)).toBe(3600 - 600 + 1800)

    await database.update(projectTasks).set({ deletedAt: new Date() }).where(eq(projectTasks.id, id))
    expect((await projectClockSeconds([projectId], database)).get(projectId)).toBeUndefined()
  })

  it("adds every task's clock, a running one up to now", () => {
    const seconds = timeOnTasks(
      [
        { clock: { seconds: 7200, runningSince: null } },
        { clock: { seconds: 1800, runningSince: new Date(Date.parse("2099-03-02T12:00:00Z") - 600_000).toISOString() } },
      ],
      Date.parse("2099-03-02T12:00:00Z")
    )
    expect(seconds).toBe(7200 + 1800 + 600)
  })
})

describe("part 5, more bulk changes", () => {
  it("sets priority, adds and takes off a tag, and refuses a type for someone who didn't hand it out", async () => {
    const one = await task("One")
    const two = await task("Two")
    const label = await createLabel(anna.id, { name: "Urgent", color: "red" }, database)
    const both = { taskIds: [one, two] }

    await changeManyTasks(actor(ben), { ...both, change: { kind: "priority", priority: "high" } }, database)
    expect((await row(one)).priority).toBe("high")

    await changeManyTasks(actor(ben), { ...both, change: { kind: "tag", labelId: label.id, on: true } }, database)
    await changeManyTasks(actor(ben), { ...both, change: { kind: "tag", labelId: label.id, on: true } }, database)
    expect(await database.select().from(projectTaskLabels)).toHaveLength(2)
    await changeManyTasks(actor(ben), { taskIds: [one], change: { kind: "tag", labelId: label.id, on: false } }, database)
    expect(await database.select().from(projectTaskLabels)).toHaveLength(1)

    const type = await inTeam(teamId, () =>
      createTaskType(admin.id, { name: "Video", icon: "video", color: "red" }, database)
    )
    const outcome = await changeManyTasks(actor(ben), { ...both, change: { kind: "type", typeId: type.id } }, database)
    expect(outcome.changed).toEqual([])
    expect(outcome.refused.map((r) => r.reason)).toEqual([PROJECT_ERRORS.cantChangeType, PROJECT_ERRORS.cantChangeType])
    const byAnna = await changeManyTasks(actor(anna), { ...both, change: { kind: "type", typeId: type.id } }, database)
    expect(byAnna.changed).toHaveLength(2)
  })
})

describe("part 6, untouched tasks in Needs attention", () => {
  it("lists an open task nobody has touched in 14 days, but not a snoozed one", async () => {
    const old = await task("Old")
    const snoozed = await task("Snoozed")
    const fresh = await task("Fresh")
    const longAgo = at("2099-02-01T09:00:00Z")
    for (const id of [old, snoozed, fresh]) {
      await database.update(projectTasks).set({ updatedAt: longAgo, createdAt: longAgo }).where(eq(projectTasks.id, id))
    }
    // History rows written as each task was made count as touches, so move them back too.
    await database.update(projectTaskEvents).set({ createdAt: longAgo })
    await database.update(projectTasks).set({ snoozedUntil: "2099-04-01" }).where(eq(projectTasks.id, snoozed))
    await database.update(projectTasks).set({ updatedAt: at(`${MONDAY}T09:00:00Z`) }).where(eq(projectTasks.id, fresh))

    const rows = await inTeam(teamId, () => loadNeedsAttention(admin.id, database, at(`${MONDAY}T12:00:00Z`)))
    const untouched = rows.filter((r) => r.kind === "untouched")
    expect(untouched.map((r) => r.title)).toEqual(["Old"])
    expect(untouched[0].howLong).toBe("Untouched for 29 days")
  })
})
