import { readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { and, eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addDays, localNow } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { quickDays } from "@/lib/project/quick-days"
import type { CustomShellDb } from "@/server/db"
import { loadCheckinPage, setMyCheckinTime } from "@/server/project/checkins"
import { addHoliday } from "@/server/project/holidays"
import { addWait, findTasksToWaitOn, removeWait, setRepeat } from "@/server/project/planning"
import { makeRepeatCopies } from "@/server/project/planning-jobs"
import {
  addProjectMember,
  copyProject,
  loadProjectPage,
  removeProjectMember,
} from "@/server/project/projects"
import { sendTaskReminders } from "@/server/project/reminder-jobs"
import { projectNoticeLinks, projectTaskReminders, projectTasks } from "@/server/project/schema"
import {
  addStepListToTask,
  deleteStepList,
  listStepLists,
  renameStepList,
  saveStepList,
} from "@/server/project/step-lists"
import { changeManyTasks, duplicateTask } from "@/server/project/task-changes"
import { loadMyDays, myReminderOn, setTaskReminder } from "@/server/project/task-reminders"
import {
  addStep,
  createTask,
  deleteTask,
  loadTaskDetail,
  setTaskStatus,
  updateTask,
} from "@/server/project/tasks"
import { removeTeamMember } from "@/server/project/teams"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

/*
 * More features task 05, planning tasks. 2 March 2099 is a Monday. The team
 * works Monday to Friday, checks in at 9:00, and is on UTC. The site admin
 * runs it; Anna and Ben work on it, both on Website.
 */
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let admin: CustomShellUser
let anna: CustomShellUser
let ben: CustomShellUser
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  admin = (await startTeam(database, [anna, ben])).admin
  website = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  await addProjectMember(admin.id, website, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

async function task(title: string, assignee: CustomShellUser | null = ben, projectId = website) {
  return (
    await createTask(
      actor(anna),
      { projectId, title, notes: "", assigneeUserId: assignee?.id ?? null, dueDate: null, steps: [] },
      database
    )
  ).id
}

async function card(taskId: string, viewer = anna) {
  return (await loadProjectPage(viewer.id, website, database)).tasks.find((t) => t.id === taskId)!
}

async function noticesTo(user: CustomShellUser, kind: string) {
  return database
    .select({ message: customShellNotifications.message, detail: customShellNotifications.detail })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(and(eq(customShellNotifications.recipientUserId, user.id), eq(projectNoticeLinks.kind, kind)))
}

const done = (taskId: string, by = ben) =>
  setTaskStatus(actor(by), { taskId, status: "done", stuckReason: null }, database)

describe("task priority", () => {
  it("starts Normal, and Duplicate, Copy project and repeats carry it over", async () => {
    const id = await task("Pay the freelancers")
    expect((await card(id)).priority).toBe("normal")
    await updateTask(actor(anna), { taskId: id, priority: "high" }, database)
    expect((await card(id)).priority).toBe("high")

    const copy = await duplicateTask(actor(anna), id, database)
    expect((await card(copy.id)).priority).toBe("high")

    const copied = await copyProject(admin.id, { projectId: website, name: "Website 2" }, database)
    const copiedTasks = (await loadProjectPage(admin.id, copied.id, database)).tasks
    expect(copiedTasks.map((t) => t.priority)).toEqual(["high", "high"])

    await database.update(projectTasks).set({ createdAt: at("2099-02-20T10:00:00Z") }).where(eq(projectTasks.id, id))
    await setRepeat(actor(anna), { taskId: id, repeat: { every: "workday" } }, database)
    await done(id)
    await makeRepeatCopies(database, at("2099-03-02T00:00:30Z"))
    const page = (await loadProjectPage(anna.id, website, database)).tasks
    const repeated = page.find((t) => t.repeat && t.id !== id)!
    expect(repeated.priority).toBe("high")
  })

  it("puts High first within each project in the check-in's pick list", async () => {
    await task("Normal one")
    const high = await task("Urgent one")
    await task("Another normal")
    const low = await task("Someday")
    await updateTask(actor(anna), { taskId: high, priority: "high" }, database)
    await updateTask(actor(anna), { taskId: low, priority: "low" }, database)
    const page = await loadCheckinPage(ben.id, database, at("2099-03-02T08:00:00Z"))
    expect(page.groups[0].tasks.map((t) => t.title)).toEqual(["Urgent one", "Normal one", "Another normal", "Someday"])
  })
})

describe("quick due dates", () => {
  const weekdays = [1, 2, 3, 4, 5]
  const days = (today: string, holidays: string[] = []) =>
    Object.fromEntries(quickDays(today, weekdays, holidays).map((q) => [q.key, q.day]))

  it("lands Tomorrow and Next Monday on work days", () => {
    // Friday: tomorrow is Saturday, so Monday.
    expect(days("2099-03-06")).toEqual({
      today: "2099-03-06",
      tomorrow: "2099-03-09",
      next_monday: "2099-03-09",
      week: "2099-03-13",
    })
    // Monday: next Monday is a week off, never today.
    expect(days("2099-03-02").next_monday).toBe("2099-03-09")
    // Sunday: next Monday is tomorrow.
    expect(days("2099-03-01")).toMatchObject({ tomorrow: "2099-03-02", next_monday: "2099-03-02" })
  })

  it("reads my zone, the team's work days and its coming holidays for the buttons", async () => {
    await setMyCheckinTime(ben.id, { timeZone: "Asia/Tokyo" }, database)
    const soon = addDays(localNow(new Date(), "UTC").day, 5)
    await addHoliday(admin.id, { day: soon, name: "Founders' day" }, database)
    expect(await loadMyDays(ben.id, database)).toEqual({
      zone: "Asia/Tokyo",
      workDays: [1, 2, 3, 4, 5],
      holidays: [soon],
    })
  })

  it("skips the team's holidays and crosses a year end", () => {
    // Thursday 31 December 2099; Friday 1 January 2100 is a holiday.
    expect(days("2099-12-31", ["2100-01-01"])).toEqual({
      today: "2099-12-31",
      tomorrow: "2100-01-04",
      next_monday: "2100-01-04",
      week: "2100-01-07",
    })
    // A holiday on Monday moves Next Monday to Tuesday.
    expect(days("2099-03-04", ["2099-03-09"]).next_monday).toBe("2099-03-10")
  })
})

describe("more repeat choices", () => {
  /** Done, made long ago, with the rule set: ready for the job. */
  async function repeating(title: string, repeat: Parameters<typeof setRepeat>[1]["repeat"], from?: string) {
    const id = await task(title)
    await database.update(projectTasks).set({ createdAt: at("2099-01-01T10:00:00Z") }).where(eq(projectTasks.id, id))
    await setRepeat(actor(anna), { taskId: id, repeat }, database)
    // The week or first date it counts from, fixed for the test.
    if (from) await database.update(projectTasks).set({ repeatFrom: from }).where(eq(projectTasks.id, id))
    await done(id)
    return id
  }
  const count = async () => (await loadProjectPage(anna.id, website, database)).tasks.length
  const pass = (iso: string) => makeRepeatCopies(database, at(iso))

  it("every 2 weeks comes on the ticked days of every other week only", async () => {
    // Counted from the week of Monday 2 March; Wednesday is ticked.
    await repeating("Pay the freelancers", { every: "two_weeks", weekDays: [3] }, "2099-03-04")
    await pass("2099-03-11T00:00:30Z") // the week after: off
    expect(await count()).toBe(1)
    await pass("2099-03-18T00:00:30Z") // two weeks on
    expect(await count()).toBe(2)
    const copy = (await loadProjectPage(anna.id, website, database)).tasks.find((t) => t.repeat)!
    expect(copy.repeat).toEqual({ every: "two_weeks", weekDays: [3], from: "2099-03-04" })
  })

  it("every 3 months follows the first date across a year end, and a month too short", async () => {
    await repeating("Quarterly taxes", { every: "quarter", from: "2099-08-31" })
    await pass("2099-10-31T00:00:30Z") // two months on: no
    expect(await count()).toBe(1)
    await pass("2099-11-30T00:00:30Z") // November has no 31st, so its last day
    expect(await count()).toBe(2)
    const copy = (await loadProjectPage(anna.id, website, database)).tasks.find((t) => t.repeat)!
    await done(copy.id)
    await pass("2100-02-27T00:00:30Z")
    expect(await count()).toBe(2)
    await pass("2100-02-28T00:00:30Z") // across the year end, February's last day
    expect(await count()).toBe(3)
  })

  it("the last work day of the month skips a weekend at the month's end", async () => {
    // May 2099 ends on a Sunday, so its last work day is Friday the 29th.
    await repeating("Close the books", { every: "last_workday" })
    await pass("2099-05-28T00:00:30Z")
    await pass("2099-05-31T00:00:30Z")
    expect(await count()).toBe(1)
    await pass("2099-05-29T00:00:30Z")
    await pass("2099-05-29T00:00:45Z")
    expect(await count()).toBe(2)
  })

  it("makes no second copy when the job catches up after downtime", async () => {
    await repeating("Water the plants", { every: "week", weekDays: [1] })
    // The server was down on Monday; Tuesday's passes make nothing.
    await pass("2099-03-03T00:00:30Z")
    await pass("2099-03-03T09:00:00Z")
    expect(await count()).toBe(1)
    await pass("2099-03-09T00:00:30Z")
    await pass("2099-03-09T00:00:31Z")
    expect(await count()).toBe(2)
  })

  it("keeps the old repeat values readable", async () => {
    const id = await repeating("Weekly report", { every: "month", monthDay: 5 })
    expect((await card(id)).repeat).toEqual({ every: "month", monthDay: 5 })
  })
})

describe("waiting on several tasks", () => {
  it("is Ready to start only when all are Done, and tells the person once, at the last", async () => {
    const logo = await task("Logo", anna)
    const copy = await task("Copy", anna)
    const domain = await task("Domain", anna)
    const launch = await task("Launch the site")
    for (const other of [logo, copy, domain]) await addWait(actor(ben), { taskId: launch, waitingOnTaskId: other }, database)

    expect((await card(launch)).waitingOn).toEqual({
      tasks: [
        { taskId: logo, title: "Logo", done: false },
        { taskId: copy, title: "Copy", done: false },
        { taskId: domain, title: "Domain", done: false },
      ],
      ready: false,
    })
    await done(logo, anna)
    await done(copy, anna)
    expect((await card(launch)).waitingOn?.ready).toBe(false)
    expect(await noticesTo(ben, "task_ready")).toEqual([])
    await done(domain, anna)
    expect((await card(launch)).waitingOn?.ready).toBe(true)
    expect(await noticesTo(ben, "task_ready")).toEqual([
      { message: "Anna finished what your task was waiting on", detail: "Launch the site" },
    ])
  })

  it("leaves out one in the bin, takes one off, and stops at 10", async () => {
    const launch = await task("Launch")
    const others = []
    for (let n = 1; n <= 11; n++) others.push(await task(`Part ${n}`, anna))
    for (const other of others.slice(0, 10)) await addWait(actor(ben), { taskId: launch, waitingOnTaskId: other }, database)
    await expect(addWait(actor(ben), { taskId: launch, waitingOnTaskId: others[10] }, database)).rejects.toThrow(
      PROJECT_ERRORS.tooManyWaits
    )
    await removeWait(actor(ben), { taskId: launch, waitingOnTaskId: others[0] }, database)
    await deleteTask(actor(anna), others[1], database)
    expect((await card(launch)).waitingOn?.tasks).toHaveLength(8)
    // The one in the bin isn't listed, so it doesn't take one of the 10 places.
    await addWait(actor(ben), { taskId: launch, waitingOnTaskId: others[10] }, database)
    const extra = await task("Part 12", anna)
    await addWait(actor(ben), { taskId: launch, waitingOnTaskId: extra }, database)
    expect((await card(launch)).waitingOn?.tasks).toHaveLength(10)
  })

  it("leaves tasks it already waits on out of the picker's search", async () => {
    const logo = await task("Logo draft", anna)
    await task("Logo final", anna)
    const launch = await task("Launch")
    await addWait(actor(ben), { taskId: launch, waitingOnTaskId: logo }, database)
    const found = await findTasksToWaitOn(ben.id, { taskId: launch, q: "logo" }, database)
    expect(found.map((t) => t.title)).toEqual(["Logo final"])
  })

  it("refuses a task waiting on itself however far down the line", async () => {
    const a = await task("A")
    const b = await task("B")
    const c = await task("C")
    await addWait(actor(ben), { taskId: a, waitingOnTaskId: b }, database)
    await addWait(actor(ben), { taskId: b, waitingOnTaskId: c }, database)
    await expect(addWait(actor(ben), { taskId: c, waitingOnTaskId: a }, database)).rejects.toThrow(
      PROJECT_ERRORS.waitingLoop
    )
  })

  it("moves each old single link into a list of one", async () => {
    const logo = await task("Logo", anna)
    const launch = await task("Launch")
    await database.execute(sql`UPDATE project_tasks SET waiting_on_task_id = ${logo} WHERE id = ${launch}`)
    const migration = readFileSync(
      path.join(process.cwd(), "drizzle/0111_project_planning_tasks.sql"),
      "utf8"
    )
    const copyOldLinks = migration.slice(migration.indexOf('INSERT INTO "project_task_waits"'))
    await database.execute(sql.raw(copyOldLinks.slice(0, copyOldLinks.indexOf(";") + 1)))
    expect((await card(launch)).waitingOn?.tasks).toEqual([{ taskId: logo, title: "Logo", done: false }])
  })
})

describe("due date moves in history", () => {
  it("writes each move, and only a move from one day to another counts", async () => {
    const id = await task("Write the About page")
    await updateTask(actor(anna), { taskId: id, dueDate: "2099-11-03" }, database) // first date
    await updateTask(actor(anna), { taskId: id, dueDate: "2099-11-10" }, database)
    await updateTask(actor(anna), { taskId: id, dueDate: null }, database) // cleared
    await updateTask(actor(anna), { taskId: id, dueDate: "2099-11-12" }, database) // a first date again
    await changeManyTasks(actor(anna), { taskIds: [id], change: { kind: "due", dueDate: "2099-11-14" } }, database)
    expect((await card(id)).dueMoves).toBe(2)
    await updateTask(actor(anna), { taskId: id, dueDate: "2099-11-14" }, database) // the same day: no move
    await updateTask(actor(anna), { taskId: id, dueDate: "2099-11-20" }, database)
    expect((await card(id)).dueMoves).toBe(3)

    const moves = (await loadTaskDetail(anna.id, id, database)).history.filter((e) => e.kind === "due_moved")
    expect(moves.map((e) => ("reason" in e ? e.reason : null))).toEqual([
      "2099-11-03 2099-11-10",
      "2099-11-12 2099-11-14",
      "2099-11-14 2099-11-20",
    ])
  })
})

describe("remind me", () => {
  it("fires once at the person's check-in time on the day, and can be taken off", async () => {
    const id = await task("Write the About page")
    await setTaskReminder(actor(anna), { taskId: id, day: "2099-03-05" }, database)
    expect(await myReminderOn(anna.id, id, database)).toBe("2099-03-05")
    // Ben's own reminders are his own.
    expect(await myReminderOn(ben.id, id, database)).toBeNull()

    await sendTaskReminders(database, at("2099-03-05T08:59:00Z"))
    expect(await noticesTo(anna, "task_reminder")).toEqual([])
    await sendTaskReminders(database, at("2099-03-05T09:00:00Z"))
    await sendTaskReminders(database, at("2099-03-05T09:00:15Z"))
    expect(await noticesTo(anna, "task_reminder")).toEqual([
      { message: "Reminder: Write the About page", detail: "Website" },
    ])
    expect(await myReminderOn(anna.id, id, database)).toBeNull()

    await setTaskReminder(actor(anna), { taskId: id, day: "2099-03-09" }, database)
    await setTaskReminder(actor(anna), { taskId: id, day: null }, database)
    await sendTaskReminders(database, at("2099-03-09T10:00:00Z"))
    expect(await noticesTo(anna, "task_reminder")).toHaveLength(1)
  })

  it("sends nothing for a task in the bin or one the person can no longer see", async () => {
    const binned = await task("Binned")
    const hidden = await task("Hidden")
    await setTaskReminder(actor(ben), { taskId: binned, day: "2099-03-05" }, database)
    await setTaskReminder(actor(ben), { taskId: hidden, day: "2099-03-05" }, database)
    await deleteTask(actor(anna), binned, database)
    await removeProjectMember(admin.id, website, ben.id, database)
    await sendTaskReminders(database, at("2099-03-05T10:00:00Z"))
    expect(await noticesTo(ben, "task_reminder")).toEqual([])
    expect(await database.select().from(projectTaskReminders)).toEqual([])
  })

  it("are taken off when the person is taken off the team", async () => {
    const id = await task("Write the About page")
    await setTaskReminder(actor(ben), { taskId: id, day: "2099-03-05" }, database)
    await removeTeamMember(admin.id, ben.id, database)
    expect(await database.select().from(projectTaskReminders)).toEqual([])
  })

  it("refuses a day already gone", async () => {
    const id = await task("Old")
    await expect(setTaskReminder(actor(anna), { taskId: id, day: "2020-01-01" }, database)).rejects.toThrow(
      PROJECT_ERRORS.reminderInThePast
    )
  })
})

describe("saved step lists", () => {
  it("saves a task's steps under a name and drops them into another task with no person or date", async () => {
    const payroll = await task("Pay the freelancers")
    for (const text of ["Collect invoices", "Check hours", "Send payments", "File receipts"]) {
      await addStep(actor(anna), { taskId: payroll, text }, database)
    }
    const list = await saveStepList(actor(ben), { taskId: payroll, name: "Payroll" }, database)
    expect(await listStepLists(await teamId(), database)).toEqual([{ id: list.id, name: "Payroll", stepCount: 4 }])
    await expect(saveStepList(actor(anna), { taskId: payroll, name: "payroll" }, database)).rejects.toThrow(
      PROJECT_ERRORS.stepListNameTaken
    )
    const next = await task("Pay the freelancers again")
    await addStep(actor(anna), { taskId: next, text: "Ask Leo first" }, database)
    await addStepListToTask(actor(ben), { taskId: next, listId: list.id }, database)
    const steps = (await loadTaskDetail(ben.id, next, database)).steps
    expect(steps.map((s) => s.text)).toEqual([
      "Ask Leo first",
      "Collect invoices",
      "Check hours",
      "Send payments",
      "File receipts",
    ])
    expect(steps.every((s) => !s.done && !s.assignee && !s.dueDate)).toBe(true)
  })

  it("never goes past 50 steps on a task, and says how much room is left", async () => {
    const source = await task("Source")
    for (let n = 1; n <= 4; n++) await addStep(actor(anna), { taskId: source, text: `Step ${n}` }, database)
    const list = await saveStepList(actor(anna), { taskId: source, name: "Four" }, database)
    const full = await task("Nearly full")
    for (let n = 1; n <= 48; n++) await addStep(actor(anna), { taskId: full, text: `Step ${n}` }, database)
    await expect(addStepListToTask(actor(anna), { taskId: full, listId: list.id }, database)).rejects.toThrow(
      "That list has 4 steps and this task has room for 2 more, since a task can have at most 50."
    )
    expect((await loadTaskDetail(anna.id, full, database)).steps).toHaveLength(48)
  })

  it("lets only the site admin rename or delete a list", async () => {
    const source = await task("Source")
    await addStep(actor(anna), { taskId: source, text: "One" }, database)
    const list = await saveStepList(actor(ben), { taskId: source, name: "Mine" }, database)
    await expect(renameStepList(ben.id, { listId: list.id, name: "Ours" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    await expect(deleteStepList(ben.id, list.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    // Anna works on the team like Ben, so she can't either.
    await expect(renameStepList(anna.id, { listId: list.id, name: "Ours" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    await renameStepList(admin.id, { listId: list.id, name: "Ours" }, database)
    expect((await listStepLists(await teamId(), database)).map((l) => l.name)).toEqual(["Ours"])
    await deleteStepList(admin.id, list.id, database)
    expect(await listStepLists(await teamId(), database)).toEqual([])
  })
})

async function teamId() {
  const rows = await database.execute(sql`SELECT team_id FROM project_projects WHERE id = ${website}`)
  return (rows.rows[0] as { team_id: string }).team_id
}
