import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { meetingSchema } from "@/lib/project/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import type { CustomShellDb } from "@/server/db"
import { saveFinishedDays } from "@/server/project/checkin-jobs"
import {
  loadCheckinPage,
  saveCheckinNotes,
  setMyCheckinTime,
  submitCheckin,
} from "@/server/project/checkins"
import { createInvite } from "@/server/project/invites"
import {
  MEETING_SAVES,
  createMeeting,
  deleteMeeting,
  loadTeamMeetings,
  updateMeeting,
  type MeetingInput,
} from "@/server/project/meetings"
import { addProjectMember } from "@/server/project/projects"
import { projectNoticeLinks, projectTasks } from "@/server/project/schema"
import { createTask, deleteTask, setTaskStatus } from "@/server/project/tasks"
import { loadTeamFigures } from "@/server/project/team-figures"
import { loadTeamDay, loadTeamMonth } from "@/server/project/team-days"
import { loadTeamDashboard, setTeamPhoto } from "@/server/project/teams"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

/*
 * Dates are in 2099 so nothing here meets the real today. 2 March 2099 is a
 * Monday. The team works Monday to Friday at 9:00 UTC. The site admin runs
 * it; Anna, Ben and Carla work on it.
 */
const MONDAY = "2099-03-02"
const TUESDAY = "2099-03-03"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let admin: CustomShellUser
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let olga: CustomShellUser

const actor = (user: CustomShellUser) => ({
  id: user.id,
  name: user.name,
  currentWorkspaceId: user.currentWorkspaceId,
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertEmployee(database, { name: "Carla", email: "carla@example.test" })
  olga = await insertEmployee(database, { name: "Olga", email: "olga@example.test" })
  admin = (await startTeam(database, [anna, ben, carla])).admin
  // Olga works on another team.
  await startTeam(database, [olga], { name: "Other" })
})

afterEach(async () => {
  await client.close()
})

function meeting(overrides: Partial<MeetingInput> = {}): MeetingInput {
  return {
    title: "Weekly planning",
    color: "blue",
    day: MONDAY,
    startTime: "10:00",
    endTime: "10:45",
    repeatEvery: "week",
    videoUrl: "https://meet.google.com/abc-defg-hij",
    peopleIds: [],
    ...overrides,
  }
}

async function invitesFor(userId: string) {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      href: projectNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        eq(projectNoticeLinks.kind, "meeting_invite")
      )
    )
}

