import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { messageText, tagPeople } from "@/lib/project/mentions"
import { readTaskNotes, storedTaskNotes } from "@/lib/project/notes"
import { LIMITS } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { createInvite, acceptInvite } from "@/server/project/invites"
import { addProjectMember, createProject, removeProjectMember } from "@/server/project/projects"
import { projectNoticeLinks, projectProjects, projectTaskFiles } from "@/server/project/schema"
import { addComment, deleteComment, editComment } from "@/server/project/task-chat"
import {
  addTaskFile,
  deleteTaskFile,
  loadTaskFileForDownload,
  type FileStorage,
} from "@/server/project/task-files"
import { followTask, unfollowTask } from "@/server/project/task-followers"
import {
  createTask,
  deleteTask,
  listTaskCards,
  loadTaskDetail,
  setTaskStatus,
  updateTask,
} from "@/server/project/tasks"
import { createTeam } from "@/server/project/teams"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let leo: CustomShellUser
let carla: CustomShellUser

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
 * Anna owns the team. Ben, Leo and Carla are members. The project has Anna,
 * Ben and Leo on it, not Carla. Anna hands Ben a task.
 */
async function setUp() {
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  for (const person of [ben, leo, carla]) {
    const sent = await createInvite(anna, { email: person.email, role: "member" }, database)
    await acceptInvite(person, sent.inviteId, database)
  }
  const { id: projectId } = await createProject(
    anna.id,
    { name: "Site", color: "blue", description: "" },
    database
  )
  await addProjectMember(anna.id, projectId, ben.id, database)
  await addProjectMember(anna.id, projectId, leo.id, database)
  const { id: taskId } = await createTask(
    anna,
    {
      projectId,
      title: "Set up redirects",
      notes: "",
      assigneeUserId: ben.id,
      dueDate: null,
      steps: [],
    },
    database
  )
  await database.delete(customShellNotifications)
  return { projectId, taskId }
}

