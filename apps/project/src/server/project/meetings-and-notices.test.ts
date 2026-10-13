import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { noteLines } from "@/lib/project/meeting-notes"
import { readTaskNotes } from "@/lib/project/notes"
import { taskHref } from "@/lib/project/notices"
import { meetingNotesSchema } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { acceptInvite, createInvite } from "@/server/project/invites"
import {
  answerMeeting,
  createMeeting,
  linkMeetingNoteLine,
  loadMeetingNotes,
  loadTeamMeetings,
  saveMeetingNotes,
  updateMeeting,
  type MeetingInput,
} from "@/server/project/meetings"
import { loadMyDashboard } from "@/server/project/my-dashboard"
import { loadNoticesOff, setNoticeSwitch } from "@/server/project/notice-switches"
import { addProjectMember, createProject } from "@/server/project/projects"
import { projectNoticeLinks } from "@/server/project/schema"
import { sendMessage } from "@/server/project/task-chat"
import { createTask, setTaskStatus } from "@/server/project/tasks"
import { createTeam } from "@/server/project/teams"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * Dates are in 2099 so nothing here meets the real today. 2 March 2099 is a
 * Monday. Anna owns the team; Ben and Carla are members; Olga runs another.
 */
const MONDAY = "2099-03-02"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let olga: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  olga = await insertUser(database, { name: "Olga", email: "olga@example.test" })
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  for (const person of [ben, carla]) {
    const sent = await createInvite(anna, { email: person.email, role: "member" }, database)
    await acceptInvite(person, sent.inviteId, database)
  }
  await createTeam(olga.id, { name: "Other", timeZone: "UTC" }, database)
})

afterEach(async () => {
  await client.close()
})

function meeting(overrides: Partial<MeetingInput> = {}): MeetingInput {
  return {
    title: "Weekly client call",
    color: "blue",
    day: MONDAY,
    startTime: "10:00",
    endTime: "10:45",
    repeatEvery: "week",
    videoUrl: null,
    peopleIds: [anna.id, ben.id, carla.id],
    ...overrides,
  }
}

async function answersOf(viewer: CustomShellUser) {
  const view = await loadTeamMeetings(viewer.id, { month: "2099-03" }, database)
  return Object.fromEntries(view.meetings[0].people.map((person) => [person.name, person.answer]))
}

async function noticesFor(userId: string) {
  const rows = await database
    .select({ kind: projectNoticeLinks.kind })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
  return rows.map((row) => row.kind)
}

/** The editor's document for lines of plain text, as the window sends it. */
function doc(...lines: string[]) {
  return meetingNotesSchema.shape.notes.parse({
    type: "doc",
    content: lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  })
}