describe("meetings", () => {
  it("falls on every repeat, every other week, or once", async () => {
    await createMeeting(actor(ben), meeting(), database, at(`${MONDAY}T08:00:00Z`))
    await createMeeting(
      actor(ben),
      meeting({ title: "Sprint retro", day: "2099-03-06", repeatEvery: "two_weeks", videoUrl: null }),
      database
    )
    await createMeeting(actor(ben), meeting({ title: "All-hands", day: "2099-03-19", repeatEvery: null }), database)

    const march = await loadTeamMeetings(carla.id, { month: "2099-03" }, database, at(`${MONDAY}T08:00:00Z`))
    const daysOf = (title: string) => {
      const id = march.meetings.find((m) => m.title === title)?.id
      return march.occurrences.filter((o) => o.meetingId === id).map((o) => o.day)
    }
    // The grid runs from Monday 23 Feb to Sunday 5 April.
    expect(daysOf("Weekly planning")).toEqual([
      "2099-03-02",
      "2099-03-09",
      "2099-03-16",
      "2099-03-23",
      "2099-03-30",
    ])
    expect(daysOf("Sprint retro")).toEqual(["2099-03-06", "2099-03-20", "2099-04-03"])
    expect(daysOf("All-hands")).toEqual(["2099-03-19"])
    expect(march.meetings.find((m) => m.title === "Weekly planning")).toMatchObject({
      service: "Google Meet",
      canEdit: false,
    })
    expect(march.meetings.find((m) => m.title === "Sprint retro")?.service).toBeNull()

    // The chosen day is listed even when it is outside the month on show.
    const away = await loadTeamMeetings(carla.id, { month: "2099-03", day: "2099-06-01" }, database)
    expect(away.occurrences.filter((o) => o.day === "2099-06-01")).toHaveLength(1)
  })

  it("shows each person the meeting in their own time and day", async () => {
    await createMeeting(actor(anna), meeting({ startTime: "23:30", endTime: "23:59" }), database)
    await setMyCheckinTime(ben.id, { timeZone: "Asia/Tokyo" }, database)

    const annaView = await loadTeamMeetings(anna.id, { month: "2099-03" }, database, at(`${MONDAY}T08:00:00Z`))
    const benView = await loadTeamMeetings(ben.id, { month: "2099-03" }, database, at(`${MONDAY}T08:00:00Z`))
    expect(annaView.occurrences[0]).toMatchObject({ day: MONDAY, startsAt: "2099-03-02T23:30:00.000Z" })
    // 23:30 on Monday in UTC is 8:30 on Tuesday in Tokyo.
    expect(benView).toMatchObject({ viewerZone: "Asia/Tokyo", teamZone: "UTC" })
    expect(benView.occurrences[0]).toMatchObject({ day: TUESDAY, startsAt: "2099-03-02T23:30:00.000Z" })
  })

  it("lets its maker and the site admin change or delete it, and nobody else", async () => {
    const { id } = await createMeeting(actor(ben), meeting(), database)
    for (const other of [anna, carla]) {
      await expect(updateMeeting(actor(other), id, meeting({ title: "Mine now" }), database)).rejects.toThrow(
        PROJECT_ERRORS.cantChangeMeeting
      )
      await expect(deleteMeeting(other.id, id, database)).rejects.toThrow(PROJECT_ERRORS.cantChangeMeeting)
    }

    await updateMeeting(actor(ben), id, meeting({ title: "Planning" }), database)
    await updateMeeting(actor(admin), id, meeting({ title: "Team planning" }), database)

    const view = await loadTeamMeetings(ben.id, { month: "2099-03" }, database)
    expect(view.meetings.map((m) => [m.title, m.canEdit])).toEqual([["Team planning", true]])
    const carlaView = await loadTeamMeetings(carla.id, { month: "2099-03" }, database)
    expect(carlaView.meetings.map((m) => m.canEdit)).toEqual([false])

    await deleteMeeting(admin.id, id, database)
    const after = await loadTeamMeetings(ben.id, { month: "2099-03" }, database)
    expect(after).toMatchObject({ meetings: [], occurrences: [] })
  })

  it("refuses a person on another team at every endpoint, and never shows them the meeting", async () => {
    const { id } = await createMeeting(actor(ben), meeting(), database)
    await expect(updateMeeting(actor(olga), id, meeting(), database)).rejects.toThrow(
      PROJECT_ERRORS.meetingNotFound
    )
    await expect(deleteMeeting(olga.id, id, database)).rejects.toThrow(PROJECT_ERRORS.meetingNotFound)
    expect((await loadTeamMeetings(olga.id, { month: "2099-03" }, database)).meetings).toEqual([])

    // Nor can anyone invite her.
    await expect(
      createMeeting(actor(ben), meeting({ peopleIds: [carla.id, olga.id] }), database)
    ).rejects.toThrow(PROJECT_ERRORS.personNotOnTeam)
  })

  it("tells each person added once, in their own time, and never the person adding them", async () => {
    await setMyCheckinTime(carla.id, { timeZone: "Asia/Tokyo" }, database)
    const { id } = await createMeeting(
      actor(anna),
      meeting({ peopleIds: [anna.id, ben.id] }),
      database,
      at("2099-03-01T12:00:00Z")
    )
    expect(await invitesFor(anna.id)).toEqual([])
    expect(await invitesFor(ben.id)).toEqual([
      {
        message: "Anna invited you to a meeting",
        detail: "Weekly planning · Mon, Mar 2, 10:00 AM, every week",
        href: "/team?month=2099-03&day=2099-03-02",
      },
    ])

    // Saved again with Carla added: only Carla hears, and about the next Monday in Tokyo.
    await updateMeeting(
      actor(anna),
      id,
      meeting({ startTime: "23:30", endTime: "23:59", peopleIds: [anna.id, ben.id, carla.id] }),
      database,
      at("2099-03-03T12:00:00Z")
    )
    expect(await invitesFor(ben.id)).toHaveLength(1)
    expect(await invitesFor(carla.id)).toEqual([
      {
        message: "Anna invited you to a meeting",
        detail: "Weekly planning · Tue, Mar 10, 8:30 AM, every week",
        href: "/team?month=2099-03&day=2099-03-10",
      },
    ])
  })

  it("refuses a link that isn't https and a meeting that ends before it starts", async () => {
    expect(meetingSchema.safeParse({ ...meeting(), videoUrl: "javascript:alert(1)" }).success).toBe(false)
    expect(meetingSchema.safeParse({ ...meeting(), videoUrl: "http://zoom.us/j/1" }).success).toBe(false)
    expect(meetingSchema.safeParse({ ...meeting(), endTime: "09:00" }).success).toBe(false)
    expect(meetingSchema.parse({ ...meeting(), videoUrl: "" }).videoUrl).toBeNull()
  })

  it("caps how often one person can save meetings, so nobody can flood the bell", async () => {
    // The hour's allowance used up, as 60 saves would.
    for (let i = 0; i < MEETING_SAVES.maxAttempts; i++) {
      await enforceRateLimit(`project-meeting-save:${ben.id}`, MEETING_SAVES, database)
    }
    await expect(createMeeting(actor(ben), meeting({ peopleIds: [carla.id] }), database)).rejects.toThrow(
      PROJECT_ERRORS.tooManyMeetingSaves
    )
    // Nothing was made and nobody was told; Carla's own allowance is untouched.
    expect(await invitesFor(carla.id)).toEqual([])
    await createMeeting(actor(carla), meeting(), database)
  })
})

