import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import { PROJECT_TAG, messageText, taggedUserIds, tokenizeMessage } from "@/lib/project/mentions"
import type { CustomShellDb } from "@/server/db"
import { requireMembership } from "@/server/project/access"
import {
  hideAnnouncement,
  loadAnnouncement,
  markAnnouncementSeen,
  postAnnouncement,
} from "@/server/project/announcements"
import { checkOut, loadCheckinPage, submitCheckin } from "@/server/project/checkins"
import { acceptInvite, createInvite } from "@/server/project/invites"
import { loadMyDashboard } from "@/server/project/my-dashboard"
import {
  addProjectMember,
  createProject,
  loadProjectPage,
  removeProjectMember,
  setProjectArchived,
} from "@/server/project/projects"
import {
  projectNoticeLinks,
  projectPollVotes,
  projectProjectMembers,
  projectTeamMembers,
} from "@/server/project/schema"
import {
  deleteComment,
  editComment,
  loadProjectChat,
  sendMessage,
  voteOnPoll,
} from "@/server/project/task-chat"
import { changeManyTasks, duplicateTask } from "@/server/project/task-changes"
import { createTask, deleteTask, loadTaskDetail, setTaskStatus, updateTask } from "@/server/project/tasks"
import { loadTeamMonth } from "@/server/project/team-days"
import { setCalendarDueDates } from "@/server/project/team-due-dates"
import { addTaskFile, listProjectFiles, type FileStorage } from "@/server/project/task-files"
import { loadTeammate } from "@/server/project/teammate"
import { addTimeOff } from "@/server/project/time-off"
import { createTeam } from "@/server/project/teams"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * Features 12 Oct task 01. Anna owns the team; Ben, Leo and Carla are
 * members. "Site" has Anna, Ben and Leo on it, not Carla. Anna hands Ben a
 * task in Site. Everyone joined an hour ago, so a message sent now is after
 * it, whatever the clock's resolution.
 */

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let leo: CustomShellUser
let carla: CustomShellUser
let projectId: string
let taskId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  leo = await insertUser(database, { name: "Leo Park", email: "leo@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  for (const person of [ben, leo, carla]) {
    const sent = await createInvite(anna, { email: person.email, role: "member" }, database)
    await acceptInvite(person, sent.inviteId, database)
  }
  projectId = (await createProject(anna.id, { name: "Site", color: "blue", description: "" }, database)).id
  await addProjectMember(anna.id, projectId, ben.id, database)
  await addProjectMember(anna.id, projectId, leo.id, database)
  taskId = (
    await createTask(
      anna,
      { projectId, title: "Fix the checkout bug", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
  ).id
  const anHourAgo = new Date(Date.now() - 3_600_000)
  await database.update(projectTeamMembers).set({ joinedAt: anHourAgo })
  await database.update(projectProjectMembers).set({ addedAt: anHourAgo })
  await database.delete(customShellNotifications)
})

afterEach(async () => {
  await client.close()
})

const say = (who: CustomShellUser, body: string) =>
  sendMessage(who, { chat: { taskId }, body, replyToId: null }, database)
const sayInProject = (who: CustomShellUser, body: string) =>
  sendMessage(who, { chat: { projectId }, body, replyToId: null }, database)

async function unreadOn(viewer: CustomShellUser) {
  const page = await loadProjectPage(viewer.id, projectId, database)
  return page.tasks.find((task) => task.id === taskId)?.unread
}

describe("unread marks", () => {
  it("counts other people's messages until the task is opened", async () => {
    await say(ben, "Started on it")
    await say(ben, "Found the cause")
    await say(anna, "Thanks")
    expect(await unreadOn(anna)).toBe(2)
    expect(await unreadOn(ben)).toBe(1)
    expect(await unreadOn(leo)).toBe(3)

    await loadTaskDetail(anna.id, taskId, database)
    expect(await unreadOn(anna)).toBe(0)
    await say(leo, "One more thing")
    expect(await unreadOn(anna)).toBe(1)
  })

  it("leaves out deleted messages", async () => {
    const { id } = await say(ben, "Oops, wrong task")
    expect(await unreadOn(anna)).toBe(1)
    await deleteComment(ben, { commentId: id, keepFiles: false }, database)
    expect(await unreadOn(anna)).toBe(0)
  })

  it("starts someone added later with nothing new", async () => {
    await say(ben, "Before Carla came")
    await addProjectMember(anna.id, projectId, carla.id, database)
    expect(await unreadOn(carla)).toBe(0)
    await say(ben, "Welcome, Carla")
    expect(await unreadOn(carla)).toBe(1)
  })

  it("shows on My tasks too", async () => {
    await say(anna, "Any news?")
    const mine = (await loadMyDashboard(ben.id, database)).tasks.find((task) => task.id === taskId)
    expect(mine?.unread).toBe(1)
  })

  it("counts a project's own chat until it is loaded", async () => {
    await sayInProject(ben, "Standup moved to 10")
    await sayInProject(leo, "Fine by me")
    expect((await loadProjectPage(anna.id, projectId, database)).chatUnread).toBe(2)
    expect((await loadProjectPage(ben.id, projectId, database)).chatUnread).toBe(1)
    await loadProjectChat(anna.id, { projectId }, database)
    expect((await loadProjectPage(anna.id, projectId, database)).chatUnread).toBe(0)
  })
})


describe("@project", () => {
  const PROJECT = "@[project](project)"
  const kindsFor = async (person: CustomShellUser) =>
    (
      await database
        .select({ kind: projectNoticeLinks.kind })
        .from(customShellNotifications)
        .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
        .where(eq(customShellNotifications.recipientUserId, person.id))
    ).map((row) => row.kind)

  it("tells everyone on the project once, never the writer or someone off it", async () => {
    await say(leo, `${PROJECT} the release is moving, and @[Ben](${ben.id}) please check`)
    expect(await kindsFor(anna)).toEqual(["task_mention"])
    expect(await kindsFor(ben)).toEqual(["task_mention"])
    expect(await kindsFor(leo)).toEqual([])
    expect(await kindsFor(carla)).toEqual([])
  })

  it("works in a project's own chat", async () => {
    await sayInProject(anna, `${PROJECT} lunch is on me`)
    expect(await kindsFor(ben)).toEqual(["chat_mention"])
    expect(await kindsFor(leo)).toEqual(["chat_mention"])
    expect(await kindsFor(anna)).toEqual([])
  })

  it("an edit adding it tells only those not told before", async () => {
    const { id } = await say(anna, `@[Ben](${ben.id}) can you look?`)
    await database.delete(customShellNotifications)
    await editComment(anna, { commentId: id, body: `@[Ben](${ben.id}) ${PROJECT} can you look?` }, database)
    expect(await kindsFor(ben)).toEqual([])
    expect(await kindsFor(leo)).toEqual(["task_mention"])
  })

  it("draws as @project and reads back as words", () => {
    expect(messageText(`${PROJECT} hello`)).toBe("@project hello")
    expect(tokenizeMessage("@project hello", [PROJECT_TAG], [])).toBe(`${PROJECT} hello`)
    expect(taggedUserIds(`${PROJECT} hi`)).toEqual([])
  })
})

describe("polls", () => {
  const ask = () =>
    sendMessage(
      anna,
      { chat: { projectId }, body: "Launch Tuesday or Thursday?", replyToId: null, poll: ["Tuesday", "Thursday"] },
      database
    )
  const pollAs = async (viewer: CustomShellUser) =>
    (await loadProjectChat(viewer.id, { projectId }, database)).messages.at(-1)?.poll

  it("counts one vote per person, by name, and lets it move or go", async () => {
    const { id } = await ask()
    await voteOnPoll(ben, { commentId: id, choice: 0 }, database)
    await voteOnPoll(leo, { commentId: id, choice: 1 }, database)
    await voteOnPoll(ben, { commentId: id, choice: 1 }, database)
    let poll = await pollAs(ben)
    expect(poll?.voters).toBe(2)
    expect(poll?.choices.map((choice) => choice.people)).toEqual([[], ["Leo Park", "Ben"]])
    expect(poll?.choices[1].mine).toBe(true)

    await voteOnPoll(ben, { commentId: id, choice: null }, database)
    poll = await pollAs(ben)
    expect(poll?.voters).toBe(1)
    expect(poll?.choices[1].mine).toBe(false)
  })

  it("refuses a choice that isn't there, a plain message, a task's chat and someone off the project", async () => {
    const { id } = await ask()
    await expect(voteOnPoll(ben, { commentId: id, choice: 2 }, database)).rejects.toThrow(
      PROJECT_ERRORS.pollChoiceGone
    )
    const plain = await sayInProject(ben, "Hello")
    await expect(voteOnPoll(ben, { commentId: plain.id, choice: 0 }, database)).rejects.toThrow(
      PROJECT_ERRORS.notAPoll
    )
    await expect(
      sendMessage(anna, { chat: { taskId }, body: "Which?", replyToId: null, poll: ["A", "B"] }, database)
    ).rejects.toThrow(PROJECT_ERRORS.pollInTask)
    await expect(voteOnPoll(carla, { commentId: id, choice: 0 }, database)).rejects.toThrow()
  })

  it("drops its votes when deleted", async () => {
    const { id } = await ask()
    await voteOnPoll(ben, { commentId: id, choice: 0 }, database)
    await deleteComment(anna, { commentId: id, keepFiles: false }, database)
    expect(await pollAs(anna)).toBeNull()
    expect(await database.select().from(projectPollVotes)).toEqual([])
  })

  it("keeps the vote of someone who leaves the project", async () => {
    const { id } = await ask()
    await voteOnPoll(leo, { commentId: id, choice: 0 }, database)
    await removeProjectMember(anna.id, projectId, leo.id, database)
    expect((await pollAs(anna))?.choices[0].people).toEqual(["Leo Park"])
    await expect(voteOnPoll(leo, { commentId: id, choice: 1 }, database)).rejects.toThrow()
  })
})

describe("who has seen the announcement", () => {
  const readers = async (viewer: CustomShellUser) => {
    const membership = await requireMembership(viewer.id, database)
    const shown = await loadAnnouncement(membership, database)
    return shown?.readers
      ? { seen: shown.readers.seen.map((p) => p.name), notYet: shown.readers.notYet.map((p) => p.name) }
      : null
  }
  const currentId = async () => {
    const membership = await requireMembership(anna.id, database)
    return (await loadAnnouncement(membership, database))!.id
  }

  it("counts the poster, each viewer once, and hiding it", async () => {
    await postAnnouncement(anna, "Office closed Friday", database)
    const id = await currentId()
    expect(await readers(anna)).toEqual({ seen: ["Anna"], notYet: ["Ben", "Carla", "Leo Park"] })
    await markAnnouncementSeen(ben.id, id, database)
    await markAnnouncementSeen(ben.id, id, database)
    await hideAnnouncement(carla.id, id, database)
    expect(await readers(anna)).toEqual({ seen: ["Anna", "Ben", "Carla"], notYet: ["Leo Park"] })
  })

  it("shows the names to the owner and admins only", async () => {
    await postAnnouncement(anna, "Office closed Friday", database)
    expect(await readers(ben)).toBeNull()
  })

  it("starts again at nobody for a new announcement, and ignores an old id", async () => {
    await postAnnouncement(anna, "Office closed Friday", database)
    const first = await currentId()
    await markAnnouncementSeen(ben.id, first, database)
    await postAnnouncement(anna, "Office open after all", database)
    await markAnnouncementSeen(leo.id, first, database)
    expect(await readers(anna)).toEqual({ seen: ["Anna"], notYet: ["Ben", "Carla", "Leo Park"] })
  })
})

describe("due dates on the Team calendar", () => {
  const dueTitles = async (viewer: CustomShellUser) => {
    const month = await loadTeamMonth(viewer.id, "2099-03", database)
    return { on: month.dueDates.on, titles: month.dueDates.tasks.map((task) => task.title) }
  }
  const make = async (who: CustomShellUser, inProject: string, title: string, dueDate: string) =>
    (
      await createTask(
        who,
        { projectId: inProject, title, notes: "", assigneeUserId: null, dueDate, steps: [] },
        database
      )
    ).id

  it("is off until I switch it on, and stays my own", async () => {
    await make(anna, projectId, "Send the invoice", "2099-03-10")
    expect(await dueTitles(ben)).toEqual({ on: false, titles: [] })
    await setCalendarDueDates(ben.id, true, database)
    expect(await dueTitles(ben)).toEqual({ on: true, titles: ["Send the invoice"] })
    expect((await dueTitles(leo)).on).toBe(false)
  })

  it("leaves out Done, binned, archived, unseen and Just me tasks", async () => {
    await make(anna, projectId, "Still to do", "2099-03-10")
    const done = await make(anna, projectId, "Already done", "2099-03-11")
    await setTaskStatus(anna, { taskId: done, status: "done", stuckReason: null }, database)
    const binned = await make(anna, projectId, "Binned", "2099-03-12")
    await deleteTask(anna, binned, database)
    const secret = (await createProject(anna.id, { name: "Secret", color: "red", description: "" }, database)).id
    await make(anna, secret, "Secret plan", "2099-03-13")
    const old = (await createProject(anna.id, { name: "Old", color: "red", description: "" }, database)).id
    await addProjectMember(anna.id, old, ben.id, database)
    await make(anna, old, "Old work", "2099-03-14")
    await setProjectArchived(anna.id, old, true, database)
    await make(ben, PERSONAL_PROJECT_ID, "Ben's own errand", "2099-03-15")
    await setCalendarDueDates(ben.id, true, database)
    expect((await dueTitles(ben)).titles).toEqual(["Still to do"])
    await setCalendarDueDates(anna.id, true, database)
    expect((await dueTitles(anna)).titles).toEqual(["Still to do", "Secret plan"])
  })
})

describe("a teammate's page", () => {
  it("lists their open shared tasks I can see, soonest due first, and their time off", async () => {
    const make = (title: string, inProject: string, dueDate: string | null) =>
      createTask(anna, { projectId: inProject, title, notes: "", assigneeUserId: ben.id, dueDate, steps: [] }, database)
    await make("Later work", projectId, "2099-05-01")
    await make("Soon work", projectId, "2099-04-01")
    const finished = await make("Finished work", projectId, null)
    await setTaskStatus(anna, { taskId: finished.id, status: "done", stuckReason: null }, database)
    const secret = (await createProject(anna.id, { name: "Secret", color: "red", description: "" }, database)).id
    await addProjectMember(anna.id, secret, ben.id, database)
    await make("Secret work", secret, null)
    await addTimeOff(ben.id, { firstDay: "2099-06-01", lastDay: "2099-06-03" }, database)

    const seenByLeo = await loadTeammate(leo.id, ben.id, database)
    expect(seenByLeo.openTasks.map((task) => task.title)).toEqual([
      "Soon work",
      "Later work",
      "Fix the checkout bug",
    ])
    expect(seenByLeo.timeOff.map((entry) => [entry.firstDay, entry.lastDay])).toEqual([["2099-06-01", "2099-06-03"]])
    const seenByAnna = await loadTeammate(anna.id, ben.id, database)
    expect(seenByAnna.openTasks.map((task) => task.title)).toContain("Secret work")
  })

  it("refuses someone on another team", async () => {
    const olga = await insertUser(database, { name: "Olga", email: "olga@example.test" })
    await createTeam(olga.id, { name: "Other", timeZone: "UTC" }, database)
    await expect(loadTeammate(anna.id, olga.id, database)).rejects.toThrow(PROJECT_ERRORS.personNotOnTeam)
  })
})

describe("plan tomorrow at check-out", () => {
  // 2 March 2099 is a Monday; the team works Monday to Friday, in UTC.
  const at = (when: string) => new Date(when)
  const mine = async (title: string) =>
    (
      await createTask(
        ben,
        { projectId, title, notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
        database
      )
    ).id

  it("starts the next check-in with the planned tasks still open, and the next work day after a weekend", async () => {
    const logo = await mine("Draw the logo")
    const copy = await mine("Write the copy")
    await submitCheckin(ben.id, { answers: [], picks: [taskId] }, database, at("2099-03-06T09:00:00Z"))
    await checkOut(
      ben,
      { doneTaskIds: [], noteLeft: null, tomorrowTaskIds: [logo, copy] },
      database,
      at("2099-03-06T17:00:00Z")
    )
    const saved = await loadCheckinPage(ben.id, database, at("2099-03-06T18:00:00Z"))
    expect(saved.checkout?.tomorrowTaskIds).toEqual([logo, copy])

    await setTaskStatus(anna, { taskId: copy, status: "done", stuckReason: null }, database)
    const monday = await loadCheckinPage(ben.id, database, at("2099-03-09T08:00:00Z"))
    expect(monday.planned).toEqual([logo])
  })

  it("leaves a check-in with no check-out as it was, and a ticked Done task out of the plan", async () => {
    const logo = await mine("Draw the logo")
    await submitCheckin(ben.id, { answers: [], picks: [logo] }, database, at("2099-03-02T09:00:00Z"))
    expect((await loadCheckinPage(ben.id, database, at("2099-03-03T08:00:00Z"))).planned).toEqual([])
    await checkOut(
      ben,
      { doneTaskIds: [logo], noteLeft: null, tomorrowTaskIds: [logo] },
      database,
      at("2099-03-02T17:00:00Z")
    )
    expect((await loadCheckinPage(ben.id, database, at("2099-03-02T18:00:00Z"))).checkout?.tomorrowTaskIds).toEqual([])
  })

  it("refuses to plan someone else's task", async () => {
    const annas = (
      await createTask(
        anna,
        { projectId, title: "Anna's own", notes: "", assigneeUserId: anna.id, dueDate: null, steps: [] },
        database
      )
    ).id
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at("2099-03-02T09:00:00Z"))
    await expect(
      checkOut(ben, { doneTaskIds: [], noteLeft: null, tomorrowTaskIds: [annas] }, database, at("2099-03-02T17:00:00Z"))
    ).rejects.toThrow(PROJECT_ERRORS.planNotYours)
  })
})

describe("the project's Files tab", () => {
  const storage: FileStorage = { put: async () => undefined, remove: async () => undefined }
  const png = (name: string) => ({ name, mimeType: "image/png", data: new Uint8Array(3).fill(1) })

  it("lists task and chat files newest first, leaving out the bin and deleted chat messages", async () => {
    await addTaskFile(anna, { taskId, ...png("brief.png") }, database, storage)
    await sendMessage(ben, { chat: { taskId }, body: "", replyToId: null, files: [png("fix.png")] }, database, storage)
    await sendMessage(
      ben,
      { chat: { projectId }, body: "Logo", replyToId: null, files: [png("logo.png")] },
      database,
      storage
    )
    const gone = await sendMessage(
      ben,
      { chat: { projectId }, body: "Oops", replyToId: null, files: [png("wrong.png")] },
      database,
      storage
    )
    await deleteComment(ben, { commentId: gone.id, keepFiles: true }, database, storage)
    const binnedTask = (
      await createTask(anna, { projectId, title: "Old", notes: "", assigneeUserId: null, dueDate: null, steps: [] }, database)
    ).id
    await addTaskFile(anna, { taskId: binnedTask, ...png("old.png") }, database, storage)
    await deleteTask(anna, binnedTask, database)

    const files = await listProjectFiles(leo.id, projectId, database)
    expect(files.map((file) => [file.name, file.task?.title ?? "chat"])).toEqual([
      ["logo.png", "chat"],
      ["fix.png", "Fix the checkout bug"],
      ["brief.png", "Fix the checkout bug"],
    ])
  })

  it("is closed to someone off the project", async () => {
    await expect(listProjectFiles(carla.id, projectId, database)).rejects.toThrow()
  })
})

describe("start dates", () => {
  const card = async () => (await loadTaskDetail(anna.id, taskId, database)).task

  it("saves a start day before the due day, and refuses one after it from either end", async () => {
    await updateTask(anna, { taskId, startDate: "2099-04-01", dueDate: "2099-04-05" }, database)
    expect(await card()).toMatchObject({ startDate: "2099-04-01", dueDate: "2099-04-05" })
    await expect(updateTask(anna, { taskId, startDate: "2099-04-06" }, database)).rejects.toThrow(
      PROJECT_ERRORS.startAfterDue
    )
    await expect(updateTask(anna, { taskId, dueDate: "2099-03-31" }, database)).rejects.toThrow(
      PROJECT_ERRORS.startAfterDue
    )
    // Moving both together, as a dragged bar does, is fine.
    await updateTask(anna, { taskId, startDate: "2099-04-08", dueDate: "2099-04-12" }, database)
    expect(await card()).toMatchObject({ startDate: "2099-04-08", dueDate: "2099-04-12" })
  })

  it("lets a task have a start day alone, and a copy keeps it", async () => {
    await updateTask(anna, { taskId, startDate: "2099-04-01" }, database)
    const { id } = await duplicateTask(anna, taskId, database)
    expect((await loadTaskDetail(anna.id, id, database)).task.startDate).toBe("2099-04-01")
  })

  it("refuses a bulk due date before a task's start, one task at a time", async () => {
    await updateTask(anna, { taskId, startDate: "2099-04-10" }, database)
    const other = (
      await createTask(anna, { projectId, title: "Other", notes: "", assigneeUserId: null, dueDate: null, steps: [] }, database)
    ).id
    const outcome = await changeManyTasks(anna, { taskIds: [taskId, other], change: { kind: "due", dueDate: "2099-04-01" } }, database)
    expect(outcome.changed).toEqual([other])
    expect(outcome.refused.map((entry) => entry.taskId)).toEqual([taskId])
  })
})
