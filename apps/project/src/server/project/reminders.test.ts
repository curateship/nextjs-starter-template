import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"

import { setMyCheckinTime, submitCheckin } from "@/server/project/checkins"
import {
  addProjectMember,
  removeProjectMember,
  setProjectArchived,
} from "@/server/project/projects"
import { sendDueReminders, sendTeamMorningNotices } from "@/server/project/reminder-jobs"
import { projectNoticeLinks } from "@/server/project/schema"
import { followTask } from "@/server/project/task-followers"
import { createTask, setTaskStatus, updateTask } from "@/server/project/tasks"
import { loadTeamMonth } from "@/server/project/team-days"
import type { TeamSummary } from "@/server/project/teams"
import { projectFor, startTeam } from "@/server/project/test-people"
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
/** The site admin, who runs the team without being on it. */
let admin: CustomShellUser
let team: TeamSummary
let projectId: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  ;({ admin, team } = await startTeam(database, [anna, ben, carla]))
  // The site admin makes Website with Anna on it, then adds Ben and Carla.
  const project = await projectFor(
    admin,
    anna.id,
    { name: "Website", color: "blue", description: "" },
    database
  )
  projectId = project.id
  await addProjectMember(admin.id, projectId, ben.id, database)
  await addProjectMember(admin.id, projectId, carla.id, database)
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
    const other = await projectFor(admin, anna.id, { name: "Old", color: "red", description: "" }, database)
    await addProjectMember(admin.id, other.id, ben.id, database)
    await createTask(
      actor(anna),
      { projectId: other.id, title: "Archived", notes: "", assigneeUserId: ben.id, dueDate: TUESDAY, steps: [] },
      database
    )
    await setProjectArchived(admin.id, other.id, true, database)

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
    await removeProjectMember(admin.id, projectId, carla.id, database)
    await addProjectMember(admin.id, projectId, ben.id, database)
    await setTaskStatus(actor(anna), { taskId: task.id, status: "done", stuckReason: null }, database)
    expect(await noticesFor(carla.id, "task_done")).toHaveLength(0)
  })
})

describe("the team's morning", () => {
  it("tells the site admin once, after the latest check-in time, with the calendar's numbers", async () => {
    await inTeam(team.id, async () => {
      await setMyCheckinTime(ben.id, { checkinTime: "10:00" }, database)
      await submitCheckin(anna.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:05:00Z`))
      const stuck = await taskFor(carla, "Blocked thing", null, carla)
      await submitCheckin(carla.id, { answers: [], picks: [stuck.id] }, database, at(`${MONDAY}T09:10:00Z`))
      await setTaskStatus(actor(carla), { taskId: stuck.id, status: "stuck", stuckReason: "Waiting" }, database)

      // The latest time is Ben's 10:00, so nothing goes until 10:30.
      await sendTeamMorningNotices(database, at(`${MONDAY}T10:29:00Z`))
      expect(await noticesFor(admin.id, "team_morning")).toHaveLength(0)

      await sendTeamMorningNotices(database, at(`${MONDAY}T10:30:00Z`))
      await sendTeamMorningNotices(database, at(`${MONDAY}T11:30:00Z`))
      const square = (await loadTeamMonth(admin.id, undefined, database, at(`${MONDAY}T10:30:00Z`))).days.find(
        (day) => day.day === MONDAY
      )
      // The site admin isn't on the team, so isn't one of the three expected.
      expect(square).toEqual({ day: MONDAY, checkedIn: 2, expected: 3, blocked: 1 })
      // The site admin may be looking at another team, so the link picks this one first.
      expect(await noticesFor(admin.id, "team_morning")).toEqual([
        {
          message: "2 of 3 checked in, 1 blocked",
          detail: "Not yet: Ben.",
          kind: "team_morning",
          href: `/teams/${team.id}?day=${MONDAY}`,
        },
      ])
      for (const person of [anna, ben, carla]) {
        expect(await noticesFor(person.id, "team_morning")).toHaveLength(0)
      }
    })
  })

  it("sends nothing on a day off", async () => {
    await sendTeamMorningNotices(database, at("2099-03-07T18:00:00Z"))
    expect(await noticesFor(admin.id, "team_morning")).toHaveLength(0)
  })
})
