import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { storedTaskNotes } from "@/lib/project/notes"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { resolveProjectId } from "@/server/project/personal"
import { emptyProjectBin, loadProjectBin } from "@/server/project/planning"
import { emptyOldBins } from "@/server/project/planning-jobs"
import {
  MAX_PROJECT_NOTES,
  createProjectNote,
  deleteProjectNote,
  duplicateProjectNote,
  findNotesToLink,
  listProjectNotes,
  moveProjectNote,
  pinProjectNote,
  restoreProjectNote,
  saveProjectNote,
} from "@/server/project/project-notes"
import { addProjectMember, setProjectArchived } from "@/server/project/projects"
import { projectNotes } from "@/server/project/schema"
import { sendMessage } from "@/server/project/task-chat"
import { createTask, loadTaskDetail, updateTask } from "@/server/project/tasks"
import { projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let admin: CustomShellUser
let teamId: string
let projectId: string
let taskId: string

/** A note's words as the editor saves them: one paragraph per line. */
const words = (...lines: string[]) =>
  JSON.stringify({ type: "doc", content: lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) })

/** Anna writes a note on Site (or another project) and gives it these words. */
async function note(text: string, writer = anna, onProject = projectId) {
  const { id } = await createProjectNote(writer.id, onProject, database)
  await saveProjectNote(writer.id, { noteId: id, body: words(text) }, database)
  return id
}

const titles = async (viewer: CustomShellUser) =>
  (await listProjectNotes(viewer.id, projectId, database)).notes.map((row) => row.title)

/**
 * The site admin runs the team. Anna and Ben are on "Site"; Carla is on the
 * team but not on Site. Ben has a task on Site.
 */
beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  const started = await startTeam(database, [anna, ben, carla])
  admin = started.admin
  teamId = started.team.id
  projectId = (await projectFor(admin, anna.id, { name: "Site", color: "blue" }, database)).id
  await addProjectMember(admin.id, projectId, ben.id, database)
  taskId = (
    await createTask(
      anna,
      { projectId, title: "Fix the checkout", notes: "", assigneeUserId: ben.id, dueDate: null },
      database
    )
  ).id
})

afterEach(async () => {
  await client.close()
})

describe("team notes", () => {
  it("are written by everyone on the project and named by their first line", async () => {
    await note("Client logins\nThe rest")
    await note("Launch checklist", ben)
    expect(await titles(anna)).toEqual(["Launch checklist", "Client logins"])
    const [first] = (await listProjectNotes(ben.id, projectId, database)).notes
    expect(first).toMatchObject({ writer: { id: ben.id, name: "Ben" } })
    await expect(listProjectNotes(carla.id, projectId, database)).rejects.toThrow(PROJECT_ERRORS.projectNotFound)
  })

  it("stop at 200 a project, and an archived project's read only", async () => {
    const at = new Date()
    await database.insert(projectNotes).values(
      Array.from({ length: MAX_PROJECT_NOTES }, (_, index) => ({
        id: `n-${index}`,
        projectId,
        writerUserId: anna.id,
        position: index,
        createdAt: at,
        updatedAt: at,
      }))
    )
    await expect(createProjectNote(anna.id, projectId, database)).rejects.toThrow(PROJECT_ERRORS.tooManyNotes)
    await expect(duplicateProjectNote(anna.id, "n-0", database)).rejects.toThrow(PROJECT_ERRORS.tooManyNotes)
    await inTeam(teamId, () => setProjectArchived(admin.id, projectId, true, database))
    expect((await listProjectNotes(anna.id, projectId, database)).canWrite).toBe(false)
    await expect(saveProjectNote(anna.id, { noteId: "n-0", body: words("x") }, database)).rejects.toThrow(
      PROJECT_ERRORS.projectArchived
    )
  })

  it("never hold a File block or the Video or Promo card", async () => {
    const { id } = await createProjectNote(anna.id, projectId, database)
    // As the browser sends it: the editor's document, cleaned to a task note's rules on the way in.
    const body = storedTaskNotes({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Brief" }] },
        { type: "noteFile", attrs: { fileId: "someone-elses-file" } },
        { type: "noteRecord", attrs: {} },
      ],
    })
    // A task's notes keep both, so the project note's own rule is what takes them out.
    expect(body).toContain("noteFile")
    expect(body).toContain("noteRecord")
    await saveProjectNote(anna.id, { noteId: id, body }, database)
    const [saved] = await database.select().from(projectNotes).where(eq(projectNotes.id, id))
    expect(saved.body).toContain("Brief")
    expect(saved.body).not.toContain("noteFile")
    expect(saved.body).not.toContain("noteRecord")
  })
})

describe("a Just me list's notes", () => {
  it("are its person's and the site admin's, like the list", async () => {
    const own = await resolveProjectId(ben.id, PERSONAL_PROJECT_ID, database)
    await note("Ben's own plan", ben, own)
    expect((await listProjectNotes(ben.id, own, database)).notes).toHaveLength(1)
    await expect(listProjectNotes(anna.id, own, database)).rejects.toThrow(PROJECT_ERRORS.projectNotFound)
    expect((await inTeam(teamId, () => listProjectNotes(admin.id, own, database))).notes).toHaveLength(1)
    expect((await findNotesToLink(anna.id, "", database)).map((row) => row.title)).toEqual([])
  })
})