async function noticesFor(userId: string) {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      kind: projectNoticeLinks.kind,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

const tag = (person: CustomShellUser) => `@[${person.name}](${person.id})`

describe("the chat's @ tags", () => {
  it("sends a tagged person one notice, and everyone else on the task the usual one", async () => {
    const { taskId } = await setUp()
    await addComment(anna, { taskId, body: `${tag(leo)} did the old URLs come from the sitemap?` }, database)

    expect(await noticesFor(leo.id)).toEqual([
      {
        message: "Anna asked you about a task",
        detail: "Set up redirects: @Leo Park did the old URLs come from the sitemap?",
        kind: "task_mention",
      },
    ])
    expect((await noticesFor(ben.id)).map((n) => n.kind)).toEqual(["task_comment"])
    expect(await noticesFor(anna.id)).toEqual([])
  })

  it("tells the assignee once when they are also tagged", async () => {
    const { taskId } = await setUp()
    await addComment(anna, { taskId, body: `${tag(ben)} any news?` }, database)
    expect((await noticesFor(ben.id)).map((n) => n.kind)).toEqual(["task_mention"])
  })

  it("refuses a tag of someone not on the project, and saves nothing", async () => {
    const { taskId } = await setUp()
    await expect(
      addComment(anna, { taskId, body: `${tag(carla)} can you look?` }, database)
    ).rejects.toThrow(PROJECT_ERRORS.tagNotOnProject)
    expect((await loadTaskDetail(anna.id, taskId, database)).comments).toEqual([])
    expect(await noticesFor(carla.id)).toEqual([])
  })

  it("sends nothing for tagging yourself", async () => {
    const { taskId } = await setUp()
    await addComment(ben, { taskId, body: `${tag(ben)} note to self` }, database)
    expect(await noticesFor(ben.id)).toEqual([])
  })

  it("reads a message from before tags exactly as written", async () => {
    const { taskId } = await setUp()
    await addComment(anna, { taskId, body: "Plain words, an @ sign, and [brackets](too)" }, database)
    const [comment] = (await loadTaskDetail(ben.id, taskId, database)).comments
    expect(comment.body).toBe("Plain words, an @ sign, and [brackets](too)")
    expect(messageText(comment.body)).toBe(comment.body)
  })

  it("turns a typed @Name into a tag, longest name first, and only at a word's end", () => {
    const people = [
      { id: "leo", name: "Leo" },
      { id: "leo-park", name: "Leo Park" },
    ]
    expect(tagPeople("@Leo Park and @leo, not @Leonard", people)).toBe(
      "@[Leo Park](leo-park) and @[Leo](leo), not @Leonard"
    )
  })
})

describe("editing and deleting messages", () => {
  it("lets only the writer edit, marks it edited, and tells only people newly tagged", async () => {
    const { taskId } = await setUp()
    const { id } = await addComment(anna, { taskId, body: `${tag(leo)} first` }, database)
    await database.delete(customShellNotifications)

    await expect(
      editComment(ben, { commentId: id, body: "hijacked" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.notYourMessage)

    await editComment(anna, { commentId: id, body: `${tag(leo)} ${tag(ben)} fixed` }, database)
    expect(await noticesFor(leo.id)).toEqual([])
    expect((await noticesFor(ben.id)).map((n) => n.kind)).toEqual(["task_mention"])

    const [comment] = (await loadTaskDetail(anna.id, taskId, database)).comments
    expect(comment.editedAt).not.toBeNull()
    expect(comment).toMatchObject({ canEdit: true, canDelete: true })
  })

  it("lets the writer, the owner and admins delete, and leaves the message's place", async () => {
    const { taskId } = await setUp()
    const { id } = await addComment(ben, { taskId, body: `${tag(leo)} question` }, database)

    await expect(deleteComment(leo, id, database)).rejects.toThrow(
      PROJECT_ERRORS.cantDeleteMessage
    )
    await deleteComment(anna, id, database)

    const [comment] = (await loadTaskDetail(leo.id, taskId, database)).comments
    expect(comment).toMatchObject({ deleted: true, body: "", canEdit: false, canDelete: false })
    const [card] = await listTaskCards(undefined, database)
    expect(card.commentCount).toBe(0)

    await database.delete(customShellNotifications)
    await expect(
      editComment(ben, { commentId: id, body: `${tag(leo)} again` }, database)
    ).rejects.toThrow(PROJECT_ERRORS.messageNotFound)
    expect(await noticesFor(leo.id)).toEqual([])
  })
})

describe("following a task", () => {
  it("sends a follower chat, Stuck and Done notices, and stops after unfollowing", async () => {
    const { taskId } = await setUp()
    await followTask(leo.id, taskId, database)
    expect((await loadTaskDetail(leo.id, taskId, database)).following).toBe(true)

    await addComment(ben, { taskId, body: "Started" }, database)
    await setTaskStatus(ben, { taskId, status: "stuck", stuckReason: "No sitemap" }, database)
    await setTaskStatus(ben, { taskId, status: "done", stuckReason: null }, database)
    // Already Done: no second notice.
    await setTaskStatus(ben, { taskId, status: "done", stuckReason: null }, database)
    expect((await noticesFor(leo.id)).map((n) => n.message)).toEqual([
      "Ben commented on a task",
      "Ben marked a task Stuck",
      "Ben marked a task Done",
    ])

    await unfollowTask(leo.id, taskId, database)
    await database.delete(customShellNotifications)
    await addComment(ben, { taskId, body: "One more thing" }, database)
    expect(await noticesFor(leo.id)).toEqual([])
  })

  it("sends a follower who is also tagged one notice", async () => {
    const { taskId } = await setUp()
    await followTask(leo.id, taskId, database)
    await addComment(ben, { taskId, body: `${tag(leo)} quick one` }, database)
    expect((await noticesFor(leo.id)).map((n) => n.kind)).toEqual(["task_mention"])
  })

  it("stops telling a follower removed from the project", async () => {
    const { projectId, taskId } = await setUp()
    await followTask(leo.id, taskId, database)
    await removeProjectMember(anna.id, projectId, leo.id, database)
    await addComment(ben, { taskId, body: "Started" }, database)
    await setTaskStatus(ben, { taskId, status: "done", stuckReason: null }, database)
    expect(await noticesFor(leo.id)).toEqual([])
  })
})

describe("files on a task", () => {
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
  const bytes = (size: number) => new Uint8Array(size).fill(1)

  it("adds a file only people who can see the task can download", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    const { id } = await addTaskFile(
      ben,
      { taskId, name: "shot.png", mimeType: "image/png", data: bytes(10) },
      database,
      storage
    )
    expect(stored.size).toBe(1)
    expect((await loadTaskDetail(leo.id, taskId, database)).files).toEqual([
      expect.objectContaining({ id, name: "shot.png", sizeBytes: 10, picture: true }),
    ])
    expect(await loadTaskFileForDownload(leo.id, id, database)).toMatchObject({ name: "shot.png" })
    expect(await loadTaskFileForDownload(carla.id, id, database)).toBeNull()
  })

  it("refuses an empty file, one over 10 MB, and an eleventh file", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    const add = (size: number) =>
      addTaskFile(ben, { taskId, name: "a.pdf", mimeType: "application/pdf", data: bytes(size) }, database, storage)

    await expect(add(0)).rejects.toThrow(PROJECT_ERRORS.fileEmpty)
    await expect(add(LIMITS.fileBytes + 1)).rejects.toThrow(PROJECT_ERRORS.fileTooBig)
    for (let n = 0; n < LIMITS.filesPerTask; n += 1) await add(1)
    await expect(add(1)).rejects.toThrow(PROJECT_ERRORS.tooManyFiles)
    expect(stored.size).toBe(LIMITS.filesPerTask)
  })

  it("refuses a file that would take the team past 5 GB", async () => {
    const { taskId } = await setUp()
    const { storage } = memoryStorage()
    const [project] = await database.select().from(projectProjects)
    // Made-up files that leave the team 5 bytes short of 5 GB.
    const sizes = [2_000_000_000, 2_000_000_000, LIMITS.teamFileBytes - 4_000_000_005]
    for (const [n, sizeBytes] of sizes.entries()) {
      await database.insert(projectTaskFiles).values({
        id: `big-${n}`,
        taskId,
        teamId: project.teamId,
        uploadedByUserId: anna.id,
        originalName: "film.mov",
        mimeType: "video/quicktime",
        sizeBytes,
        storagePath: `big-${n}`,
        createdAt: new Date(),
      })
    }
    const add = (size: number) =>
      addTaskFile(ben, { taskId, name: "a.pdf", mimeType: "application/pdf", data: bytes(size) }, database, storage)
    await expect(add(6)).rejects.toThrow(PROJECT_ERRORS.teamFilesFull)
    await add(5)
  })

  it("lets the uploader, the owner and admins delete a file, from storage too", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    const { id } = await addTaskFile(
      ben,
      { taskId, name: "notes.txt", mimeType: "text/plain", data: bytes(5) },
      database,
      storage
    )
    await expect(deleteTaskFile(leo, id, database, storage)).rejects.toThrow(
      PROJECT_ERRORS.cantDeleteFile
    )
    await deleteTaskFile(anna, id, database, storage)
    expect(stored.size).toBe(0)
    expect((await loadTaskDetail(ben.id, taskId, database)).files).toEqual([])
  })

  it("takes a deleted task's files out of storage, and keeps the task if it can't", async () => {
    const { taskId } = await setUp()
    const { stored, storage } = memoryStorage()
    await addTaskFile(ben, { taskId, name: "a.txt", mimeType: "text/plain", data: bytes(1) }, database, storage)

    const broken: FileStorage = { ...storage, remove: () => Promise.reject(new Error("down")) }
    await expect(deleteTask(anna, taskId, database, broken)).rejects.toThrow(
      PROJECT_ERRORS.fileNotRemoved
    )
    expect((await loadTaskDetail(anna.id, taskId, database)).task.id).toBe(taskId)

    await deleteTask(anna, taskId, database, storage)
    expect(stored.size).toBe(0)
  })
})

describe("formatted notes", () => {
  it("saves the editor's document cleaned, and reads old plain notes as they were", async () => {
    const { taskId } = await setUp()
    await updateTask(
      anna,
      {
        taskId,
        notes: storedTaskNotes({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "See ", marks: [] },
                {
                  type: "text",
                  text: "the sitemap",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        }),
      },
      database
    )
    const notes = readTaskNotes((await loadTaskDetail(anna.id, taskId, database)).task.notes)
    expect(notes.kind).toBe("doc")
    expect(JSON.stringify(notes)).not.toContain("javascript")

    expect(readTaskNotes("Line one\n  indented")).toEqual({
      kind: "text",
      text: "Line one\n  indented",
    })
    expect(storedTaskNotes({ type: "doc", content: [{ type: "paragraph" }] })).toBe("")
  })
})
