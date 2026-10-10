import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { saveFinishedDays, sendCheckinReminders } from "@/server/project/checkin-jobs"
import {
  addPick,
  loadCheckinPage,
  removePick,
  setMyCheckinTime,
  submitCheckin,
} from "@/server/project/checkins"
import { acceptInvite, createInvite } from "@/server/project/invites"
import { addProjectMember, createProject, setProjectArchived } from "@/server/project/projects"
import {
  projectCheckinItems,
  projectCheckins,
  projectNoticeLinks,
} from "@/server/project/schema"
import {
  acceptTask,
  createTask,
  handBackTask,
  loadMyWork,
  loadTaskDetail,
  setTaskStatus,
} from "@/server/project/tasks"
import { createTeam, removeTeamMember } from "@/server/project/teams"
import { loadTeamDay, loadTeamMonth } from "@/server/project/team-days"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * Dates are in 2099 so nothing here meets the real today. 2 March 2099 is a
 * Monday and 7 March a Saturday. The team works Monday to Friday at 9:00 UTC.
 */
const MONDAY = "2099-03-02"
const TUESDAY = "2099-03-03"
const WEDNESDAY = "2099-03-04"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser

const actor = (user: CustomShellUser) => ({
  id: user.id,
  name: user.name,
  currentWorkspaceId: user.currentWorkspaceId,
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  for (const person of [ben, carla]) {
    const sent = await createInvite(actor(anna), { email: person.email, role: "member" }, database)
    await acceptInvite(person, sent.inviteId, database)
  }
})

afterEach(async () => {
  await client.close()
})

async function remindersFor(userId: string) {
  return database
    .select({ message: customShellNotifications.message, href: projectNoticeLinks.href })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        eq(projectNoticeLinks.kind, "checkin_reminder")
      )
    )
}

