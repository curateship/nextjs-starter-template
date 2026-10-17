import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { loadCheckinPage, setMyCheckinTime, submitCheckin } from "@/server/project/checkins"
import {
  emptyProjectBin,
  loadProjectBin,
  addWait,
  restoreTask,
  setRepeat,
} from "@/server/project/planning"
import { emptyOldBins, makeRepeatCopies } from "@/server/project/planning-jobs"
import {
  addProjectMember,
  loadProjectPage,
  loadProjectsPage,
} from "@/server/project/projects"
import { projectNoticeLinks, projectTasks } from "@/server/project/schema"
import { moveTask } from "@/server/project/task-changes"
import { sendMessage } from "@/server/project/task-chat"
import {
  addStep,
  createTask,
  deleteTask,
  loadMyWork,
  loadTaskDetail,
  setTaskStatus,
  updateStep,
  updateTask,
} from "@/server/project/tasks"
import { loadTeamDay } from "@/server/project/team-days"
import { projectFor, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * 2 March 2099 is a Monday. The team works Monday to Friday at 9:00 UTC.
 */
const MONDAY = "2099-03-02"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
/** The site admin, who runs the team without being on it. */
let admin: CustomShellUser
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  ;({ admin } = await startTeam(database, [anna, ben, carla]))
  // Anna makes Website and is on it; the site admin adds Ben.
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

async function titlesIn(projectId = website) {
  return (await loadProjectPage(anna.id, projectId, database)).tasks.map((t) => t.title)
}

/** Makes the task look made on an earlier day, as a real one would be. */
async function madeOn(taskId: string, iso: string) {
  await database.update(projectTasks).set({ createdAt: at(iso) }).where(eq(projectTasks.id, taskId))
}

describe("repeating tasks", () => {
  it("makes one fresh copy each Monday once the last one is Done, with the rule moving to it", async () => {
    const first = await task("Send the client report")
    await madeOn(first, "2099-02-20T10:00:00Z")
    const step = await addStep(actor(anna), { taskId: first, text: "Attach figures" }, database)
    await updateStep(actor(anna), { stepId: step.id, done: true }, database)
    await setRepeat(actor(anna), { taskId: first, repeat: { every: "week", weekDays: [1] } }, database)

    // Not Done yet, so Monday passes with no copy (Tyler's rule).
    await makeRepeatCopies(database, at(`${MONDAY}T00:00:30Z`))
    expect(await titlesIn()).toEqual(["Send the client report"])

    await setTaskStatus(actor(ben), { taskId: first, status: "done", stuckReason: null }, database)
    await makeRepeatCopies(database, at("2099-03-03T00:00:30Z"))
    expect(await titlesIn()).toHaveLength(1)

    await makeRepeatCopies(database, at("2099-03-09T00:00:30Z"))
    await makeRepeatCopies(database, at("2099-03-09T00:00:45Z"))
    const page = await loadProjectPage(anna.id, website, database)
    expect(page.tasks.map((t) => t.title)).toEqual(["Send the client report", "Send the client report"])
    const copy = page.tasks.find((t) => t.id !== first)!
    expect(copy.status).toBe("todo")
    expect(copy.assignee?.id).toBe(ben.id)
    expect(copy.waiting).toBe(false)
    expect(copy.repeat).toEqual({ every: "week", weekDays: [1] })
    expect(page.tasks.find((t) => t.id === first)!.repeat).toBeNull()
    expect((await loadTaskDetail(anna.id, copy.id, database)).steps.map((s) => s.done)).toEqual([false])
  })

  it("stops when the newest copy is deleted", async () => {
    const first = await task("Water the plants")
    await madeOn(first, "2099-02-20T10:00:00Z")
    await setRepeat(actor(anna), { taskId: first, repeat: { every: "workday" } }, database)
    await setTaskStatus(actor(ben), { taskId: first, status: "done", stuckReason: null }, database)
    await deleteTask(actor(anna), first, database)
    await makeRepeatCopies(database, at(`${MONDAY}T00:00:30Z`))
    expect(await titlesIn()).toEqual([])
  })

  it("repeats on the last day of a short month", async () => {
    const first = await task("Pay rent")
    await madeOn(first, "2099-01-31T10:00:00Z")
    await setRepeat(actor(anna), { taskId: first, repeat: { every: "month", monthDay: 31 } }, database)
    await setTaskStatus(actor(ben), { taskId: first, status: "done", stuckReason: null }, database)
    await makeRepeatCopies(database, at("2099-02-27T12:00:00Z"))
    expect(await titlesIn()).toHaveLength(1)
    await makeRepeatCopies(database, at("2099-02-28T00:00:30Z"))
    expect(await titlesIn()).toHaveLength(2)
  })
})

describe("snoozing", () => {
  it("keeps a task out of the check-in until the person's own morning of its day, and on the project page", async () => {
    await setMyCheckinTime(ben.id, { timeZone: "Asia/Tokyo" }, database)
    const id = await task("Renew the domain")
    await updateTask(actor(ben), { taskId: id, snoozedUntil: "2099-03-03" }, database)
    const picks = async (iso: string) =>
      (await loadCheckinPage(ben.id, database, at(iso))).groups.flatMap((g) => g.tasks.map((t) => t.id))

    expect(await picks("2099-03-02T12:00:00Z")).toEqual([])
    // 15:00 UTC on the 2nd is already the 3rd in Tokyo.
    expect(await picks("2099-03-02T15:30:00Z")).toEqual([id])
    expect(await titlesIn()).toEqual(["Renew the domain"])
    expect((await loadMyWork(ben.id, database))[0].snoozedUntil).toBe("2099-03-03")
  })
})

describe("waiting on another task", () => {
  it("shows the link, tells the person once when the other is Done, and refuses loops", async () => {
    const logo = await task("Get the logo approved", anna)
    const launch = await task("Launch the site")
    await addWait(actor(ben), { taskId: launch, waitingOnTaskId: logo }, database)
    await expect(addWait(actor(ben), { taskId: launch, waitingOnTaskId: launch }, database)).rejects.toThrow(
      PROJECT_ERRORS.cantWaitOnItself
    )
    await expect(addWait(actor(anna), { taskId: logo, waitingOnTaskId: launch }, database)).rejects.toThrow(
      PROJECT_ERRORS.waitingLoop
    )
    let card = (await loadProjectPage(ben.id, website, database)).tasks.find((t) => t.id === launch)!
    expect(card.waitingOn).toEqual({
      tasks: [{ taskId: logo, title: "Get the logo approved", done: false }],
      ready: false,
    })
    expect((await loadTaskDetail(ben.id, logo, database)).holdingUp.tasks.map((t) => t.title)).toEqual([
      "Launch the site",
    ])

    await setTaskStatus(actor(anna), { taskId: logo, status: "done", stuckReason: null }, database)
    await setTaskStatus(actor(anna), { taskId: logo, status: "done", stuckReason: null }, database)
    card = (await loadProjectPage(ben.id, website, database)).tasks.find((t) => t.id === launch)!
    expect(card.waitingOn?.ready).toBe(true)
    const ready = await database
      .select({ message: customShellNotifications.message, detail: customShellNotifications.detail })
      .from(customShellNotifications)
      .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
      .where(and(eq(customShellNotifications.recipientUserId, ben.id), eq(projectNoticeLinks.kind, "task_ready")))
    expect(ready).toEqual([{ message: "Anna finished what your task was waiting on", detail: "Launch the site" }])
  })

  it("never names a task in a project the reader isn't on", async () => {
    const other = (await projectFor(admin, anna.id, { name: "Secret", color: "red", description: "" }, database)).id
    const hidden = await task("Hidden contract", anna, other)
    const launch = await task("Launch the site")
    await addWait(actor(anna), { taskId: launch, waitingOnTaskId: hidden }, database)
    const detail = await loadTaskDetail(ben.id, launch, database)
    expect(detail.task.waitingOn?.tasks[0].title).toBeNull()
    expect(detail.waitingOn).toEqual([{ id: hidden, title: null, projectId: null, done: false }])
  })
})

describe("Just me tasks", () => {
  it("can't be opened by anyone else on the team, only the site admin, and read as a personal task on the Team dashboard", async () => {
    const { id } = await createTask(
      actor(ben),
      { projectId: PERSONAL_PROJECT_ID, title: "Book the dentist", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    expect((await loadMyWork(ben.id, database)).map((t) => t.title)).toEqual(["Book the dentist"])
    await expect(loadTaskDetail(anna.id, id, database)).rejects.toThrow(PROJECT_ERRORS.taskNotFound)
    expect((await loadProjectsPage(ben.id, database)).projects.map((p) => p.name)).toEqual(["Website"])
    expect((await loadProjectsPage(anna.id, database)).projects.map((p) => p.name)).toEqual(["Website"])
    // The site admin sees every "Just me" list, under its person's name.
    expect((await loadTaskDetail(admin.id, id, database)).task.title).toBe("Book the dentist")
    expect((await loadProjectsPage(admin.id, database)).projects.map((p) => p.name)).toEqual([
      "Just me · Ben",
      "Website",
    ])

    await submitCheckin(ben.id, { answers: [], picks: [id] }, database, at(`${MONDAY}T09:00:00Z`))
    const day = await loadTeamDay(anna.id, MONDAY, database, at(`${MONDAY}T10:00:00Z`))
    const benRow = day.people.find((p) => p.person.id === ben.id)!
    expect(benRow.picked).toEqual([{ taskId: null, title: null, personal: true }])
    const own = await loadTeamDay(ben.id, MONDAY, database, at(`${MONDAY}T10:00:00Z`))
    expect(own.people.find((p) => p.person.id === ben.id)!.picked[0].title).toBeNull()
  })

  it("can be moved into a project later", async () => {
    const { id } = await createTask(
      actor(ben),
      { projectId: PERSONAL_PROJECT_ID, title: "Draft the FAQ", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    await moveTask(actor(ben), { taskId: id, projectId: website }, database)
    expect((await loadTaskDetail(anna.id, id, database)).task.projectName).toBe("Website")
  })
})

describe("the bin", () => {
  it("takes a deleted task off every list and brings it back whole", async () => {
    const id = await task("Wrong one")
    await sendMessage(actor(ben), { chat: { taskId: id }, body: "Notes from the call", replyToId: null }, database)
    await deleteTask(actor(anna), id, database)
    expect(await titlesIn()).toEqual([])
    expect(await loadMyWork(ben.id, database)).toEqual([])
    // Someone who can see the project is told it's in the bin; Carla, who isn't
    // on the project, still can't learn that it exists.
    await expect(loadTaskDetail(anna.id, id, database)).rejects.toThrow(PROJECT_ERRORS.taskInBin)
    await expect(loadTaskDetail(carla.id, id, database)).rejects.toThrow(PROJECT_ERRORS.taskNotFound)
    expect((await loadProjectBin(anna.id, website, database)).entries).toMatchObject([
      { id, title: "Wrong one", deletedByName: "Anna" },
    ])

    // Ben didn't make it and doesn't run the team, so he can't bring it back.
    await expect(restoreTask(actor(ben), id, database)).rejects.toThrow(PROJECT_ERRORS.cantDeleteTask)
    await restoreTask(actor(anna), id, database)
    const detail = await loadTaskDetail(ben.id, id, database)
    expect(detail.comments.map((c) => c.body)).toEqual(["Notes from the call"])
    expect(detail.history.map((e) => e.kind)).toEqual(expect.arrayContaining(["deleted", "restored"]))
  })

  it("is emptied for good after 30 days, and early only by the site admin", async () => {
    const id = await task("Old mistake")
    await deleteTask(actor(anna), id, database)
    await emptyOldBins(database, new Date(Date.now() + 29 * 24 * 60 * 60 * 1000))
    expect((await loadProjectBin(anna.id, website, database)).entries).toHaveLength(1)
    await emptyOldBins(database, new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))
    expect((await loadProjectBin(anna.id, website, database)).entries).toHaveLength(0)

    const second = await task("Another")
    await deleteTask(actor(anna), second, database)
    await expect(emptyProjectBin(ben.id, website, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    // Anna made the project, and that gives her no say over its bin.
    await expect(emptyProjectBin(anna.id, website, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    await emptyProjectBin(admin.id, website, database)
    expect((await loadProjectBin(anna.id, website, database)).entries).toHaveLength(0)
  })
})
