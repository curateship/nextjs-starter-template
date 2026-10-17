import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import {
  hideAnnouncement,
  loadAnnouncement,
  postAnnouncement,
  takeDownAnnouncement,
} from "@/server/project/announcements"
import { findMembership } from "@/server/project/access"
import { addProjectMember, removeProjectMember } from "@/server/project/projects"
import { projectNoticeLinks, projectTaskNoteVersions } from "@/server/project/schema"
import {
  deleteComment,
  editComment,
  loadProjectChat,
  reactToMessage,
  sendMessage,
} from "@/server/project/task-chat"
import { loadTaskFileForDownload, type FileStorage } from "@/server/project/task-files"
import { listNoteVersions, restoreNoteVersion } from "@/server/project/task-note-versions"
import { createTask, deleteTask, loadTaskDetail, updateTask } from "@/server/project/tasks"
import { projectFor, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let leo: CustomShellUser
let carla: CustomShellUser
let admin: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  leo = await insertUser(database, { name: "Leo Park", email: "leo@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
})

afterEach(async () => {
  await client.close()
})

/**
 * Tyler, the site admin, runs the team. Anna, Ben, Leo and Carla are its
 * employees. "Site" has Anna, Ben and Leo on it, not Carla. "Secret" has only
 * Anna. Anna hands Ben a task in Site, and makes one in Secret.
 */
async function setUp() {
  admin = (await startTeam(database, [anna, ben, leo, carla])).admin
  const { id: projectId } = await projectFor(admin, anna.id, { name: "Site", color: "blue", description: "" }, database)
  // A project's members are the site admin's to change.
  await addProjectMember(admin.id, projectId, ben.id, database)
  await addProjectMember(admin.id, projectId, leo.id, database)
  const task = (title: string, inProject = projectId) =>
    createTask(
      anna,
      { projectId: inProject, title, notes: "", assigneeUserId: inProject === projectId ? ben.id : null, dueDate: null, steps: [] },
      database
    ).then((made) => made.id)
  const taskId = await task("Fix the checkout bug")
  const { id: secretId } = await projectFor(admin, anna.id, { name: "Secret", color: "red", description: "" }, database)
  const secretTaskId = await task("Plan the surprise party", secretId)
  await database.delete(customShellNotifications)
  return { projectId, taskId, secretId, secretTaskId, task }
}

async function noticesFor(userId: string) {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      kind: projectNoticeLinks.kind,
      href: projectNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

const tag = (person: CustomShellUser) => `@[${person.name}](${person.id})`
const link = (taskId: string, title = "x") => `#[${title}](${taskId})`
const say = (who: CustomShellUser, taskId: string, body: string, replyToId: string | null = null) =>
  sendMessage(who, { chat: { taskId }, body, replyToId }, database)
const messagesOf = async (viewer: CustomShellUser, taskId: string) =>
  (await loadTaskDetail(viewer.id, taskId, database)).comments

function memoryStorage() {
  const stored = new Map<string, Uint8Array>()
  const storage: FileStorage = {
    put: async (path, data) => {
      stored.set(path, data)
    },
    remove: async (path) => {
      stored.delete(path)
    },
  }
  return { stored, storage }
}
const file = (name: string, size = 3) => ({ name, mimeType: "image/png", data: new Uint8Array(size).fill(1) })

describe("reactions", () => {
  it("keeps one of each reaction per person, tells nobody, and takes one off when pressed again", async () => {
    const { taskId } = await setUp()
    const { id } = await say(ben, taskId, "Pushed the fix")
    await database.delete(customShellNotifications)

    await reactToMessage(anna, { commentId: id, reaction: "thumbs_up", on: true }, database)
    await reactToMessage(anna, { commentId: id, reaction: "thumbs_up", on: true }, database)
    await reactToMessage(leo, { commentId: id, reaction: "thumbs_up", on: true }, database)
    await reactToMessage(leo, { commentId: id, reaction: "eyes", on: true }, database)

    const [message] = await messagesOf(anna, taskId)
    expect(message.reactions).toEqual([
      { reaction: "thumbs_up", people: ["Anna", "Leo Park"], mine: true },
      { reaction: "eyes", people: ["Leo Park"], mine: false },
    ])
    expect(await noticesFor(ben.id)).toEqual([])

    await reactToMessage(anna, { commentId: id, reaction: "thumbs_up", on: false }, database)
    expect((await messagesOf(anna, taskId))[0].reactions[0]).toEqual({
      reaction: "thumbs_up",
      people: ["Leo Park"],
      mine: false,
    })
  })

  it("drops a deleted message's reactions and refuses new ones", async () => {
    const { taskId } = await setUp()
    const { id } = await say(ben, taskId, "Pushed the fix")
    await reactToMessage(anna, { commentId: id, reaction: "heart", on: true }, database)
    await deleteComment(ben, { commentId: id, keepFiles: true }, database)
    expect((await messagesOf(anna, taskId))[0].reactions).toEqual([])
    await expect(
      reactToMessage(anna, { commentId: id, reaction: "laugh", on: true }, database)
    ).rejects.toThrow(PROJECT_ERRORS.messageNotFound)
  })

  it("refuses someone who can't see the chat", async () => {
    const { taskId } = await setUp()
    const { id } = await say(ben, taskId, "Pushed the fix")
    await expect(
      reactToMessage(carla, { commentId: id, reaction: "tick", on: true }, database)
    ).rejects.toThrow(PROJECT_ERRORS.taskNotFound)
  })
})

describe("replies", () => {
  it("quotes the message replied to, and reads Message deleted once it is gone", async () => {
    const { taskId } = await setUp()
    const { id: question } = await say(leo, taskId, "Which browser fails?")
    await say(ben, taskId, "Safari only", question)
    expect((await messagesOf(anna, taskId))[1].replyTo).toEqual({
      id: question,
      authorName: "Leo Park",
      words: "Which browser fails?",
      deleted: false,
    })
    await deleteComment(leo, { commentId: question, keepFiles: true }, database)
    expect((await messagesOf(anna, taskId))[1].replyTo).toMatchObject({ id: question, words: "", deleted: true })
  })

  it("tells the person replied to with the usual comment notice, and only once", async () => {
    const { taskId } = await setUp()
    const { id: question } = await say(leo, taskId, "Which browser fails?")
    await database.delete(customShellNotifications)
    await say(ben, taskId, "Safari only", question)
    expect((await noticesFor(leo.id)).map((notice) => notice.kind)).toEqual(["task_comment"])

    await database.delete(customShellNotifications)
    await say(ben, taskId, `${tag(leo)} and iPad`, question)
    expect((await noticesFor(leo.id)).map((notice) => notice.kind)).toEqual(["task_mention"])
  })

  it("refuses a reply to a message in another chat", async () => {
    const { taskId, task } = await setUp()
    const other = await task("Another task")
    const { id } = await say(ben, other, "Elsewhere")
    await expect(say(ben, taskId, "Answer", id)).rejects.toThrow(PROJECT_ERRORS.replyNotInChat)
  })
})

describe("files in chat messages", () => {
  it("saves a task chat's files as the task's files, which only people on the task can download", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    const { id } = await sendMessage(
      ben,
      { chat: { taskId }, body: "here's the new logo", replyToId: null, files: [file("logo.png")] },
      database,
      storage
    )
    const detail = await loadTaskDetail(anna.id, taskId, database)
    expect(stored.size).toBe(1)
    expect(detail.files).toEqual([expect.objectContaining({ name: "logo.png", commentId: id, picture: true })])
    expect(detail.comments[0].files.map((sent) => sent.name)).toEqual(["logo.png"])
    expect(await loadTaskFileForDownload(leo.id, detail.files[0].id, database)).toMatchObject({ name: "logo.png" })
    expect(await loadTaskFileForDownload(carla.id, detail.files[0].id, database)).toBeNull()
  })

  it("keeps the task's 10, refusing a message whose files don't fit and storing nothing for it", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    const send = (count: number) =>
      sendMessage(
        ben,
        { chat: { taskId }, body: "", replyToId: null, files: Array.from({ length: count }, (_, n) => file(`f${n}.png`)) },
        database,
        storage
      )
    await send(5)
    await send(4)
    await expect(send(2)).rejects.toThrow(PROJECT_ERRORS.tooManyFiles)
    expect(stored.size).toBe(9)
    expect(await messagesOf(anna, taskId)).toHaveLength(2)
    await expect(send(6)).rejects.toThrow(PROJECT_ERRORS.tooManyMessageFiles)
  })

  it("refuses a message with no words and no files, and a file over 10 MB", async () => {
    const { taskId } = await setUp()
    await expect(say(ben, taskId, "")).rejects.toThrow(PROJECT_ERRORS.messageEmpty)
    await expect(
      sendMessage(
        ben,
        { chat: { taskId }, body: "big", replyToId: null, files: [file("big.png", LIMITS.fileBytes + 1)] },
        database,
        memoryStorage().storage
      )
    ).rejects.toThrow(PROJECT_ERRORS.fileTooBig)
  })

  it("keeps the files on the task when asked, and deletes them from storage otherwise", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    const send = () =>
      sendMessage(ben, { chat: { taskId }, body: "logo", replyToId: null, files: [file("logo.png")] }, database, storage)
    const { id: kept } = await send()
    const { id: dropped } = await send()

    await deleteComment(ben, { commentId: kept, keepFiles: true }, database, storage)
    await deleteComment(ben, { commentId: dropped, keepFiles: false }, database, storage)

    // The kept file stays under "Message deleted", where the site admin can
    // still delete it: deleting someone else's message is theirs alone.
    const detail = await loadTaskDetail(admin.id, taskId, database)
    expect(stored.size).toBe(1)
    expect(detail.files).toHaveLength(1)
    expect(detail.comments[0]).toMatchObject({ deleted: true, canDelete: true })
    expect(detail.comments[0].files).toHaveLength(1)
    await deleteComment(admin, { commentId: kept, keepFiles: false }, database, storage)
    expect(stored.size).toBe(0)
  })
})