describe("the team figures", () => {
  async function projectWithTasks() {
    const project = await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)
    await addProjectMember(admin.id, project.id, ben.id, database)
    const ids: string[] = []
    for (const [title, dueDate] of [
      ["Brief", null],
      ["Logo", null],
      ["Copy", null],
    ] as const) {
      const task = await createTask(
        actor(ben),
        { projectId: project.id, title, notes: "", assigneeUserId: ben.id, dueDate, steps: [] },
        database
      )
      ids.push(task.id)
    }
    return ids
  }

  it("counts members, pending invites, and open tasks only in projects the viewer can see", async () => {
    const ids = await projectWithTasks()
    // An invite puts Dan on the team at once; he is pending until he sets a password.
    await createInvite(actor(admin), { email: "dan@example.test" }, database)
    // Ben's "Just me" task never counts.
    await createTask(
      actor(ben),
      { projectId: "personal", title: "Dentist", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    await deleteTask(actor(ben), ids[2], database)

    const ben_ = await loadTeamFigures(ben.id, database)
    // Anna, Ben, Carla and Dan; the site admin is on no team, so isn't counted.
    expect(ben_).toMatchObject({ members: 4, pendingInvites: 1, openTasks: 2 })
    // Carla isn't on the project.
    expect((await loadTeamFigures(carla.id, database)).openTasks).toBe(0)
    // The site admin sees every shared project without being on it.
    expect((await loadTeamFigures(admin.id, database)).openTasks).toBe(2)
  })

  it("counts tasks due this week, Monday to Sunday", async () => {
    const ids = await projectWithTasks()
    const wednesday = at(`${MONDAY}T12:00:00Z`)
    await database.update(projectTasks).set({ dueDate: "2099-03-08" }).where(eq(projectTasks.id, ids[0]))
    await database.update(projectTasks).set({ dueDate: "2099-03-09" }).where(eq(projectTasks.id, ids[1]))
    expect((await loadTeamFigures(ben.id, database, wednesday)).dueThisWeek).toBe(1)
  })

  it("counts a task Done this week, and stops when it leaves Done", async () => {
    const ids = await projectWithTasks()
    const done = { taskId: ids[0], status: "done" as const, stuckReason: null }
    await setTaskStatus(actor(ben), done, database)
    expect((await loadTeamFigures(ben.id, database)).completedThisWeek).toBe(1)
    expect((await loadTeamFigures(ben.id, database)).openTasks).toBe(2)

    await setTaskStatus(actor(ben), { ...done, status: "doing" }, database)
    const [row] = await database.select().from(projectTasks).where(eq(projectTasks.id, ids[0]))
    expect(row.completedAt).toBeNull()
    expect((await loadTeamFigures(ben.id, database)).completedThisWeek).toBe(0)

    // Finished before this Monday: not this week.
    await setTaskStatus(actor(ben), done, database)
    await database
      .update(projectTasks)
      .set({ completedAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(projectTasks.id, ids[0]))
    expect((await loadTeamFigures(ben.id, database)).completedThisWeek).toBe(0)
  })

  it("counts check-ins over the 7 days before today, late ones included", async () => {
    // Monday: Anna on time, Ben late, Carla missed. Tuesday: everyone on time.
    await submitCheckin(anna.id, { answers: [], picks: [] }, database, at(`${MONDAY}T08:55:00Z`))
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T11:00:00Z`))
    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    for (const person of [anna, ben, carla]) {
      await submitCheckin(person.id, { answers: [], picks: [] }, database, at(`${TUESDAY}T08:55:00Z`))
    }
    await saveFinishedDays(database, at("2099-03-04T00:00:30Z"))

    const figures = await loadTeamFigures(anna.id, database, at("2099-03-04T10:00:00Z"))
    expect(figures.checkins).toEqual({ checkedIn: 5, expected: 6 })
    // The same as the calendar's squares for those days.
    const month = await loadTeamMonth(anna.id, "2099-03", database, at("2099-03-04T10:00:00Z"))
    const past = month.days.filter((d) => d.day < "2099-03-04")
    expect(past.reduce((sum, d) => sum + d.checkedIn, 0)).toBe(5)
    expect(past.reduce((sum, d) => sum + d.expected, 0)).toBe(6)
  })
})

describe("check-in notes", () => {
  it("shows the notes to everyone on the team, and a Blocker note marks the person blocked", async () => {
    const project = await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)
    await addProjectMember(admin.id, project.id, ben.id, database)
    const task = await createTask(
      actor(ben),
      { projectId: project.id, title: "Members table", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    const morning = at(`${MONDAY}T09:10:00Z`)
    await submitCheckin(
      ben.id,
      {
        answers: [],
        picks: [task.id],
        notes: { yesterday: "Still blocked on email provider", today: "Work on members table", blocker: "SendGrid key still pending" },
      },
      database,
      morning
    )

    // Carla isn't on the project: she reads Ben's notes, never the task's title.
    const carlaView = await loadTeamDay(carla.id, undefined, database, morning)
    const benRow = carlaView.people[0]
    expect(benRow).toMatchObject({
      person: { name: "Ben" },
      blocked: true,
      notes: {
        yesterday: "Still blocked on email provider",
        today: "Work on members table",
        blocker: "SendGrid key still pending",
      },
      picked: [{ taskId: null, title: null }],
      blockers: [],
    })
    expect(carlaView.blocked).toBe(1)
    const month = await loadTeamMonth(carla.id, undefined, database, morning)
    expect(month.days).toEqual([{ day: MONDAY, checkedIn: 1, expected: 3, blocked: 1 }])
  })

  it("change during the day, and a past day keeps what it said", async () => {
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    expect((await loadCheckinPage(ben.id, database, at(`${MONDAY}T09:01:00Z`))).notes).toEqual({
      yesterday: null,
      today: null,
      blocker: null,
    })
    await saveCheckinNotes(
      ben.id,
      { yesterday: null, today: "Homepage copy", blocker: null },
      database,
      at(`${MONDAY}T11:00:00Z`)
    )
    expect((await loadCheckinPage(ben.id, database, at(`${MONDAY}T11:01:00Z`))).notes.today).toBe("Homepage copy")

    // On Tuesday, before checking in, there is no day to change.
    await saveFinishedDays(database, at(`${TUESDAY}T00:00:30Z`))
    await expect(
      saveCheckinNotes(ben.id, { yesterday: null, today: "Changed", blocker: null }, database, at(`${TUESDAY}T08:00:00Z`))
    ).rejects.toThrow(PROJECT_ERRORS.notCheckedIn)
    const monday = await loadTeamDay(anna.id, MONDAY, database, at(`${TUESDAY}T10:00:00Z`))
    expect(monday.people.find((p) => p.person.id === ben.id)?.notes?.today).toBe("Homepage copy")
  })

  it("has no notes for someone who didn't check in", async () => {
    const view = await loadTeamDay(anna.id, undefined, database, at(`${MONDAY}T10:00:00Z`))
    expect(view.people.every((p) => p.notes === null && !p.blocked)).toBe(true)
  })
})

describe("the team photo", () => {
  it("is changed by the site admin only, and only to their own upload", async () => {
    for (const person of [anna, ben]) {
      await expect(setTeamPhoto(person.id, "", database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    }
    await expect(setTeamPhoto(admin.id, "https://example.com/cat.png", database)).rejects.toThrow(
      PROJECT_ERRORS.photoNotYours
    )
    await setTeamPhoto(admin.id, "", database)
    expect((await loadTeamDashboard(admin.id, database))?.team.photoUrl).toBeNull()
  })
})
