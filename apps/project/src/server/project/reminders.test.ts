import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"

import { setMyCheckinTime, submitCheckin } from "@/server/project/checkins"
import { acceptInvite, createInvite } from "@/server/project/invites"
import {
  addProjectMember,
  createProject,
  removeProjectMember,
  setProjectArchived,
} from "@/server/project/projects"
import { sendDueReminders, sendTeamMorningNotices } from "@/server/project/reminder-jobs"
import { projectNoticeLinks } from "@/server/project/schema"
import { followTask } from "@/server/project/task-followers"
import { createTask, setTaskStatus, updateTask } from "@/server/project/tasks"
import { loadTeamMonth } from "@/server/project/team-days"
import { changeMemberRole, createTeam } from "@/server/project/teams"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * Dates are in 2099 so nothing here meets the real today. 2 March 2099 is a
 * Monday, 6 March a Friday and 7 March a Saturday. The team works Monday to
 * Friday at 9:00 UTC.
 */
const MONDAY = "2099-03-02"
const TUESDAY = "2099-03-03"
const WEDNESDAY = "2099-03-04"
const FRIDAY = "2099-03-06"
const NEXT_MONDAY = "2099-03-09"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let projectId: string

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
  const project = await createProject(
    anna.id,
    { name: "Website", color: "blue", description: "" },
    database
  )
  projectId = project.id
  await addProjectMember(anna.id, projectId, ben.id, database)
  await addProjectMember(anna.id, projectId, carla.id, database)
})

afterEach(async () => {
  await client.close()
})

async function noticesFor(userId: string, kind?: string) {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      kind: projectNoticeLinks.kind,
      href: projectNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        kind ? eq(projectNoticeLinks.kind, kind) : undefined
      )
    )
    .orderBy(asc(customShellNotifications.createdAt), asc(customShellNotifications.message))
}

async function taskFor(
  person: CustomShellUser,
  title: string,
  dueDate: string | null,
  by: CustomShellUser = anna
) {
  return createTask(
    actor(by),
    { projectId, title, notes: "", assigneeUserId: person.id, dueDate, steps: [] },
    database
  )
}

