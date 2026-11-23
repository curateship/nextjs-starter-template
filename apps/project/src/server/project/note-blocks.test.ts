import { createHmac } from "node:crypto"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { storedTaskNotes } from "@/lib/project/notes"
import { inTeam } from "@/server/project/access"
import { setTaskLink } from "@/server/project/linked-records"
import {
  RECORD_CARD_PATH,
  loadNoteRecordCard,
  loadNoteTaskCards,
  stampCardRequest,
} from "@/server/project/note-blocks"
import { addProjectMember } from "@/server/project/projects"
import { projectTasks } from "@/server/project/schema"
import { addTaskFile, type FileStorage } from "@/server/project/task-files"
import { createTask, updateTask } from "@/server/project/tasks"
import type { TeamSummary } from "@/server/project/teams"
import { projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const VIDEO_KEY = "video-key-for-tests"
const RECORD = "3f2a9c1e-0000-4000-8000-000000000001"
const ENV = { CONNECTED_VIDEO_URL: "https://video.example.test", CONNECTED_VIDEO_KEY: VIDEO_KEY } as NodeJS.ProcessEnv
const NOWHERE: FileStorage = { put: async () => undefined, remove: async () => undefined }

let client: PGlite
let database: CustomShellDb
let sam: CustomShellUser
let ben: CustomShellUser
let admin: CustomShellUser
let team: TeamSummary
let taskId: string
let privateTaskId: string

const doc = (...content: unknown[]) => ({ type: "doc", content })
const newTask = (projectId: string, title: string, assigneeUserId: string | null) =>
  createTask(
    { id: admin.id, name: admin.name },
    { projectId, title, notes: "", assigneeUserId, dueDate: null },
    database
  )

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  sam = await insertUser(database, { name: "Sam", email: "sam@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  ;({ admin, team } = await startTeam(database, [sam, ben]))
  const shared = await projectFor(admin, sam.id, { name: "Launch", color: "blue" }, database)
  await addProjectMember(admin.id, shared.id, ben.id, database)
  const samOnly = await projectFor(admin, sam.id, { name: "Pay review", color: "red" }, database)
  taskId = (await newTask(shared.id, "Cut the launch video", sam.id)).id
  privateTaskId = (await newTask(samOnly.id, "Sam's raise", sam.id)).id
})

afterEach(async () => {
  await client.close()
})

describe("Task cards", () => {
  it("show an open task's name, status and person, and never a task the reader can't see", async () => {
    await database.update(projectTasks).set({ dueDate: "2099-01-10" }).where(eq(projectTasks.id, taskId))
    const cards = await loadNoteTaskCards(ben.id, [taskId, privateTaskId, "no-such-task"], database)
    expect(cards).toEqual([
      {
        taskId,
        state: "open",
        title: "Cut the launch video",
        projectId: expect.any(String),
        status: "todo",
        assigneeName: "Sam",
        dueDate: "2099-01-10",
      },
      { taskId: privateTaskId, state: "hidden" },
      { taskId: "no-such-task", state: "deleted" },
    ])
    // Sam is on both projects, so Sam sees both.
    const samCards = await loadNoteTaskCards(sam.id, [privateTaskId], database)
    expect(samCards[0]).toMatchObject({ state: "open", title: "Sam's raise" })
  })
})

describe("File blocks on save", () => {
  it("keep only files on the task being saved", async () => {
    const mine = await addTaskFile(sam, { taskId, name: "brief.pdf", mimeType: "application/pdf", data: new Uint8Array([1]) }, database, NOWHERE)
    const theirs = await addTaskFile(
      sam,
      { taskId: privateTaskId, name: "salary.pdf", mimeType: "application/pdf", data: new Uint8Array([1]) },
      database,
      NOWHERE
    )
    const notes = storedTaskNotes(
      doc(
        { type: "noteFile", attrs: { fileId: mine.id } },
        { type: "noteFile", attrs: { fileId: theirs.id } },
        { type: "noteImage", attrs: { fileId: theirs.id } }
      )
    )
    await updateTask({ id: ben.id, name: ben.name }, { taskId, notes }, database)
    const [row] = await database.select({ notes: projectTasks.notes }).from(projectTasks).where(eq(projectTasks.id, taskId))
    expect(JSON.parse(row.notes)).toEqual(doc({ type: "noteFile", attrs: { fileId: mine.id } }))
  })

  it("never come in with a new task, which has no files yet", async () => {
    const mine = await addTaskFile(sam, { taskId, name: "brief.pdf", mimeType: "application/pdf", data: new Uint8Array([1]) }, database, NOWHERE)
    const notes = storedTaskNotes(doc({ type: "paragraph", content: [{ type: "text", text: "See the brief" }] }, { type: "noteFile", attrs: { fileId: mine.id } }))
    const [project] = await database.select({ projectId: projectTasks.projectId }).from(projectTasks).where(eq(projectTasks.id, taskId))
    const made = await createTask({ id: sam.id, name: sam.name }, { projectId: project.projectId, title: "Follow up", notes, assigneeUserId: null, dueDate: null }, database)
    const [row] = await database.select({ notes: projectTasks.notes }).from(projectTasks).where(eq(projectTasks.id, made.id))
    expect(JSON.parse(row.notes)).toEqual(doc({ type: "paragraph", content: [{ type: "text", text: "See the brief" }] }))
  })
})

describe("the Video or Promo card", () => {
  beforeEach(async () => {
    await inTeam(team.id, () => setTaskLink(admin, { taskId, address: `https://video.example.test/admin/video-editor/${RECORD}` }, database, ENV))
  })

  it("asks Video for the name and picture with a stamp only Video can check", async () => {
    let asked: URL | null = null
    const fetcher = (async (input: URL) => {
      asked = input
      return Response.json({ name: "Launch teaser", pictureUrl: "https://cdn.example.test/thumb.jpg" })
    }) as unknown as typeof fetch
    const card = await loadNoteRecordCard(sam, taskId, { database, env: ENV, fetcher, now: 1_000_000 })
    expect(card).toEqual({ app: "video", canOpen: true, connected: true, name: "Launch teaser", pictureUrl: "https://cdn.example.test/thumb.jpg" })
    const url = asked as unknown as URL
    expect(url.origin + url.pathname).toBe(`https://video.example.test${RECORD_CARD_PATH}`)
    expect(url.searchParams.get("record")).toBe(RECORD)
    const exp = Number(url.searchParams.get("exp"))
    expect(exp).toBe(1060)
    expect(url.searchParams.get("sig")).toBe(createHmac("sha256", VIDEO_KEY).update(`record-card.v1.${RECORD}.${exp}`).digest("base64url"))
    expect(url.searchParams.get("sig")).toBe(stampCardRequest(RECORD, exp, VIDEO_KEY))
  })

  it("tells someone who can't open the record nothing about it, and never asks Video", async () => {
    let calls = 0
    const fetcher = (async () => {
      calls += 1
      return Response.json({ name: "Secret" })
    }) as unknown as typeof fetch
    const card = await loadNoteRecordCard(ben, taskId, { database, env: ENV, fetcher })
    expect(card).toEqual({ app: "video", canOpen: false, connected: true, name: null, pictureUrl: null })
    expect(calls).toBe(0)
  })

  it("stays up, nameless, when Video is down or answers nonsense", async () => {
    const down = (async () => {
      throw new Error("connect ECONNREFUSED")
    }) as unknown as typeof fetch
    expect(await loadNoteRecordCard(sam, taskId, { database, env: ENV, fetcher: down })).toMatchObject({ name: null, pictureUrl: null })
    const odd = (async () => Response.json({ name: "", pictureUrl: "javascript:alert(1)" })) as unknown as typeof fetch
    expect(await loadNoteRecordCard(sam, taskId, { database, env: ENV, fetcher: odd })).toMatchObject({ name: null })
    const plainHttp = (async () => Response.json({ name: "Teaser", pictureUrl: "http://cdn.example.test/a.jpg" })) as unknown as typeof fetch
    expect(await loadNoteRecordCard(sam, taskId, { database, env: ENV, fetcher: plainHttp })).toMatchObject({ name: "Teaser", pictureUrl: null })
  })

  it("is null for a task that points at no record", async () => {
    expect(await loadNoteRecordCard(sam, privateTaskId, { database, env: ENV })).toBeNull()
  })
})