describe("pins and order", () => {
  it("are the same for everyone, pinned notes first", async () => {
    const a = await note("A")
    const b = await note("B")
    const c = await note("C")
    expect(await titles(ben)).toEqual(["C", "B", "A"])

    await moveProjectNote(ben.id, { noteId: c, beforeId: null }, database)
    expect(await titles(anna)).toEqual(["B", "A", "C"])
    await moveProjectNote(anna.id, { noteId: a, beforeId: b }, database)
    expect(await titles(ben)).toEqual(["A", "B", "C"])

    await pinProjectNote(ben.id, { noteId: c, pinned: true }, database)
    expect(await titles(anna)).toEqual(["C", "A", "B"])
    // A new note goes to the top of the unpinned ones.
    await note("D")
    expect(await titles(anna)).toEqual(["C", "D", "A", "B"])
    await expect(moveProjectNote(anna.id, { noteId: a, beforeId: c }, database)).rejects.toThrow(
      PROJECT_ERRORS.pinnedNotesFirst
    )
    await pinProjectNote(ben.id, { noteId: c, pinned: false }, database)
    expect(await titles(anna)).toEqual(["C", "D", "A", "B"])
  })
})

describe("the bin", () => {
  it("takes a deleted note with Undo, and empties it after 30 days or on Empty bin", async () => {
    const plan = await note("Team plan")
    await deleteProjectNote(ben.id, plan, database)
    expect(await titles(anna)).toEqual([])
    expect((await loadProjectBin(anna.id, projectId, database)).entries).toMatchObject([
      { kind: "note", title: "Team plan", deletedByName: "Ben" },
    ])
    await restoreProjectNote(anna.id, plan, database)
    expect(await titles(anna)).toEqual(["Team plan"])

    await deleteProjectNote(anna.id, plan, database)
    await emptyOldBins(database, new Date(Date.now() + 29 * 24 * 60 * 60 * 1000))
    expect(await database.select().from(projectNotes)).toHaveLength(1)
    await emptyOldBins(database, new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))
    expect(await database.select().from(projectNotes)).toHaveLength(0)

    const other = await note("Other")
    await deleteProjectNote(anna.id, other, database)
    await inTeam(teamId, () => emptyProjectBin(admin.id, projectId, database))
    expect(await database.select().from(projectNotes)).toHaveLength(0)
  })
})

describe("# links to a note", () => {
  const noteLink = (id: string, title = "x") => `#[${title}](note:${id})`
  /** A note on Anna's other project, which Ben isn't on. */
  const unseen = async (text: string) =>
    note(text, anna, (await projectFor(admin, anna.id, { name: "Hiring", color: "green" }, database)).id)

  it("name the note for each reader in chat, and refuse one the writer can't see", async () => {
    const plan = await note("Launch plan")
    const secret = await unseen("Pay review")
    await sendMessage(anna, { chat: { taskId }, body: `see ${noteLink(plan)} and ${noteLink(secret)}`, replyToId: null }, database)

    const [forBen] = (await loadTaskDetail(ben.id, taskId, database)).comments
    expect(forBen.body).toBe(`see ${noteLink(plan, "Launch plan")} and ${noteLink(secret, "a note you can't see")}`)
    expect(forBen.links).toEqual({ [`note:${plan}`]: projectId })
    const [forAnna] = (await loadTaskDetail(anna.id, taskId, database)).comments
    expect(forAnna.body).toContain(noteLink(secret, "Pay review"))
    expect((await findNotesToLink(ben.id, "", database)).map((row) => row.title)).toEqual(["Launch plan"])

    await deleteProjectNote(anna.id, plan, database)
    expect((await loadTaskDetail(ben.id, taskId, database)).comments[0].body).toContain(noteLink(plan, "deleted note"))

    await expect(
      sendMessage(ben, { chat: { taskId }, body: `look ${noteLink(secret)}`, replyToId: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.noteLinkNotVisible)
  })

  it("show in a task's notes as the note's first line, or a note you can't see", async () => {
    const secret = await unseen("Pay review")
    const notes = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Pay review", marks: [{ type: "link", attrs: { href: `/projects/${projectId}?note=${secret}` } }] }],
        },
      ],
    })
    await updateTask(anna, { taskId, notes }, database)
    const forBen = await loadTaskDetail(ben.id, taskId, database)
    expect(forBen.task.notes).toContain("a note you can't see")
    expect(forBen.task.notes).not.toContain("Pay review")
    expect(forBen.task.notesText).not.toContain("Pay review")
    expect(forBen.noteLinks).toEqual({})
    const forAnna = await loadTaskDetail(anna.id, taskId, database)
    expect(Object.keys(forAnna.noteLinks)).toEqual([`note:${secret}`])
  })
})