describe("due tomorrow and overdue", () => {
  it("tells the person assigned the day before at their check-in time, and once more after the date", async () => {
    const task = await taskFor(ben, "Write the launch email", WEDNESDAY)
    await sendDueReminders(database, at(`${TUESDAY}T08:59:00Z`))
    expect(await noticesFor(ben.id, "due_soon")).toHaveLength(0)

    await sendDueReminders(database, at(`${TUESDAY}T09:00:00Z`))
    await sendDueReminders(database, at(`${TUESDAY}T09:00:15Z`))
    expect(await noticesFor(ben.id, "due_soon")).toEqual([
      {
        message: "Due tomorrow",
        detail: "Write the launch email",
        kind: "due_soon",
        href: `/projects/${projectId}?task=${task.id}`,
      },
    ])

    // Nothing on the day itself, then one "Overdue" the work day after.
    await sendDueReminders(database, at(`${WEDNESDAY}T12:00:00Z`))
    expect(await noticesFor(ben.id, "overdue")).toHaveLength(0)
    await sendDueReminders(database, at("2099-03-05T09:00:00Z"))
    await sendDueReminders(database, at("2099-03-05T15:00:00Z"))
    expect((await noticesFor(ben.id, "overdue")).map((n) => n.message)).toEqual(["Overdue"])
  })

  it("follows each person's own time zone", async () => {
    await setMyCheckinTime(carla.id, { timeZone: "Asia/Tokyo" }, database)
    await taskFor(carla, "Book the venue", TUESDAY)
    await taskFor(ben, "Fix the 404 page", TUESDAY)

    // 00:00 UTC on Monday is 09:00 on Monday in Tokyo: Carla's time, not Ben's.
    await sendDueReminders(database, at(`${MONDAY}T00:00:00Z`))
    expect(await noticesFor(carla.id, "due_soon")).toHaveLength(1)
    expect(await noticesFor(ben.id, "due_soon")).toHaveLength(0)

    await sendDueReminders(database, at(`${MONDAY}T09:00:00Z`))
    expect(await noticesFor(ben.id, "due_soon")).toHaveLength(1)
    expect(await noticesFor(carla.id, "due_soon")).toHaveLength(1)
  })

  it("names the day when the next work day is after a weekend", async () => {
    await taskFor(ben, "Send the invoice", NEXT_MONDAY)
    await sendDueReminders(database, at(`${FRIDAY}T09:00:00Z`))
    expect((await noticesFor(ben.id, "due_soon")).map((n) => n.message)).toEqual(["Due Monday"])
  })

  it("sends a fresh reminder when the due date moves", async () => {
    const task = await taskFor(ben, "Write the launch email", TUESDAY)
    await sendDueReminders(database, at(`${MONDAY}T09:00:00Z`))
    await updateTask(actor(anna), { taskId: task.id, dueDate: WEDNESDAY }, database)
    await sendDueReminders(database, at(`${TUESDAY}T09:00:00Z`))
    expect(await noticesFor(ben.id, "due_soon")).toHaveLength(2)
  })

  it("says nothing about Done tasks, archived projects or tasks with nobody assigned", async () => {
    const done = await taskFor(ben, "Already finished", TUESDAY)
    await setTaskStatus(actor(ben), { taskId: done.id, status: "done", stuckReason: null }, database)
    await createTask(
      actor(anna),
      { projectId, title: "Nobody's", notes: "", assigneeUserId: null, dueDate: TUESDAY, steps: [] },
      database
    )
    const other = await createProject(anna.id, { name: "Old", color: "red", description: "" }, database)
    await addProjectMember(anna.id, other.id, ben.id, database)
    await createTask(
      actor(anna),
      { projectId: other.id, title: "Archived", notes: "", assigneeUserId: ben.id, dueDate: TUESDAY, steps: [] },
      database
    )
    await setProjectArchived(anna.id, other.id, true, database)

    await sendDueReminders(database, at(`${MONDAY}T09:00:00Z`))
    expect(await noticesFor(ben.id, "due_soon")).toHaveLength(0)
    expect(await noticesFor(anna.id, "due_soon")).toHaveLength(0)
  })

  it("sends nothing on a day off", async () => {
    await taskFor(ben, "Weekend job", "2099-03-08")
    await sendDueReminders(database, at("2099-03-07T12:00:00Z"))
    expect(await noticesFor(ben.id)).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ kind: "due_soon" })])
    )
  })

  it("puts more than three due the same day into one notice", async () => {
    for (const title of ["One", "Two", "Three", "Four"]) await taskFor(ben, title, TUESDAY)
    await taskFor(ben, "Late one", "2099-02-27")
    await sendDueReminders(database, at(`${MONDAY}T09:00:00Z`))
    expect(await noticesFor(ben.id, "due_soon")).toEqual([
      {
        message: "4 tasks due tomorrow",
        detail: "Four, One and 2 more",
        kind: "due_soon",
        href: "/dashboard",
      },
    ])
    expect((await noticesFor(ben.id, "overdue")).map((n) => n.message)).toEqual(["Overdue"])
  })

  it("sends one notice when two passes overlap", async () => {
    await taskFor(ben, "Write the launch email", TUESDAY)
    await Promise.all([
      sendDueReminders(database, at(`${MONDAY}T09:00:00Z`)),
      sendDueReminders(database, at(`${MONDAY}T09:00:00Z`)),
    ])
    expect(await noticesFor(ben.id, "due_soon")).toHaveLength(1)
  })
})