describe("linking a task with #", () => {
  it("names a linked task for each reader: its title, a task you can't see, or deleted task", async () => {
    const { taskId, secretTaskId, task } = await setUp()
    const other = await task("Upgrade the payment library")
    await say(anna, taskId, `same as ${link(other, "old title")} and ${link(secretTaskId)}`)

    const [forBen] = await messagesOf(ben, taskId)
    expect(forBen.body).toBe(
      `same as ${link(other, "Upgrade the payment library")} and ${link(secretTaskId, "a task you can't see")}`
    )
    expect(Object.keys(forBen.links)).toEqual([other])
    expect((await messagesOf(anna, taskId))[0].links).toHaveProperty(secretTaskId)

    await updateTask(anna, { taskId: other, title: "Upgrade Stripe" }, database)
    expect((await messagesOf(ben, taskId))[0].body).toContain(link(other, "Upgrade Stripe"))
    await deleteTask(anna, other, database)
    expect((await messagesOf(ben, taskId))[0].body).toContain(link(other, "deleted task"))
  })

  it("refuses a link to a task the writer can't see", async () => {
    const { taskId, secretTaskId } = await setUp()
    await expect(say(ben, taskId, `see ${link(secretTaskId)}`)).rejects.toThrow(PROJECT_ERRORS.linkNotVisible)
  })

  it("keeps another project's task title out of the bell", async () => {
    const { taskId, secretTaskId, task } = await setUp()
    const near = await task("Near task")
    await database.delete(customShellNotifications)
    await say(anna, taskId, `${link(near, "Near task")} and ${link(secretTaskId, "Plan the surprise party")}`)
    const [notice] = await noticesFor(ben.id)
    expect(notice.detail).toBe("Fix the checkout bug: #Near task and #a task")
  })

  it("shows a notes link as the task's live title, or a task you can't see", async () => {
    const { taskId, secretTaskId } = await setUp()
    const notes = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Plan the surprise party", marks: [{ type: "link", attrs: { href: `/projects/x?task=${secretTaskId}` } }] },
          ],
        },
      ],
    })
    await updateTask(anna, { taskId, notes }, database)
    const forBen = await loadTaskDetail(ben.id, taskId, database)
    expect(forBen.task.notes).toContain("a task you can't see")
    expect(forBen.task.notes).not.toContain("surprise")
    expect(forBen.noteLinks).toEqual({})
    expect(forBen.task.notesText).not.toContain("surprise")
    const forAnna = await loadTaskDetail(anna.id, taskId, database)
    expect(forAnna.task.notes).toContain("Plan the surprise party")
    expect(Object.keys(forAnna.noteLinks)).toEqual([secretTaskId])
  })
})

