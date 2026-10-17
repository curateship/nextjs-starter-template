import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { overDoingLimit } from "@/lib/project/doing-limit"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { addBlockerReply } from "@/server/project/blocker-replies"
import { saveFinishedDays, sendCheckinReminders } from "@/server/project/checkin-jobs"
import {
  addPick,
  checkOut,
  loadCheckinPage,
  orderTodaysPicks,
  saveCheckinNotes,
  submitCheckin,
} from "@/server/project/checkins"
import { addHoliday } from "@/server/project/holidays"
import { loadMyWeek } from "@/server/project/my-week"
import { addProjectMember } from "@/server/project/projects"
import {
  projectCheckins,
  projectNoticeLinks,
  projectProjects,
  projectTaskComments,
  projectTasks,
} from "@/server/project/schema"
import { changeManyTasks } from "@/server/project/task-changes"
import { loadTaskHistory } from "@/server/project/task-history"
import { reviewTask, setNeedsReview } from "@/server/project/task-review"
import { thankForTask } from "@/server/project/task-thanks"
import {
  acceptManyTasks,
  acceptTask,
  assignTask,
  createTask,
  deleteTask,
  loadTaskDetail,
  setTaskStatus,
} from "@/server/project/tasks"
import { loadTeamDay, loadTeamMonth } from "@/server/project/team-days"
import { loadPeopleRoom, loadWorkload } from "@/server/project/team-running"
import { updateTeam, type TeamSummary } from "@/server/project/teams"
import { joinTeam, projectFor, startTeam } from "@/server/project/test-people"
import { addTimeOff } from "@/server/project/time-off"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * More features tasks 01 (the check-in and the day) and 02 (handing out
 * work). Dates are in 2099 so nothing meets the real today. 2 March 2099 is
 * a Monday. The team works Monday to Friday at 9:00 UTC.
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
/** The site admin, who runs the team without being on it. */
let admin: CustomShellUser
let team: TeamSummary
let projectId: string

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
  ;({ admin, team } = await startTeam(database, [anna, ben, carla]))
  // Anna makes Website and is on it; the site admin adds Ben. Carla is on the
  // team but not on Website.
  projectId = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  await addProjectMember(admin.id, projectId, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

async function task(title: string, assigneeUserId: string | null, by = anna, note: string | null = null) {
  const { id } = await createTask(
    actor(by),
    { projectId, title, notes: "", assigneeUserId, dueDate: null, steps: [], handoverNote: note },
    database
  )
  return id
}

async function noticesOf(userId: string, kind?: string) {
  const rows = await database
    .select({
      kind: projectNoticeLinks.kind,
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      href: projectNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
  return kind ? rows.filter((row) => row.kind === kind) : rows
}

async function checkinOf(userId: string, day: string) {
  const [row] = await database
    .select()
    .from(projectCheckins)
    .where(and(eq(projectCheckins.userId, userId), eq(projectCheckins.day, day)))
  return row
}

const NO_NOTES = { yesterday: null, today: null, blocker: null }

describe("answering a blocker", () => {
  it("lets anyone on the team answer a Blocker note, and tells the blocked person once", async () => {
    await submitCheckin(
      ben.id,
      { answers: [], picks: [], notes: { ...NO_NOTES, blocker: "Waiting on the hosting login" } },
      database,
      at(`${MONDAY}T09:00:00Z`)
    )
    const checkin = await checkinOf(ben.id, MONDAY)
    // Carla isn't on Ben's project, and can still answer his note.
    await addBlockerReply(actor(carla), { checkinId: checkin.id, taskId: null, body: "I have it, sending now" }, database)
    // Replying to yourself tells nobody.
    await addBlockerReply(actor(ben), { checkinId: checkin.id, taskId: null, body: "Thanks" }, database)

    expect(await noticesOf(ben.id, "blocker_reply")).toEqual([
      {
        kind: "blocker_reply",
        message: "Carla answered your blocker",
        detail: "I have it, sending now",
        href: `/team?day=${MONDAY}`,
      },
    ])
    const day = await loadTeamDay(anna.id, MONDAY, database, at(`${MONDAY}T10:00:00Z`))
    const row = day.people.find((person) => person.person.id === ben.id)!
    expect(row.noteReplies.map((reply) => [reply.author?.name, reply.body])).toEqual([
      ["Carla", "I have it, sending now"],
      ["Ben", "Thanks"],
    ])
  })

  it("refuses a reply under someone with no blocker", async () => {
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    const checkin = await checkinOf(ben.id, MONDAY)
    await expect(
      addBlockerReply(actor(anna), { checkinId: checkin.id, taskId: null, body: "Hi" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.noBlockerHere)
  })

  it("lets only the task's project answer a Stuck task, and puts the answer in its chat", async () => {
    const stuck = await task("Contact form", ben.id)
    await acceptTask(actor(ben), stuck, database)
    await submitCheckin(ben.id, { answers: [], picks: [stuck] }, database, at(`${MONDAY}T09:00:00Z`))
    await setTaskStatus(actor(ben), { taskId: stuck, status: "stuck", stuckReason: "No SMTP key" }, database)
    const checkin = await checkinOf(ben.id, MONDAY)

    await expect(
      addBlockerReply(actor(carla), { checkinId: checkin.id, taskId: stuck, body: "Try this" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.stuckTaskNotYours)
    await addBlockerReply(actor(anna), { checkinId: checkin.id, taskId: stuck, body: "Key is in the vault" }, database)

    const chat = await database.select().from(projectTaskComments).where(eq(projectTaskComments.taskId, stuck))
    expect(chat.map((message) => message.body)).toEqual(["Key is in the vault"])
    // One notice, not also "commented on a task".
    expect((await noticesOf(ben.id)).filter((n) => n.kind === "blocker_reply" || n.kind === "task_comment")).toHaveLength(1)
    // Carla can't see the task, so she doesn't see the reply under it either.
    const carlaView = await loadTeamDay(carla.id, MONDAY, database, at(`${MONDAY}T10:00:00Z`))
    expect(carlaView.people.find((p) => p.person.id === ben.id)!.blockers[0]).toMatchObject({
      title: null,
      replies: [],
    })
  })
})

describe("the evening check-out", () => {
  it("marks ticked picks Done and starts tomorrow's Yesterday box, and is never needed", async () => {
    const form = await task("Contact form", ben.id)
    const logo = await task("Logo", ben.id)
    await submitCheckin(ben.id, { answers: [], picks: [form, logo] }, database, at(`${MONDAY}T09:00:00Z`))
    await checkOut(actor(ben), { doneTaskIds: [logo], noteLeft: "Contact form half done" }, database, at(`${MONDAY}T17:30:00Z`))

    const [done] = await database.select().from(projectTasks).where(eq(projectTasks.id, logo))
    expect(done.status).toBe("done")
    const tuesday = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:00:00Z`))
    expect(tuesday.notes.yesterday).toBe("Contact form half done")
    // The team never sees it.
    const day = await loadTeamDay(anna.id, MONDAY, database, at(`${MONDAY}T18:00:00Z`))
    expect(JSON.stringify(day)).not.toContain("half done")

    // Carla never checks out, and checks in the next day all the same.
    await submitCheckin(carla.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await submitCheckin(carla.id, { answers: [], picks: [] }, database, at(`${TUESDAY}T09:00:00Z`))
    expect((await loadCheckinPage(carla.id, database, at(`${TUESDAY}T10:00:00Z`))).checkin).not.toBeNull()
  })

  it("changes nothing when one ticked pick can't be marked Done", async () => {
    const form = await task("Contact form", ben.id)
    const logo = await task("Logo", ben.id)
    await submitCheckin(ben.id, { answers: [], picks: [form, logo] }, database, at(`${MONDAY}T09:00:00Z`))
    await deleteTask(actor(anna), logo, database)
    await expect(
      checkOut(actor(ben), { doneTaskIds: [form, logo], noteLeft: "Left" }, database, at(`${MONDAY}T17:00:00Z`))
    ).rejects.toThrow()

    const [kept] = await database.select().from(projectTasks).where(eq(projectTasks.id, form))
    expect(kept.status).not.toBe("done")
    expect((await checkinOf(ben.id, MONDAY)).checkedOutAt).toBeNull()
  })

  it("refuses a task that isn't one of today's picks", async () => {
    const other = await task("Other", ben.id)
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await expect(
      checkOut(actor(ben), { doneTaskIds: [other], noteLeft: null }, database, at(`${MONDAY}T17:00:00Z`))
    ).rejects.toThrow(PROJECT_ERRORS.notTodaysPicks)
  })
})

describe("tags in check-in notes", () => {
  const tag = (user: CustomShellUser) => `@[${user.name}](${user.id})`

  it("tells each person tagged once per note, and only newly tagged ones after an edit", async () => {
    await submitCheckin(
      ben.id,
      {
        answers: [],
        picks: [],
        notes: { yesterday: null, today: `Pairing with ${tag(anna)}`, blocker: `Need ${tag(carla)} ${tag(ben)}` },
      },
      database,
      at(`${MONDAY}T09:00:00Z`)
    )
    expect(await noticesOf(anna.id, "checkin_mention")).toEqual([
      {
        kind: "checkin_mention",
        message: "Ben mentioned you in their check-in",
        detail: "Pairing with @Anna",
        href: `/team?day=${MONDAY}`,
      },
    ])
    expect(await noticesOf(carla.id, "checkin_mention")).toHaveLength(1)
    expect(await noticesOf(ben.id, "checkin_mention")).toEqual([])

    // A save while typing tells nobody; leaving the box tells only the newly tagged.
    const notes = { yesterday: null, today: `Pairing with ${tag(anna)} and ${tag(carla)}`, blocker: `Need ${tag(carla)}` }
    await saveCheckinNotes(ben.id, { ...notes, notify: false }, database, at(`${MONDAY}T10:00:00Z`))
    expect(await noticesOf(carla.id, "checkin_mention")).toHaveLength(1)
    await saveCheckinNotes(ben.id, { ...notes, notify: true }, database, at(`${MONDAY}T10:00:05Z`))
    await saveCheckinNotes(ben.id, { ...notes, notify: true }, database, at(`${MONDAY}T10:00:10Z`))
    expect(await noticesOf(carla.id, "checkin_mention")).toHaveLength(2)
    expect(await noticesOf(anna.id, "checkin_mention")).toHaveLength(1)
  })

  it("refuses a tag of someone off the team", async () => {
    const olga = await insertUser(database, { name: "Olga", email: "olga@example.test" })
    await expect(
      submitCheckin(
        ben.id,
        { answers: [], picks: [], notes: { ...NO_NOTES, today: `With ${tag(olga)}` } },
        database,
        at(`${MONDAY}T09:00:00Z`)
      )
    ).rejects.toThrow(PROJECT_ERRORS.tagNotOnTeam)
  })
})

describe("the team's own check-in words", () => {
  it("shows the new words, and past days under the words of their day", async () => {
    await submitCheckin(ben.id, { answers: [], picks: [], notes: { ...NO_NOTES, today: "Members table" } }, database, at(`${MONDAY}T09:00:00Z`))
    await updateTeam(admin.id, { questionYesterday: "Wins", questionToday: "Focus" }, database)
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${TUESDAY}T09:00:00Z`))

    expect((await loadCheckinPage(ben.id, database, at(`${TUESDAY}T10:00:00Z`))).questions).toEqual({
      yesterday: "Wins",
      today: "Focus",
      blocker: "Blocker",
    })
    const monday = await loadTeamDay(anna.id, MONDAY, database, at(`${TUESDAY}T10:00:00Z`))
    const tuesday = await loadTeamDay(anna.id, TUESDAY, database, at(`${TUESDAY}T10:00:00Z`))
    const benOn = (day: typeof monday) => day.people.find((p) => p.person.id === ben.id)!.questions
    expect(benOn(monday).today).toBe("Today")
    expect(benOn(tuesday).today).toBe("Focus")
  })
})

describe("my own order for today's picks", () => {
  it("holds after a reload, changes nobody else's view, and puts a later pick last", async () => {
    const a = await task("A", ben.id)
    const b = await task("B", ben.id)
    const c = await task("C", ben.id)
    await submitCheckin(ben.id, { answers: [], picks: [a, b] }, database, at(`${MONDAY}T09:00:00Z`))
    await orderTodaysPicks(ben.id, [b, a], database, at(`${MONDAY}T09:05:00Z`))
    await addPick(ben.id, c, database, at(`${MONDAY}T13:00:00Z`))
    expect((await loadCheckinPage(ben.id, database, at(`${MONDAY}T14:00:00Z`))).pickedTaskIds).toEqual([b, a, c])

    const positions = await database.select({ id: projectTasks.id, position: projectTasks.position }).from(projectTasks)
    expect(new Set(positions.map((row) => row.position)).size).toBe(3)
    await expect(orderTodaysPicks(ben.id, [a, b, "nope"], database, at(`${MONDAY}T14:00:00Z`))).rejects.toThrow(
      PROJECT_ERRORS.notTodaysPicks
    )
  })

  it("starts the next day with carried-over tasks in yesterday's order", async () => {
    const a = await task("A", ben.id)
    const b = await task("B", ben.id)
    await submitCheckin(ben.id, { answers: [], picks: [a, b] }, database, at(`${MONDAY}T09:00:00Z`))
    await orderTodaysPicks(ben.id, [b, a], database, at(`${MONDAY}T09:05:00Z`))
    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:00:00Z`))
    expect(page.leftovers?.tasks.map((t) => t.id)).toEqual([b, a])
    await submitCheckin(
      ben.id,
      { answers: [{ taskId: a, action: "carry" }, { taskId: b, action: "carry" }], picks: [] },
      database,
      at(`${TUESDAY}T09:00:00Z`)
    )
    expect((await loadCheckinPage(ben.id, database, at(`${TUESDAY}T10:00:00Z`))).pickedTaskIds).toEqual([b, a])
  })
})

describe("my week", () => {
  it("counts what I finished, carried over and dropped, from my saved days", async () => {
    const a = await task("A", ben.id)
    const b = await task("B", ben.id)
    await submitCheckin(ben.id, { answers: [], picks: [a, b] }, database, at(`${MONDAY}T09:00:00Z`))
    await setTaskStatus(actor(ben), { taskId: a, status: "done", stuckReason: null }, database)
    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    await submitCheckin(
      ben.id,
      { answers: [{ taskId: b, action: "drop", reason: "Anna took it" }], picks: [] },
      database,
      at(`${TUESDAY}T09:30:00Z`)
    )
    await saveFinishedDays(database, at(`${WEDNESDAY}T00:00:30Z`))

    const week = await loadMyWeek(ben.id, undefined, database, at(`${WEDNESDAY}T08:00:00Z`))
    expect(week).toMatchObject({ monday: MONDAY, lastDay: WEDNESDAY, checkedIn: 2, workDays: 2 })
    expect(week.finished.map((t) => t.title)).toEqual(["A"])
    expect(week.dropped).toEqual([{ taskId: b, title: "B", reason: "Anna took it" }])
    await expect(loadMyWeek(ben.id, "2098-01-05", database, at(`${WEDNESDAY}T08:00:00Z`))).rejects.toThrow(
      PROJECT_ERRORS.weekTooFarBack
    )
  })
})

describe("team holidays", () => {
  it("sends no reminders, saves the day off, and names it on the calendar", async () => {
    await addHoliday(admin.id, { day: MONDAY, name: "Founders' Day" }, database)
    await expect(addHoliday(ben.id, { day: TUESDAY, name: "Mine" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    await expect(addHoliday(admin.id, { day: MONDAY, name: "Again" }, database)).rejects.toThrow(
      PROJECT_ERRORS.holidayTaken
    )

    await sendCheckinReminders(database, at(`${MONDAY}T10:00:00Z`))
    expect(await noticesOf(ben.id, "checkin_reminder")).toEqual([])
    const today = await loadTeamDay(anna.id, MONDAY, database, at(`${MONDAY}T10:00:00Z`))
    expect(today).toMatchObject({ holiday: "Founders' Day", expected: 0 })
    expect(today.people.every((p) => p.state === "day_off")).toBe(true)

    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    expect((await checkinOf(ben.id, MONDAY)).workDay).toBe(false)
    const month = await loadTeamMonth(anna.id, "2099-03", database, at(`${TUESDAY}T10:00:00Z`))
    expect(month.holidays.map((h) => h.name)).toEqual(["Founders' Day"])
    expect(month.days.find((d) => d.day === MONDAY)).toMatchObject({ expected: 0 })

    // A check-in on the holiday is never late.
    await submitCheckin(carla.id, { answers: [], picks: [] }, database, at(`${MONDAY}T15:00:00Z`))
    expect((await loadCheckinPage(carla.id, database, at(`${MONDAY}T15:01:00Z`))).checkin?.late).toBe(false)
  })
})

describe("thanks", () => {
  it("thanks whoever did it once, never yourself, and names the task only to those who can see it", async () => {
    const form = await task("Build the contact form", ben.id)
    await expect(thankForTask(actor(anna), form, database)).rejects.toThrow(PROJECT_ERRORS.nothingToThank)
    await setTaskStatus(actor(ben), { taskId: form, status: "done", stuckReason: null }, database)
    await expect(thankForTask(actor(ben), form, database)).rejects.toThrow(PROJECT_ERRORS.cantThankYourself)
    await thankForTask(actor(anna), form, database)
    await thankForTask(actor(anna), form, database)

    expect(await noticesOf(ben.id, "task_thanks")).toEqual([
      expect.objectContaining({ message: "Anna thanked you for a task", detail: "Build the contact form" }),
    ])
    expect((await loadTaskDetail(anna.id, form, database)).thanked).toBe(true)

    const today = new Date().toISOString().slice(0, 10)
    const forAnna = await loadTeamDay(anna.id, today, database)
    const forCarla = await loadTeamDay(carla.id, today, database)
    const line = (day: typeof forAnna) => day.people.find((p) => p.person.id === ben.id)!.thanks
    expect(line(forAnna)).toEqual([{ fromName: "Anna", taskTitle: "Build the contact form" }])
    expect(line(forCarla)).toEqual([{ fromName: "Anna", taskTitle: null }])
  })
})

describe("handing out work", () => {
  it("carries a note into the bell, onto the task while Waiting, and into history", async () => {
    const page = await task("Write the About page", ben.id, anna, "Client wants it by Thursday")
    expect(await noticesOf(ben.id, "task_assigned")).toEqual([
      expect.objectContaining({ detail: "Write the About page: Client wants it by Thursday" }),
    ])
    expect((await loadTaskDetail(anna.id, page, database)).task.handoverNote).toBe("Client wants it by Thursday")
    await acceptTask(actor(ben), page, database)
    expect((await loadTaskDetail(anna.id, page, database)).task.handoverNote).toBeNull()
    const history = await loadTaskHistory(page, database)
    expect(history.find((entry) => entry.kind === "handed_over")).toMatchObject({
      reason: "Client wants it by Thursday",
    })

    // An empty note changes nothing.
    const plain = await task("Plain", null)
    await assignTask(actor(anna), { taskId: plain, assigneeUserId: ben.id }, database)
    expect(await noticesOf(ben.id, "task_assigned")).toContainEqual(expect.objectContaining({ detail: "Plain" }))
  })

  it("shows who has room with the Workload tab's counts, and who is away", async () => {
    await task("One", ben.id)
    await task("Two", ben.id)
    const today = new Date().toISOString().slice(0, 10)
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    await addTimeOff(carla.id, { firstDay: today, lastDay: later }, database)
    const room = await loadPeopleRoom(anna.id, database)
    const workload = await loadWorkload(anna.id, database)
    expect(room[ben.id].open).toBe(workload.find((row) => row.person.id === ben.id)!.counts.open)
    expect(room[ben.id]).toEqual({ open: 2, awayUntil: null })
    expect(room[carla.id].awayUntil).toBe(later)
  })

  it("accepts every waiting task, and refuses one that changed hands alone", async () => {
    const a = await task("A", ben.id)
    const b = await task("B", ben.id)
    await assignTask(actor(anna), { taskId: b, assigneeUserId: anna.id }, database)
    const outcome = await acceptManyTasks(actor(ben), [a, b], database)
    expect(outcome.accepted).toEqual([a])
    expect(outcome.refused).toEqual([{ taskId: b, title: "B", reason: PROJECT_ERRORS.notAssignee }])
  })

  it("waits for a review once Done, then confirms or sends it back", async () => {
    const a = await task("About page", ben.id)
    await acceptTask(actor(ben), a, database)
    await expect(setNeedsReview(actor(ben), { taskId: a, on: true }, database)).rejects.toThrow(
      PROJECT_ERRORS.cantAskForReview
    )
    await setNeedsReview(actor(anna), { taskId: a, on: true }, database)
    await setTaskStatus(actor(ben), { taskId: a, status: "done", stuckReason: null }, database)

    const waiting = (await loadTaskDetail(anna.id, a, database)).task
    expect(waiting).toMatchObject({ status: "done", review: { needed: true, waiting: true } })
    expect(await noticesOf(anna.id, "task_review")).toHaveLength(1)
    expect(await noticesOf(anna.id, "task_done")).toEqual([])

    await reviewTask(actor(anna), { taskId: a, action: "send_back", reason: "Missing the team photo" }, database)
    expect((await loadTaskDetail(ben.id, a, database)).task).toMatchObject({ status: "doing", review: { waiting: false } })
    expect(await noticesOf(ben.id, "task_sent_back")).toEqual([
      expect.objectContaining({ detail: "About page: Missing the team photo" }),
    ])

    await setTaskStatus(actor(ben), { taskId: a, status: "done", stuckReason: null }, database)
    await expect(reviewTask(actor(carla), { taskId: a, action: "confirm" }, database)).rejects.toThrow()
    await reviewTask(actor(anna), { taskId: a, action: "confirm" }, database)
    expect((await loadTaskDetail(anna.id, a, database)).task.review.waiting).toBe(false)
    const kinds = (await loadTaskHistory(a, database)).map((entry) => entry.kind)
    expect(kinds).toEqual(expect.arrayContaining(["sent_back", "review_confirmed"]))
  })

  it("confirms itself when the reviewer marks it Done", async () => {
    const a = await task("Mine", anna.id)
    await setNeedsReview(actor(anna), { taskId: a, on: true }, database)
    await setTaskStatus(actor(anna), { taskId: a, status: "done", stuckReason: null }, database)
    expect((await loadTaskDetail(anna.id, a, database)).task.review.waiting).toBe(false)
  })

  it("hands ticked tasks on with one note, refusing anyone not on a task's project", async () => {
    const a = await task("A", anna.id)
    const outcome = await changeManyTasks(
      actor(anna),
      { taskIds: [a], change: { kind: "assign", assigneeUserId: carla.id, note: "Over to you" } },
      database
    )
    expect(outcome.refused).toEqual([{ taskId: a, title: "A", reason: PROJECT_ERRORS.notProjectMember }])
    await changeManyTasks(
      actor(anna),
      { taskIds: [a], change: { kind: "assign", assigneeUserId: ben.id, note: "Over to you" } },
      database
    )
    expect(await noticesOf(ben.id, "task_assigned")).toContainEqual(
      expect.objectContaining({ detail: "A: Over to you" })
    )
  })

  it("gives a new member the starter tasks as their own, from the site admin, and nobody already on the team", async () => {
    await updateTeam(admin.id, { starterTasks: ["Read the handbook", "Set up email"] }, database)
    const dan = await insertUser(database, { name: "Dan", email: "dan@example.test" })
    await joinTeam(database, team.id, dan)

    const tasks = await database
      .select({ title: projectTasks.title, assignee: projectTasks.assigneeUserId, by: projectTasks.assignedByUserId, personal: projectProjects.personalUserId })
      .from(projectTasks)
      .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
      .where(eq(projectTasks.assigneeUserId, dan.id))
    expect(tasks).toEqual([
      { title: "Read the handbook", assignee: dan.id, by: admin.id, personal: dan.id },
      { title: "Set up email", assignee: dan.id, by: admin.id, personal: dan.id },
    ])
    expect(await noticesOf(dan.id, "tasks_handed")).toEqual([
      expect.objectContaining({ message: "Tyler gave you 2 tasks", href: "/dashboard" }),
    ])
    const page = await loadCheckinPage(dan.id, database, at(`${MONDAY}T08:00:00Z`))
    expect(page.groups.flatMap((group) => group.tasks).map((t) => t.title)).toEqual([
      "Read the handbook",
      "Set up email",
    ])
    // Nobody already on the team got them.
    const bens = await database.select().from(projectTasks).where(eq(projectTasks.assigneeUserId, ben.id))
    expect(bens).toEqual([])
  })

  it("warns about Doing over the limit, and says nothing without one", () => {
    const leo = { id: "leo", name: "Leo" }
    const doing = (n: number) => Array.from({ length: n }, () => ({ status: "doing", assignee: leo }))
    expect(overDoingLimit(doing(4), 3)).toEqual([{ personId: "leo", text: "Leo has 4 in Doing (limit 3)" }])
    expect(overDoingLimit(doing(3), 3)).toEqual([])
    expect(overDoingLimit(doing(9), null)).toEqual([])
  })
})