describe("finished and unblocked", () => {
  it("tells whoever handed the task out, and never the person who did it", async () => {
    const task = await taskFor(ben, "Write the launch email", null)
    await setTaskStatus(actor(ben), { taskId: task.id, status: "stuck", stuckReason: "No copy yet" }, database)
    await setTaskStatus(actor(ben), { taskId: task.id, status: "doing", stuckReason: null }, database)
    await setTaskStatus(actor(ben), { taskId: task.id, status: "done", stuckReason: null }, database)

    expect((await noticesFor(anna.id)).map((n) => [n.kind, n.message])).toEqual([
      ["task_stuck", "Ben marked a task Stuck"],
      ["task_unblocked", "Ben unblocked a task"],
      ["task_done", "Ben marked a task Done"],
    ])
    expect(await noticesFor(ben.id, "task_done")).toHaveLength(0)
  })

  it("tells whoever made it when nobody handed it out, and not when they did it themselves", async () => {
    const own = await createTask(
      actor(anna),
      { projectId, title: "Anna's own", notes: "", assigneeUserId: null, dueDate: null, steps: [] },
      database
    )
    await setTaskStatus(actor(anna), { taskId: own.id, status: "done", stuckReason: null }, database)
    expect(await noticesFor(anna.id, "task_done")).toHaveLength(0)

    await setTaskStatus(actor(anna), { taskId: own.id, status: "todo", stuckReason: null }, database)
    await setTaskStatus(actor(ben), { taskId: own.id, status: "done", stuckReason: null }, database)
    expect((await noticesFor(anna.id, "task_done")).map((n) => n.message)).toEqual([
      "Ben marked a task Done",
    ])
  })

  it("sends one notice to a hander who also follows the task", async () => {
    const task = await taskFor(ben, "Write the launch email", null)
    await followTask(anna.id, task.id, database)
    await setTaskStatus(actor(ben), { taskId: task.id, status: "done", stuckReason: null }, database)
    expect(await noticesFor(anna.id, "task_done")).toHaveLength(1)
  })

  it("tells nobody who is no longer on the project", async () => {
    const task = await taskFor(ben, "Write the launch email", null, carla)
    await removeProjectMember(anna.id, projectId, carla.id, database)
    await addProjectMember(anna.id, projectId, ben.id, database)
    await setTaskStatus(actor(anna), { taskId: task.id, status: "done", stuckReason: null }, database)
    expect(await noticesFor(carla.id, "task_done")).toHaveLength(0)
  })
})

describe("the team's morning", () => {
  it("tells the owner and admins once, after the latest check-in time, with the calendar's numbers", async () => {
    await changeMemberRole(anna.id, carla.id, "admin", database)
    await setMyCheckinTime(ben.id, { checkinTime: "10:00" }, database)
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:05:00Z`))
    const stuck = await taskFor(carla, "Blocked thing", null, carla)
    await submitCheckin(carla.id, { answers: [], picks: [stuck.id] }, database, at(`${MONDAY}T09:10:00Z`))
    await setTaskStatus(actor(carla), { taskId: stuck.id, status: "stuck", stuckReason: "Waiting" }, database)

    // The latest time is Ben's 10:00, so nothing goes until 10:30.
    await sendTeamMorningNotices(database, at(`${MONDAY}T10:29:00Z`))
    expect(await noticesFor(anna.id, "team_morning")).toHaveLength(0)

    await sendTeamMorningNotices(database, at(`${MONDAY}T10:30:00Z`))
    await sendTeamMorningNotices(database, at(`${MONDAY}T11:30:00Z`))
    const square = (await loadTeamMonth(anna.id, undefined, database, at(`${MONDAY}T10:30:00Z`))).days.find(
      (day) => day.day === MONDAY
    )
    expect(square).toEqual({ day: MONDAY, checkedIn: 2, expected: 3, blocked: 1 })
    const expected = [
      {
        message: "2 of 3 checked in, 1 blocked",
        detail: "The team's check-ins today.",
        kind: "team_morning",
        href: `/team?day=${MONDAY}`,
      },
    ]
    expect(await noticesFor(anna.id, "team_morning")).toEqual(expected)
    expect(await noticesFor(carla.id, "team_morning")).toEqual(expected)
    expect(await noticesFor(ben.id, "team_morning")).toHaveLength(0)
  })

  it("sends nothing on a day off", async () => {
    await sendTeamMorningNotices(database, at("2099-03-07T18:00:00Z"))
    expect(await noticesFor(anna.id, "team_morning")).toHaveLength(0)
  })
})