describe("meeting answers", () => {
  it("lets each invited person answer once for every repeat, and tells nobody", async () => {
    const { id } = await createMeeting(anna, meeting(), database)
    await database.delete(customShellNotifications)

    await answerMeeting(ben.id, { meetingId: id, answer: "going" }, database)
    await answerMeeting(carla.id, { meetingId: id, answer: "not_going" }, database)
    expect(await answersOf(anna)).toEqual({ Anna: null, Ben: "going", Carla: "not_going" })

    // Changing an answer replaces it.
    await answerMeeting(carla.id, { meetingId: id, answer: "going" }, database)
    expect((await answersOf(ben)).Carla).toBe("going")

    // Every repeat in the month carries the one answer: it's the meeting's, not a date's.
    const view = await loadTeamMeetings(anna.id, { month: "2099-03" }, database)
    expect(view.occurrences.filter((o) => o.meetingId === id).length).toBeGreaterThan(1)
    expect(await noticesFor(anna.id)).toEqual([])
  })

  it("refuses someone not invited, and anyone on another team", async () => {
    const { id } = await createMeeting(anna, meeting({ peopleIds: [anna.id] }), database)
    await expect(answerMeeting(ben.id, { meetingId: id, answer: "going" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notInvitedToMeeting
    )
    await expect(answerMeeting(olga.id, { meetingId: id, answer: "going" }, database)).rejects.toThrow(
      PROJECT_ERRORS.meetingNotFound
    )
  })

  it("takes the answer away from someone removed from the meeting", async () => {
    const { id } = await createMeeting(anna, meeting(), database)
    await answerMeeting(ben.id, { meetingId: id, answer: "going" }, database)
    await answerMeeting(carla.id, { meetingId: id, answer: "going" }, database)

    await updateMeeting(anna, id, meeting({ peopleIds: [anna.id, carla.id] }), database)
    // Added back, Ben starts with no answer.
    await updateMeeting(anna, id, meeting(), database)
    expect(await answersOf(anna)).toEqual({ Anna: null, Ben: null, Carla: "going" })

    // Removing everyone removes every answer.
    await updateMeeting(anna, id, meeting({ peopleIds: [] }), database)
    await updateMeeting(anna, id, meeting(), database)
    expect(await answersOf(anna)).toEqual({ Anna: null, Ben: null, Carla: null })
  })
})

describe("meeting notes", () => {
  it("keeps notes per date, readable by the team and written only by those who may change the meeting", async () => {
    const { id } = await createMeeting(ben, meeting(), database)
    await saveMeetingNotes(ben, { meetingId: id, day: MONDAY, notes: doc("Prices go up in May") }, database)

    const carlaReads = await loadMeetingNotes(carla.id, { meetingId: id, day: MONDAY }, database)
    expect(carlaReads).toMatchObject({ canEdit: false, updatedBy: "Ben" })
    expect(carlaReads.notes).toContain("Prices go up in May")
    // The next Monday has notes of its own.
    expect((await loadMeetingNotes(carla.id, { meetingId: id, day: "2099-03-09" }, database)).notes).toBe("")

    await expect(
      saveMeetingNotes(carla, { meetingId: id, day: MONDAY, notes: doc("Mine") }, database)
    ).rejects.toThrow(PROJECT_ERRORS.cantChangeMeetingNotes)
    // The owner may.
    await saveMeetingNotes(anna, { meetingId: id, day: MONDAY, notes: doc("Owner's notes") }, database)
    expect((await loadMeetingNotes(ben.id, { meetingId: id, day: MONDAY }, database)).updatedBy).toBe("Anna")

    // Clearing the notes deletes them.
    await saveMeetingNotes(anna, { meetingId: id, day: MONDAY, notes: "" }, database)
    expect(await loadMeetingNotes(ben.id, { meetingId: id, day: MONDAY }, database)).toMatchObject({
      notes: "",
      updatedAt: null,
    })
  })

  it("refuses a day the meeting doesn't fall on, and anyone on another team", async () => {
    const { id } = await createMeeting(ben, meeting(), database)
    await expect(
      saveMeetingNotes(ben, { meetingId: id, day: "2099-03-03", notes: doc("Tuesday?") }, database)
    ).rejects.toThrow(PROJECT_ERRORS.meetingNotOnDay)
    await expect(loadMeetingNotes(olga.id, { meetingId: id, day: MONDAY }, database)).rejects.toThrow(
      PROJECT_ERRORS.meetingNotFound
    )
  })

  it("links a line to the task made from it, keeping the line's words", async () => {
    const { id } = await createMeeting(anna, meeting(), database)
    await saveMeetingNotes(
      anna,
      { meetingId: id, day: MONDAY, notes: doc("Talked about the launch", "Send the new price list") },
      database
    )
    const { id: projectId } = await createProject(anna.id, { name: "Sales", color: "green", description: "" }, database)
    await addProjectMember(anna.id, projectId, ben.id, database)
    const { id: taskId } = await createTask(
      anna,
      { projectId, title: "Send the new price list", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )

    const line = { meetingId: id, day: MONDAY, path: [1], text: "Send the new price list", taskId }
    await linkMeetingNoteLine(anna, line, database)

    const annaReads = await loadMeetingNotes(anna.id, { meetingId: id, day: MONDAY }, database)
    const notes = readTaskNotes(annaReads.notes)
    if (notes.kind !== "doc") throw new Error("The notes should be a document.")
    expect(noteLines(notes.body).map((l) => [l.text, l.taskId])).toEqual([
      ["Talked about the launch", null],
      ["Send the new price list", taskId],
    ])
    expect(annaReads.notes).toContain(taskHref(projectId, taskId))
    expect(annaReads.links).toEqual({ [taskId]: projectId })
    // Carla isn't on the project: she reads the words, without a way into the task.
    expect((await loadMeetingNotes(carla.id, { meetingId: id, day: MONDAY }, database)).links).toEqual({})
  })

  it("never links a line that changed meanwhile", async () => {
    const { id } = await createMeeting(anna, meeting(), database)
    await saveMeetingNotes(anna, { meetingId: id, day: MONDAY, notes: doc("Send the new price list") }, database)
    const { id: projectId } = await createProject(anna.id, { name: "Sales", color: "green", description: "" }, database)
    const { id: taskId } = await createTask(
      anna,
      { projectId, title: "Send prices", notes: "", assigneeUserId: null, dueDate: null, steps: [] },
      database
    )
    await saveMeetingNotes(anna, { meetingId: id, day: MONDAY, notes: doc("Send the old price list") }, database)

    await expect(
      linkMeetingNoteLine(
        anna,
        { meetingId: id, day: MONDAY, path: [0], text: "Send the new price list", taskId },
        database
      )
    ).rejects.toThrow(PROJECT_ERRORS.meetingNotesChanged)
    // Nor a line past the end.
    await expect(
      linkMeetingNoteLine(anna, { meetingId: id, day: MONDAY, path: [4], text: "Anything", taskId }, database)
    ).rejects.toThrow(PROJECT_ERRORS.meetingNotesChanged)
  })
})

describe("choosing my bell notices", () => {
  async function project() {
    const { id: projectId } = await createProject(anna.id, { name: "Site", color: "blue", description: "" }, database)
    await addProjectMember(anna.id, projectId, ben.id, database)
    await addProjectMember(anna.id, projectId, carla.id, database)
    return projectId
  }

  it("never sends a switched-off kind to that person, and everyone else still gets it", async () => {
    const projectId = await project()
    await setNoticeSwitch(ben.id, { id: "task_assigned", on: false }, database)
    expect(await loadNoticesOff(ben.id, database)).toEqual(["task_assigned"])

    for (const person of [ben, carla]) {
      await createTask(
        anna,
        { projectId, title: `For ${person.name}`, notes: "", assigneeUserId: person.id, dueDate: null, steps: [] },
        database
      )
    }
    expect(await noticesFor(ben.id)).toEqual([])
    expect(await noticesFor(carla.id)).toEqual(["task_assigned"])

    // Switched back on, it arrives again.
    await setNoticeSwitch(ben.id, { id: "task_assigned", on: true }, database)
    await createTask(
      anna,
      { projectId, title: "Another", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    expect(await noticesFor(ben.id)).toEqual(["task_assigned"])
    expect(await loadNoticesOff(ben.id, database)).toEqual([])
  })

  it("keeps tags on, whatever else is switched off", async () => {
    const projectId = await project()
    const { id: taskId } = await createTask(
      anna,
      { projectId, title: "Set up redirects", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    await database.delete(customShellNotifications)
    await setNoticeSwitch(ben.id, { id: "task_comment", on: false }, database)
    await setNoticeSwitch(carla.id, { id: "task_comment", on: false }, database)

    await sendMessage(anna, { chat: { taskId }, body: "Any news?", replyToId: null }, database)
    expect(await noticesFor(ben.id)).toEqual([])
    await sendMessage(anna, { chat: { taskId }, body: `@[Carla](${carla.id}) can you help?`, replyToId: null }, database)
    expect(await noticesFor(carla.id)).toEqual(["task_mention"])
  })

  it("switches app notices off too, such as meeting invites, and Done for followers", async () => {
    const projectId = await project()
    await setNoticeSwitch(carla.id, { id: "meeting_invite", on: false }, database)
    await createMeeting(anna, meeting(), database)
    expect(await noticesFor(carla.id)).toEqual([])
    expect(await noticesFor(ben.id)).toEqual(["meeting_invite"])

    // Done goes to whoever handed the task out, here Anna: once with it on, never with it off.
    const done = async (title: string) => {
      const { id: taskId } = await createTask(
        anna,
        { projectId, title, notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
        database
      )
      await setTaskStatus(ben, { taskId, status: "done", stuckReason: null }, database)
    }
    await done("Write the About page")
    await setNoticeSwitch(anna.id, { id: "task_done", on: false }, database)
    await done("Write the FAQ")
    expect((await noticesFor(anna.id)).filter((kind) => kind === "task_done")).toHaveLength(1)
  })

  it("shows my switches on My dashboard, to me alone, and refuses someone with no team", async () => {
    await setNoticeSwitch(ben.id, { id: "overdue", on: false }, database)
    await setNoticeSwitch(ben.id, { id: "overdue", on: false }, database)
    expect((await loadMyDashboard(ben.id, database)).noticesOff).toEqual(["overdue"])
    expect((await loadMyDashboard(carla.id, database)).noticesOff).toEqual([])

    const loner = await insertUser(database, { name: "Lone", email: "lone@example.test" })
    await expect(setNoticeSwitch(loner.id, { id: "overdue", on: false }, database)).rejects.toThrow(
      PROJECT_ERRORS.noTeam
    )
  })
})