/** Anna's project with Ben in it, and Carla left out; one task each for Ben. */
async function benWithTasks(titles: string[]) {
  const project = await createProject(anna.id, { name: "Website", color: "blue", description: "" }, database)
  await addProjectMember(anna.id, project.id, ben.id, database)
  const ids: string[] = []
  for (const title of titles) {
    const task = await createTask(
      actor(ben),
      { projectId: project.id, title, notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    ids.push(task.id)
  }
  return { projectId: project.id, ids }
}

describe("the reminder", () => {
  it("sends one bell notice at the check-in time on a work day, and none before it", async () => {
    await sendCheckinReminders(database, at(`${MONDAY}T08:59:00Z`))
    expect(await remindersFor(ben.id)).toHaveLength(0)

    await sendCheckinReminders(database, at(`${MONDAY}T09:00:00Z`))
    await sendCheckinReminders(database, at(`${MONDAY}T09:00:15Z`))
    expect(await remindersFor(ben.id)).toEqual([{ message: "Time to check in", href: "/dashboard?checkin=true" }])
  })

  it("sends nothing on a day off", async () => {
    await sendCheckinReminders(database, at("2099-03-07T12:00:00Z"))
    expect(await remindersFor(ben.id)).toHaveLength(0)
  })

  it("follows a person's own time, and the rest of the team keeps the team's", async () => {
    await setMyCheckinTime(ben.id, { checkinTime: "07:30" }, database)
    await sendCheckinReminders(database, at(`${MONDAY}T07:30:00Z`))
    expect(await remindersFor(ben.id)).toHaveLength(1)
    expect(await remindersFor(carla.id)).toHaveLength(0)
  })

  it("sends nothing once the person has checked in", async () => {
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T08:00:00Z`))
    await sendCheckinReminders(database, at(`${MONDAY}T09:05:00Z`))
    expect(await remindersFor(ben.id)).toHaveLength(0)
    expect(await remindersFor(carla.id)).toHaveLength(1)
  })

  it("works out each person's day in their own time zone", async () => {
    // 23:30 UTC on Friday is already 8:30 on Saturday in Tokyo.
    await setMyCheckinTime(ben.id, { timeZone: "Asia/Tokyo", checkinTime: "08:00" }, database)
    await sendCheckinReminders(database, at("2099-03-06T23:30:00Z"))
    expect(await remindersFor(ben.id)).toHaveLength(0)
    expect(await remindersFor(carla.id)).toHaveLength(1)

    // 23:30 UTC on Sunday is 8:30 on Monday in Tokyo, and still Sunday in UTC.
    await sendCheckinReminders(database, at("2099-03-08T23:30:00Z"))
    expect(await remindersFor(ben.id)).toHaveLength(1)
    expect(await remindersFor(carla.id)).toHaveLength(1)

    const page = await loadCheckinPage(ben.id, database, at("2099-03-08T23:30:00Z"))
    expect(page.today).toMatchObject({ day: "2099-03-09", workDay: true })
  })

  it("sends one notice when two passes overlap", async () => {
    const moment = at(`${MONDAY}T09:01:00Z`)
    await Promise.all([
      sendCheckinReminders(database, moment),
      sendCheckinReminders(database, moment),
    ])
    expect(await remindersFor(ben.id)).toHaveLength(1)
  })
})

describe("checking in", () => {
  it("marks a check-in after the person's time as late", async () => {
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:20:00Z`))
    const page = await loadCheckinPage(ben.id, database, at(`${MONDAY}T10:00:00Z`))
    expect(page.checkin).toMatchObject({ late: true })
    await submitCheckin(carla.id, { answers: [], picks: [] }, database, at(`${MONDAY}T08:59:00Z`))
    expect((await loadCheckinPage(carla.id, database, at(`${MONDAY}T10:00:00Z`))).checkin).toMatchObject({
      late: false,
    })
  })

  it("is never late on a day off, and can't happen twice in a day", async () => {
    const saturday = at("2099-03-07T15:00:00Z")
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, saturday)
    expect((await loadCheckinPage(ben.id, database, saturday)).checkin).toMatchObject({ late: false })
    await expect(
      submitCheckin(ben.id, { answers: [], picks: [] }, database, saturday)
    ).rejects.toThrow(PROJECT_ERRORS.alreadyCheckedIn)
  })

  it("asks about every unfinished pick from the last check-in before saving", async () => {
    const { ids } = await benWithTasks(["Brief", "Logo", "Copy"])
    const [brief, logo, copy] = ids
    await submitCheckin(ben.id, { answers: [], picks: [brief, logo, copy] }, database, at(`${MONDAY}T09:00:00Z`))
    await setTaskStatus(actor(ben), { taskId: copy, status: "done", stuckReason: null }, database)

    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T09:00:00Z`))
    expect(page.leftovers?.day).toBe(MONDAY)
    expect(page.leftovers?.tasks.map((task) => task.title).sort()).toEqual(["Brief", "Logo"])
    // Leftovers are answered above the list, not picked again from it.
    expect(page.groups.flatMap((group) => group.tasks.map((task) => task.id))).not.toContain(brief)

    await expect(
      submitCheckin(
        ben.id,
        { answers: [{ taskId: brief, action: "carry" }], picks: [] },
        database,
        at(`${TUESDAY}T09:00:00Z`)
      )
    ).rejects.toThrow(PROJECT_ERRORS.answerEveryLeftover)

    await submitCheckin(
      ben.id,
      {
        answers: [
          { taskId: brief, action: "carry" },
          { taskId: logo, action: "drop", reason: "Anna is redoing the brief" },
        ],
        picks: [],
      },
      database,
      at(`${TUESDAY}T09:00:00Z`)
    )
    const after = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T10:00:00Z`))
    expect(after.pickedTaskIds).toEqual([brief])
    expect(after.answers).toEqual([
      { taskId: brief, title: "Brief", action: "carry", reason: null },
      { taskId: logo, title: "Logo", action: "drop", reason: "Anna is redoing the brief" },
    ])
  })

  it("doesn't ask about a leftover whose project was archived", async () => {
    const { projectId, ids } = await benWithTasks(["Brief"])
    await submitCheckin(ben.id, { answers: [], picks: ids }, database, at(`${MONDAY}T09:00:00Z`))
    await setProjectArchived(anna.id, projectId, true, database)
    const tuesday = at(`${TUESDAY}T09:00:00Z`)
    expect((await loadCheckinPage(ben.id, database, tuesday)).leftovers).toBeNull()
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, tuesday)
  })

  it("lets today's picks change during the day", async () => {
    const { ids } = await benWithTasks(["Brief", "Logo"])
    const morning = at(`${MONDAY}T09:00:00Z`)
    await expect(addPick(ben.id, ids[0], database, morning)).rejects.toThrow(PROJECT_ERRORS.notCheckedIn)
    await submitCheckin(ben.id, { answers: [], picks: [ids[0]] }, database, morning)
    await addPick(ben.id, ids[1], database, morning)
    await removePick(ben.id, ids[0], database, morning)
    expect((await loadCheckinPage(ben.id, database, morning)).pickedTaskIds).toEqual([ids[1]])
  })

  it("refuses a time zone the database doesn't know", async () => {
    await expect(setMyCheckinTime(ben.id, { timeZone: "Mars/Olympus_Mons" }, database)).rejects.toThrow(
      PROJECT_ERRORS.unknownTimeZone
    )
  })

  it("turns a day already saved as missed into today's check-in", async () => {
    // Ben moves west after midnight UTC, back onto a day the job saved as missed.
    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    await setMyCheckinTime(ben.id, { timeZone: "America/New_York" }, database)
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${TUESDAY}T02:00:00Z`))
    const [monday] = await database
      .select()
      .from(projectCheckins)
      .where(and(eq(projectCheckins.userId, ben.id), eq(projectCheckins.day, MONDAY)))
    expect(monday).toMatchObject({ timeZone: "America/New_York", closedAt: null })
    expect(monday.checkedInAt).not.toBeNull()
  })

  it("refuses a task from a project the person can't see", async () => {
    const { ids } = await benWithTasks(["Brief"])
    await expect(
      submitCheckin(carla.id, { answers: [], picks: [ids[0]] }, database, at(`${MONDAY}T09:00:00Z`))
    ).rejects.toThrow(PROJECT_ERRORS.taskNotFound)
  })
})

describe("the Team dashboard's check-ins", () => {
  it("puts the blocked first and people yet to check in last, and hides other projects' tasks", async () => {
    const { ids } = await benWithTasks(["Brief", "Logo"])
    const morning = at(`${MONDAY}T09:30:00Z`)
    await submitCheckin(ben.id, { answers: [], picks: ids }, database, morning)
    await setTaskStatus(actor(ben), { taskId: ids[1], status: "stuck", stuckReason: "No photos" }, database)
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at(`${MONDAY}T08:50:00Z`))

    const annaView = await loadTeamDay(anna.id, undefined, database, morning)
    expect(annaView.people.map((p) => [p.person.name, p.state])).toEqual([
      ["Ben", "checked_in"],
      ["Anna", "checked_in"],
      ["Carla", "not_yet"],
    ])
    expect(annaView).toMatchObject({ day: MONDAY, checkedIn: 2, expected: 3, blocked: 1 })
    expect(annaView.people[0]).toMatchObject({
      late: true,
      picked: [{ title: "Brief" }, { title: "Logo" }],
      blockers: [{ title: "Logo", reason: "No photos" }],
    })

    // Carla isn't in Ben's project: she sees that he picked two tasks, never which.
    const carlaView = await loadTeamDay(carla.id, undefined, database, morning)
    const benRow = carlaView.people.find((p) => p.person.id === ben.id)
    expect(benRow?.picked).toEqual([
      { taskId: null, title: null },
      { taskId: null, title: null },
    ])
    expect(benRow?.blockers).toEqual([{ taskId: null, title: null, reason: null }])
  })

  it("shows the day before's picks, and nobody as missing on a day off", async () => {
    const { ids } = await benWithTasks(["Brief"])
    await submitCheckin(ben.id, { answers: [], picks: ids }, database, at(`${MONDAY}T09:00:00Z`))
    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    const tuesday = await loadTeamDay(anna.id, undefined, database, at(`${TUESDAY}T10:00:00Z`))
    expect(tuesday.people.find((p) => p.person.id === ben.id)?.before).toEqual([
      { taskId: ids[0], title: "Brief" },
    ])

    const saturday = await loadTeamDay(anna.id, undefined, database, at("2099-03-07T12:00:00Z"))
    expect(saturday.people.every((p) => p.state === "day_off")).toBe(true)
    expect(saturday.expected).toBe(0)
  })

  it("counts each day of the month from the saved rows", async () => {
    const { ids } = await benWithTasks(["Brief"])
    await submitCheckin(ben.id, { answers: [], picks: ids }, database, at(`${MONDAY}T09:00:00Z`))
    await setTaskStatus(actor(ben), { taskId: ids[0], status: "stuck", stuckReason: "No photos" }, database)
    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at(`${TUESDAY}T09:00:00Z`))

    const month = await loadTeamMonth(anna.id, undefined, database, at(`${TUESDAY}T10:00:00Z`))
    expect(month).toMatchObject({ month: "2099-03", today: TUESDAY })
    expect(month.days).toEqual([
      { day: MONDAY, checkedIn: 1, expected: 3, blocked: 1 },
      { day: TUESDAY, checkedIn: 1, expected: 3, blocked: 0 },
    ])
  })
})

describe("the end of the day", () => {
  it("saves each pick's status once the person's day is over, and records missed days", async () => {
    const { ids } = await benWithTasks(["Brief", "Logo"])
    await submitCheckin(ben.id, { answers: [], picks: ids }, database, at(`${MONDAY}T09:00:00Z`))
    await setTaskStatus(actor(ben), { taskId: ids[0], status: "done", stuckReason: null }, database)

    await saveFinishedDays(database, at(`${MONDAY}T23:59:00Z`))
    const before = await database.select().from(projectCheckinItems)
    expect(before.every((item) => item.endStatus === null)).toBe(true)

    await Promise.all([
      saveFinishedDays(database, at(`${TUESDAY}T00:00:15Z`)),
      saveFinishedDays(database, at(`${TUESDAY}T00:00:15Z`)),
    ])
    // A later change doesn't touch the saved day.
    await setTaskStatus(actor(ben), { taskId: ids[1], status: "doing", stuckReason: null }, database)
    await saveFinishedDays(database, at(`${TUESDAY}T00:01:00Z`))

    const saved = await database.select().from(projectCheckinItems)
    expect(Object.fromEntries(saved.map((item) => [item.taskTitle, item.endStatus]))).toEqual({
      Brief: "done",
      Logo: "todo",
    })
    const days = await database.select().from(projectCheckins).where(eq(projectCheckins.day, MONDAY))
    expect(days.map((d) => [d.userId === ben.id ? "Ben" : d.userId === anna.id ? "Anna" : "Carla", Boolean(d.checkedInAt), d.workDay]).sort()).toEqual([
      ["Anna", false, true],
      ["Ben", true, true],
      ["Carla", false, true],
    ])
  })
})

describe("history", () => {
  async function pickOn(day: string, taskId: string, status?: "done" | "stuck") {
    const morning = at(`${day}T09:00:00Z`)
    const page = await loadCheckinPage(ben.id, database, morning)
    await submitCheckin(
      ben.id,
      {
        answers: (page.leftovers?.tasks ?? []).map((task) => ({ taskId: task.id, action: "carry" as const })),
        picks: page.leftovers?.tasks.some((t) => t.id === taskId) ? [] : [taskId],
      },
      database,
      morning
    )
    if (status) {
      await setTaskStatus(
        actor(ben),
        { taskId, status, stuckReason: status === "stuck" ? "Waiting on photos" : null },
        database
      )
    }
    await saveFinishedDays(database, at(`${day}T23:59:59Z`))
    await saveFinishedDays(database, new Date(at(`${day}T00:00:00Z`).getTime() + 24 * 3600 * 1000 + 5000))
  }

  it("shows every day a task was picked with its end-of-day status, and its hand-overs", async () => {
    const project = await createProject(anna.id, { name: "Website", color: "blue", description: "" }, database)
    await addProjectMember(anna.id, project.id, ben.id, database)
    const task = await createTask(
      actor(anna),
      { projectId: project.id, title: "Photos", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    await acceptTask(actor(ben), task.id, database)
    await pickOn(MONDAY, task.id, "stuck")
    await pickOn(TUESDAY, task.id)
    await pickOn(WEDNESDAY, task.id)

    const detail = await loadTaskDetail(anna.id, task.id, database)
    expect(detail.history.map((entry) => entry.kind)).toEqual([
      "handed_over",
      "accepted",
      "picked",
      "picked",
      "picked",
    ])
    const picks = detail.history.filter((entry) => entry.kind === "picked")
    expect(picks.map((p) => ("day" in p ? [p.day, p.endStatus] : null))).toEqual([
      [MONDAY, "stuck"],
      [TUESDAY, "stuck"],
      [WEDNESDAY, "stuck"],
    ])
    expect(detail.task.pickedDays).toBe(3)
    expect((await loadMyWork(ben.id, database))[0].pickedDays).toBe(3)

    await handBackTask(actor(ben), { taskId: task.id, reason: "Need a photographer" }, database)
    const after = await loadTaskDetail(anna.id, task.id, database)
    expect(after.history.find((entry) => entry.kind === "handed_back")).toMatchObject({
      kind: "handed_back",
      actorName: "Ben",
      targetName: "Anna",
      reason: "Need a photographer",
    })

    // Ben leaves the team; his days stay on the task.
    await removeTeamMember(anna.id, ben.id, database)
    const kept = await loadTaskDetail(anna.id, task.id, database)
    expect(kept.history.filter((e) => e.kind === "picked")).toHaveLength(3)
    expect(kept.history.find((e) => e.kind === "picked")).toMatchObject({ personName: "Ben" })
    const wednesday = await loadTeamDay(anna.id, WEDNESDAY, database, at(`${WEDNESDAY}T23:00:00Z`))
    expect(wednesday.people.map((p) => p.person.name)).not.toContain("Ben")
  })
})