describe("a project's own chat", () => {
  it("is for people who can see the project", async () => {
    const { projectId } = await setUp()
    await sendMessage(ben, { chat: { projectId }, body: "Morning all", replyToId: null }, database)
    expect((await loadProjectChat(leo.id, { projectId }, database)).messages.map((m) => m.body)).toEqual(["Morning all"])
    await expect(loadProjectChat(carla.id, { projectId }, database)).rejects.toThrow(PROJECT_ERRORS.projectNotFound)
    await expect(
      sendMessage(carla, { chat: { projectId }, body: "Hi", replyToId: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.projectNotFound)
    // It never shows in a task's chat.
    expect((await loadProjectChat(anna.id, { projectId }, database)).messages).toHaveLength(1)
  })

  it("tells only people tagged or replied to, and stops telling someone who left", async () => {
    const { projectId } = await setUp()
    const { id } = await sendMessage(leo, { chat: { projectId }, body: "Who has the keys?", replyToId: null }, database)
    expect(await noticesFor(ben.id)).toEqual([])
    expect(await noticesFor(anna.id)).toEqual([])

    await sendMessage(ben, { chat: { projectId }, body: `${tag(anna)} I do`, replyToId: id }, database)
    expect(await noticesFor(anna.id)).toEqual([
      {
        message: "Ben tagged you in a project chat",
        detail: "Site: @Anna I do",
        kind: "chat_mention",
        href: `/projects/${projectId}?chat=1`,
      },
    ])
    expect((await noticesFor(leo.id)).map((notice) => notice.message)).toEqual(["Ben replied to you in a project chat"])

    await removeProjectMember(admin.id, projectId, leo.id, database)
    await database.delete(customShellNotifications)
    await sendMessage(ben, { chat: { projectId }, body: "Thanks", replyToId: id }, database)
    expect(await noticesFor(leo.id)).toEqual([])
    await expect(
      sendMessage(ben, { chat: { projectId }, body: `${tag(leo)} bye`, replyToId: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.tagNotOnProject)
  })

  it("tells only people newly tagged on an edit", async () => {
    const { projectId } = await setUp()
    const { id } = await sendMessage(ben, { chat: { projectId }, body: `${tag(anna)} hi`, replyToId: null }, database)
    await database.delete(customShellNotifications)
    await editComment(ben, { commentId: id, body: `${tag(anna)} ${tag(leo)} hi` }, database)
    expect(await noticesFor(anna.id)).toEqual([])
    expect((await noticesFor(leo.id)).map((notice) => notice.kind)).toEqual(["chat_mention"])
  })

  it("takes files with no count, only the 10 MB each", async () => {
    const { projectId } = await setUp()
    const { stored, storage } = memoryStorage()
    for (let n = 0; n < 3; n += 1) {
      await sendMessage(
        ben,
        { chat: { projectId }, body: "", replyToId: null, files: Array.from({ length: 5 }, (_, at) => file(`${n}-${at}.png`)) },
        database,
        storage
      )
    }
    expect(stored.size).toBe(15)
    const chat = await loadProjectChat(leo.id, { projectId }, database)
    const fileId = chat.messages[0].files[0].id
    expect(await loadTaskFileForDownload(leo.id, fileId, database)).toMatchObject({ name: "0-0.png" })
    expect(await loadTaskFileForDownload(carla.id, fileId, database)).toBeNull()
  })

  it("loads 50 at a time, with the earlier ones behind a page", async () => {
    const { projectId } = await setUp()
    for (let n = 0; n < LIMITS.chatPage + 2; n += 1) {
      await sendMessage(ben, { chat: { projectId }, body: `m${n}`, replyToId: null }, database)
    }
    const newest = await loadProjectChat(ben.id, { projectId }, database)
    expect(newest.messages).toHaveLength(LIMITS.chatPage)
    expect(newest.earlier).toBe(true)
    expect(newest.messages.at(-1)?.body).toBe(`m${LIMITS.chatPage + 1}`)
    const oldest = newest.messages[0]
    const before = await loadProjectChat(ben.id, { projectId, before: { at: oldest.createdAt, id: oldest.id } }, database)
    expect(before.messages.map((m) => m.body)).toEqual(["m0", "m1"])
    expect(before.earlier).toBe(false)

    // A refresh after two new messages keeps the oldest one showing.
    await sendMessage(ben, { chat: { projectId }, body: "new 1", replyToId: null }, database)
    await sendMessage(ben, { chat: { projectId }, body: "new 2", replyToId: null }, database)
    const refreshed = await loadProjectChat(ben.id, { projectId, from: { at: oldest.createdAt, id: oldest.id } }, database)
    expect(refreshed.messages).toHaveLength(LIMITS.chatPage + 2)
    expect(refreshed.messages[0].body).toBe("m2")
    expect(refreshed.messages.at(-1)?.body).toBe("new 2")
    expect(refreshed.earlier).toBe(true)
    const everything = await loadProjectChat(ben.id, { projectId, from: { at: before.messages[0].createdAt, id: before.messages[0].id } }, database)
    expect(everything.messages).toHaveLength(LIMITS.chatPage + 4)
    expect(everything.earlier).toBe(false)
  })
})

describe("the team's announcement", () => {
  it("is posted by the site admin, tells the whole team, and shows to everyone on it", async () => {
    await setUp()
    await expect(postAnnouncement(ben, "Party", database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    await postAnnouncement(admin, "Office closed Friday", database)

    for (const person of [anna, ben, leo, carla]) {
      expect(await noticesFor(person.id)).toEqual([
        { message: "Tyler posted an announcement", detail: "Office closed Friday", kind: "team_announcement", href: "/team" },
      ])
    }
    expect(await noticesFor(admin.id)).toEqual([])
    const membership = (await findMembership(carla.id, database))!
    expect(await loadAnnouncement(membership, database)).toMatchObject({ text: "Office closed Friday", by: { name: "Tyler" } })
  })

  it("keeps one at a time, hides for one person until the next, and comes down for everyone", async () => {
    await setUp()
    await postAnnouncement(admin, "First", database)
    const benMembership = (await findMembership(ben.id, database))!
    const leoMembership = (await findMembership(leo.id, database))!
    const first = (await loadAnnouncement(benMembership, database))!
    await hideAnnouncement(ben.id, first.id, database)
    expect(await loadAnnouncement(benMembership, database)).toBeNull()
    expect(await loadAnnouncement(leoMembership, database)).toMatchObject({ text: "First" })

    await postAnnouncement(admin, "Second", database)
    expect(await loadAnnouncement(benMembership, database)).toMatchObject({ text: "Second" })

    await expect(takeDownAnnouncement(ben, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    await takeDownAnnouncement(admin, database)
    expect(await loadAnnouncement(leoMembership, database)).toBeNull()
    await expect(takeDownAnnouncement(admin, database)).rejects.toThrow(PROJECT_ERRORS.noAnnouncement)
  })
})

describe("earlier versions of notes", () => {
  const doc = (words: string) =>
    JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] })
  const session = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

  it("keeps one version per editing session, and what was there before the first", async () => {
    const { taskId } = await setUp()
    await updateTask(anna, { taskId, notes: "The old brief" }, database)
    await database.delete(projectTaskNoteVersions)

    await updateTask(ben, { taskId, notes: doc("Draft"), notesSession: session(1) }, database)
    await updateTask(ben, { taskId, notes: doc("Draft two"), notesSession: session(1) }, database)
    await updateTask(leo, { taskId, notes: doc(""), notesSession: session(2) }, database)

    const versions = await listNoteVersions(anna.id, taskId, database)
    expect(versions.map((version) => [version.savedBy, version.preview])).toEqual([
      ["Ben", "Draft two"],
      [null, "The old brief"],
    ])
    expect(versions[1].savedAt).toBeNull()
  })

  it("brings a version back as a new version, so nothing is lost either way", async () => {
    const { taskId } = await setUp()
    await updateTask(ben, { taskId, notes: doc("Good brief"), notesSession: session(1) }, database)
    await updateTask(leo, { taskId, notes: doc("Oops"), notesSession: session(2) }, database)
    const [good] = await listNoteVersions(anna.id, taskId, database)
    await restoreNoteVersion(anna, good.id, database)

    expect((await loadTaskDetail(anna.id, taskId, database)).task.notes).toBe(doc("Good brief"))
    expect((await listNoteVersions(anna.id, taskId, database)).map((version) => version.preview)).toEqual([
      "Oops",
      "Good brief",
    ])
  })

  it("keeps the last 20 earlier versions", async () => {
    const { taskId } = await setUp()
    for (let n = 1; n <= 25; n += 1) {
      await updateTask(ben, { taskId, notes: doc(`v${n}`), notesSession: session(n) }, database)
    }
    const versions = await listNoteVersions(anna.id, taskId, database)
    expect(versions).toHaveLength(LIMITS.noteVersions)
    expect(versions[0].preview).toBe("v24")
    expect(versions.at(-1)?.preview).toBe("v5")
  })
})

describe("live updates", () => {
  it("says which project and task changed, after the change commits", async () => {
    const { projectId, taskId } = await setUp()
    const heard: string[] = []
    const stop = await client.listen("project_live", (payload) => heard.push(payload))

    await say(ben, taskId, "Live?")
    await updateTask(anna, { taskId, title: "Fix the checkout bug now" }, database)
    await sendMessage(ben, { chat: { projectId }, body: "Project talk", replyToId: null }, database)
    await expect(say(carla, taskId, "Not allowed")).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await stop()

    expect(heard).toContain(`${projectId}:${taskId}`)
    expect(heard).toContain(`${projectId}:`)
    expect(heard.every((payload) => payload.startsWith(`${projectId}:`))).toBe(true)
  })

  it("says so when a deleted project-chat message's kept files are deleted", async () => {
    const { projectId } = await setUp()
    const { storage } = memoryStorage()
    const { id } = await sendMessage(
      ben,
      { chat: { projectId }, body: "logo", replyToId: null, files: [file("logo.png")] },
      database,
      storage
    )
    await deleteComment(ben, { commentId: id, keepFiles: true }, database, storage)
    const heard: string[] = []
    const stop = await client.listen("project_live", (payload) => heard.push(payload))
    await deleteComment(ben, { commentId: id, keepFiles: false }, database, storage)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await stop()
    expect(heard).toEqual([`${projectId}:`])
  })
})
