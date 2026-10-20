import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { checkOut, loadCheckinPage, submitCheckin } from "@/server/project/checkins"
import { addProjectMember, setProjectArchived } from "@/server/project/projects"
import { projectTaskClockRuns, projectTasks } from "@/server/project/schema"
import { pauseClock, pauseClocksAtMidnight, setClockTotal, startClock } from "@/server/project/task-clock"
import { pauseTaskClock } from "@/server/project/task-clock-runs"
import { loadWorkload } from "@/server/project/team-running"
import {
  assignTask,
  createTask,
  listTaskCards,
  loadTaskDetail,
  setTaskStatus,
} from "@/server/project/tasks"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

/*
 * The task clock (Task panel task 01, Tyler, 20 Oct 2026). Dates are in 2099
 * so nothing here meets the real today. 2 March 2099 is a Monday, and the team
 * is on UTC. Ben does the work; Anna is on the project; the site admin runs it.
 */
const MONDAY = "2099-03-02"
const TUESDAY = "2099-03-03"
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

async function task(title: string, assignee: CustomShellUser | null = ben) {
  const made = await createTask(
    actor(assignee ?? anna),
    { projectId, title, notes: "", assigneeUserId: assignee?.id ?? null, dueDate: null, steps: [] },
    database
  )
  return made.id
}

async function card(taskId: string) {
  const [found] = await listTaskCards(eq(projectTasks.id, taskId), database)
  return found
}

async function historyKinds(taskId: string) {
  const detail = await loadTaskDetail(ben.id, taskId, database)
  return detail.history.map((entry) => entry.kind)
}

describe("Start task and Pause", () => {
  it("moves the task to Doing and adds each stretch to its time", async () => {
    const id = await task("Fix the login page")
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    let found = await card(id)
    expect(found.status).toBe("doing")
    expect(found.clock.runningSince).toBe(`${MONDAY}T09:00:00.000Z`)

    await pauseClock(actor(ben), id, database, at(`${MONDAY}T09:45:00Z`))
    await startClock(actor(ben), id, database, at(`${MONDAY}T13:00:00Z`))
    await pauseClock(actor(ben), id, database, at(`${MONDAY}T13:35:00Z`))
    found = await card(id)
    expect(found.clock).toEqual({ seconds: 80 * 60, runningSince: null })
    expect(await historyKinds(id)).toEqual(
      expect.arrayContaining(["clock_started", "clock_paused"])
    )
  })

  it("keeps one clock per person: starting another pauses the first and names it", async () => {
    const first = await task("Write the copy")
    const second = await task("Book the venue")
    await startClock(actor(ben), first, database, at(`${MONDAY}T09:00:00Z`))
    const result = await startClock(actor(ben), second, database, at(`${MONDAY}T09:30:00Z`))
    expect(result.pausedTitle).toBe("Write the copy")
    expect((await card(first)).clock).toEqual({ seconds: 30 * 60, runningSince: null })
    expect((await card(second)).clock.runningSince).not.toBeNull()
  })

  it("makes a task nobody has the starter's, with a history line", async () => {
    const id = await task("Nobody's", null)
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    const found = await card(id)
    expect(found.assignee?.id).toBe(ben.id)
    expect(found.waiting).toBe(false)
    expect(await historyKinds(id)).toContain("took")
  })

  it("accepts a task handed over and not yet accepted", async () => {
    const id = await task("Handed", null)
    await assignTask(actor(anna), { taskId: id, assigneeUserId: ben.id }, database)
    expect((await card(id)).waiting).toBe(true)
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    expect((await card(id)).waiting).toBe(false)
  })

  it("refuses anyone but the person assigned, and lets the site admin run it for them", async () => {
    const id = await task("Ben's")
    await expect(startClock(actor(anna), id, database)).rejects.toThrow(PROJECT_ERRORS.clockNotYours)
    await inTeam(teamId, () => startClock(actor(admin), id, database, at(`${MONDAY}T09:00:00Z`)))
    const [run] = await database.select().from(projectTaskClockRuns).where(eq(projectTaskClockRuns.taskId, id))
    expect(run.userId).toBe(ben.id)
    await expect(pauseClock(actor(anna), id, database)).rejects.toThrow(PROJECT_ERRORS.clockNotYours)
  })

  it("tells the panel who may run it", async () => {
    const id = await task("Ben's")
    expect((await loadTaskDetail(ben.id, id, database)).canRunClock).toBe(true)
    expect((await loadTaskDetail(anna.id, id, database)).canRunClock).toBe(false)
    const nobodys = await task("Nobody's", null)
    expect((await loadTaskDetail(anna.id, nobodys, database)).canRunClock).toBe(true)
  })
})

describe("The clock pauses by itself", () => {
  it("on Stuck, on Done, and on a hand-over", async () => {
    for (const change of ["stuck", "done", "handover"] as const) {
      const id = await task(`Pauses on ${change}`)
      await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
      if (change === "handover") {
        await assignTask(actor(ben), { taskId: id, assigneeUserId: anna.id }, database)
      } else {
        await setTaskStatus(
          actor(ben),
          { taskId: id, status: change, stuckReason: change === "stuck" ? "Waiting on the client" : null },
          database
        )
      }
      expect((await card(id)).clock.runningSince).toBeNull()
    }
  })

  it("Start again on a Done task moves it back to Doing and carries on from its total", async () => {
    const id = await task("Done once")
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    await pauseClock(actor(ben), id, database, at(`${MONDAY}T10:00:00Z`))
    await setTaskStatus(actor(ben), { taskId: id, status: "done", stuckReason: null }, database)
    await startClock(actor(ben), id, database, at(`${MONDAY}T11:00:00Z`))
    await pauseClock(actor(ben), id, database, at(`${MONDAY}T11:15:00Z`))
    const found = await card(id)
    expect(found.status).toBe("doing")
    expect(found.clock.seconds).toBe(75 * 60)
  })

  it("at check-out", async () => {
    const id = await task("Long one")
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:10:00Z`))
    await checkOut(actor(ben), { doneTaskIds: [], noteLeft: null }, database, at(`${MONDAY}T17:00:00Z`))
    expect((await card(id)).clock.runningSince).toBeNull()
  })

  it("at midnight in the person's zone, counting nothing after it, with a bell notice", async () => {
    const id = await task("Left running")
    await startClock(actor(ben), id, database, at(`${MONDAY}T20:00:00Z`))
    // Before midnight nothing happens.
    await pauseClocksAtMidnight(database, at(`${MONDAY}T23:59:00Z`))
    expect((await card(id)).clock.runningSince).not.toBeNull()

    await pauseClocksAtMidnight(database, at(`${TUESDAY}T08:00:00Z`))
    expect((await card(id)).clock).toEqual({ seconds: 4 * 60 * 60, runningSince: null })
    const notices = await database
      .select({ message: customShellNotifications.message, detail: customShellNotifications.detail })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, ben.id))
    expect(notices).toContainEqual({
      message: "Clock paused at midnight: Left running",
      detail: "Website · 4h in all",
    })
  })
})

describe("The audit's three fixes", () => {
  it("a pause aimed at one stretch never stops a newer one", async () => {
    const id = await task("Restarted")
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    const [first] = await database.select().from(projectTaskClockRuns).where(eq(projectTaskClockRuns.taskId, id))
    await pauseClock(actor(ben), id, database, at(`${MONDAY}T09:30:00Z`))
    await startClock(actor(ben), id, database, at(`${MONDAY}T10:00:00Z`))
    // A job that found the first stretch running a moment ago now misses it.
    expect(await pauseTaskClock(database, id, null, { at: at(`${MONDAY}T10:05:00Z`), runId: first.id })).toBeNull()
    expect((await card(id)).clock.runningSince).toBe(`${MONDAY}T10:00:00.000Z`)
  })

  it("lets only the person assigned and the site admin fix a time, unassigned tasks included", async () => {
    const id = await task("Nobody's", null)
    expect((await loadTaskDetail(anna.id, id, database)).canFixClock).toBe(false)
    await expect(setClockTotal(actor(anna), { taskId: id, seconds: 60 }, database)).rejects.toThrow(
      PROJECT_ERRORS.clockNotYours
    )
    const bens = await task("Ben's")
    expect((await loadTaskDetail(ben.id, bens, database)).canFixClock).toBe(true)
  })

  it("archiving a project pauses its running clocks", async () => {
    const id = await task("Archived mid-run")
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    await inTeam(teamId, () => setProjectArchived(admin.id, projectId, true, database))
    expect((await card(id)).clock.runningSince).toBeNull()
  })
})

describe("Fixing a wrong time", () => {
  it("sets the total by hand and keeps the old and new totals in History", async () => {
    const id = await task("Forgot to pause")
    await startClock(actor(ben), id, database, at(`${MONDAY}T09:00:00Z`))
    await pauseClock(actor(ben), id, database, at(`${MONDAY}T12:00:00Z`))
    await setClockTotal(actor(ben), { taskId: id, seconds: 70 * 60 }, database, at(`${MONDAY}T12:05:00Z`))
    expect((await card(id)).clock.seconds).toBe(70 * 60)
    const detail = await loadTaskDetail(ben.id, id, database)
    const fixed = detail.history.find((entry) => entry.kind === "clock_fixed")
    expect(fixed && "reason" in fixed ? fixed.reason : null).toBe(`${3 * 60 * 60} ${70 * 60}`)
    await expect(setClockTotal(actor(anna), { taskId: id, seconds: 0 }, database)).rejects.toThrow(
      PROJECT_ERRORS.clockNotYours
    )
  })
})

describe("The clock's time elsewhere", () => {
  it("shows in Yesterday beside each finished task with a minute or more", async () => {
    const timed = await task("Fix the login page")
    const untimed = await task("Send the invoice")
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await startClock(actor(ben), timed, database, at(`${MONDAY}T10:00:00Z`))
    await pauseClock(actor(ben), timed, database, at(`${MONDAY}T11:20:00Z`))
    for (const [id, iso] of [
      [timed, `${MONDAY}T11:30:00Z`],
      [untimed, `${MONDAY}T12:00:00Z`],
    ]) {
      await database.update(projectTasks).set({ status: "done", completedAt: at(iso) }).where(eq(projectTasks.id, id))
    }
    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:30:00Z`))
    expect(page.notes.yesterday).toBe("Fix the login page, 1h 20m\nSend the invoice")
  })

  it("adds up each person's hours since Monday in Workload", async () => {
    const id = await task("This week")
    // Sunday night counts only from Monday's midnight.
    await startClock(actor(ben), id, database, at("2099-03-01T23:00:00Z"))
    await pauseClock(actor(ben), id, database, at(`${MONDAY}T02:00:00Z`))
    await startClock(actor(ben), id, database, at(`${TUESDAY}T09:00:00Z`))
    const rows = await loadWorkload(anna.id, database, at(`${TUESDAY}T09:30:00Z`))
    expect(rows.find((row) => row.person.id === ben.id)?.weekSeconds).toBe(2.5 * 60 * 60)
    expect(rows.find((row) => row.person.id === anna.id)?.weekSeconds).toBe(0)
  })

  it("saves a guess, and takes it off", async () => {
    const id = await task("Guessed")
    const { updateTask } = await import("@/server/project/tasks")
    await updateTask(actor(anna), { taskId: id, guessMinutes: 45 }, database)
    expect((await card(id)).guessMinutes).toBe(45)
    await updateTask(actor(anna), { taskId: id, guessMinutes: null }, database)
    expect((await card(id)).guessMinutes).toBeNull()
  })
})
