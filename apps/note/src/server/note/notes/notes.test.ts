import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createField, updateField } from "@/server/note/notes/fields"
import { createFolder, listTree, moveFolder, restoreFolder, trashFolder } from "@/server/note/notes/folders"
import {
  createNote,
  emptyTrash,
  listNotes,
  listVersions,
  loadNote,
  moveNotes,
  previewMove,
  purgeOldTrash,
  restoreNote,
  restoreVersion,
  saveNote,
  setFieldValue,
  trashNotes,
  videoNoteBody,
} from "@/server/note/notes/notes"
import { reminderDueAt, sendDueReminders } from "@/server/note/notes/reminders"
import { readSuggestions } from "@/server/note/notes/suggest"
import {
  noteNoteFolders,
  noteNoteLinks,
  noteNoteReminders,
  noteNotes,
  noteNoteVersions,
  noteNoticeLinks,
} from "@/server/note/schema"
import { FIELDS_SAY } from "@/lib/note/notes/fields"
import { NOTES_SAY } from "@/lib/note/notes/notes"

/**
 * Written notes on a real (in-memory) database: per-folder fields, moving
 * between folders, links, earlier copies, refused stale saves, Trash and
 * reminders, and that one person never sees another's notes.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const doc = (...content: object[]) => ({ type: "doc", content })
const p = (...content: object[]) => ({ type: "paragraph", content })
const text = (value: string) => ({ type: "text", text: value })

async function folder(name: string, parentId: string | null = null) {
  return (await createFolder(user.id, { name, parentId })).id
}

async function booksFolder() {
  const id = await folder("Books")
  const status = await createField(user.id, id, {
    name: "Status",
    type: "select",
    options: [
      { id: "o-read", label: "To read", colour: "grey" },
      { id: "o-done", label: "Done", colour: "green" },
    ],
    remind: false,
  })
  const rating = await createField(user.id, id, { name: "Rating", type: "number", options: [], remind: false })
  return { id, status, rating }
}

describe("fields", () => {
  it("refuses a type change once a note holds a value, and allows a rename", async () => {
    const books = await booksFolder()
    const note = await createNote(user.id, { folderId: books.id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: books.rating.key, value: 4 })
    await expect(
      updateField(user.id, books.rating.id, { name: "Rating", type: "text", options: [], remind: false })
    ).rejects.toThrow(FIELDS_SAY.typeLocked)
    const renamed = await updateField(user.id, books.rating.id, {
      name: "Stars",
      type: "number",
      options: [],
      remind: false,
    })
    expect(renamed.key).toBe(books.rating.key)
    expect((await loadNote(user.id, note.id)).values).toEqual({ [books.rating.key]: 4 })
  })

  it("clears a value whose option was taken away", async () => {
    const books = await booksFolder()
    const note = await createNote(user.id, { folderId: books.id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: books.status.key, value: "o-done" })
    await updateField(user.id, books.status.id, {
      name: "Status",
      type: "select",
      options: [{ id: "o-read", label: "To read", colour: "grey" }],
      remind: false,
    })
    expect((await loadNote(user.id, note.id)).values).toEqual({})
  })

  it("refuses a value that does not fit, with the reason", async () => {
    const books = await booksFolder()
    const note = await createNote(user.id, { folderId: books.id })
    await expect(
      setFieldValue(user.id, { noteId: note.id, fieldKey: books.rating.key, value: "lots" })
    ).rejects.toThrow("That is not a number")
  })
})

describe("moving notes", () => {
  it("keeps a same-named field of the same type and names what is lost", async () => {
    const books = await booksFolder()
    const reading = await folder("Reading list")
    await createField(user.id, reading, {
      name: "status",
      type: "select",
      options: [{ id: "r-done", label: "done", colour: "blue" }],
      remind: false,
    })
    const note = await createNote(user.id, { folderId: books.id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: books.status.key, value: "o-done" })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: books.rating.key, value: 5 })

    expect(await previewMove(user.id, { ids: [note.id], folderId: reading })).toEqual({ lost: ["Rating"] })
    const result = await moveNotes(user.id, { ids: [note.id], folderId: reading })
    expect(result).toEqual({ done: [note.id], skipped: [] })
    const moved = await loadNote(user.id, note.id)
    expect(moved.folderId).toBe(reading)
    expect(moved.values).toEqual({ status: "r-done" })
  })
})

describe("saving", () => {
  it("refuses a save that started from an older revision", async () => {
    const note = await createNote(user.id, { folderId: null })
    const first = await saveNote(user.id, { id: note.id, revision: note.revision, title: "One" })
    expect(first.revision).toBe(note.revision + 1)
    await expect(saveNote(user.id, { id: note.id, revision: note.revision, title: "Two" })).rejects.toThrow(
      NOTES_SAY.changedElsewhere
    )
    expect((await loadNote(user.id, note.id)).title).toBe("One")
  })

  it("rewrites which notes this one links to, only to the owner's notes", async () => {
    const other = await insertUser(database)
    const theirs = await createNote(other.id, { folderId: null, title: "Theirs" })
    const mine = await createNote(user.id, { folderId: null, title: "Mine" })
    const note = await createNote(user.id, { folderId: null })
    await saveNote(user.id, {
      id: note.id,
      revision: note.revision,
      body: doc(
        p(
          { type: "noteLink", attrs: { id: mine.id, label: "Mine" } },
          { type: "noteLink", attrs: { id: theirs.id, label: "Theirs" } }
        )
      ),
    })
    const links = await database.select().from(noteNoteLinks).where(eq(noteNoteLinks.fromNoteId, note.id))
    expect(links.map((link) => link.toNoteId)).toEqual([mine.id])
    const target = await loadNote(user.id, mine.id)
    expect(target.linkedFrom).toEqual([{ id: note.id, title: "" }])
    const detail = await loadNote(user.id, note.id)
    expect(detail.linkTitles[mine.id]).toEqual({ title: "Mine", state: "ok" })
    expect(detail.linkTitles[theirs.id]).toEqual({ title: "", state: "gone" })
  })

  it("keeps one earlier copy per five minutes, and only the newest 100", async () => {
    const note = await createNote(user.id, { folderId: null, title: "v0" })
    let revision = note.revision
    revision = (await saveNote(user.id, { id: note.id, revision, title: "v1" })).revision
    revision = (await saveNote(user.id, { id: note.id, revision, title: "v2" })).revision
    expect(await listVersions(user.id, note.id)).toHaveLength(1)

    // Pretend the last copy is six minutes old.
    await database
      .update(noteNoteVersions)
      .set({ createdAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(noteNoteVersions.noteId, note.id))
    revision = (await saveNote(user.id, { id: note.id, revision, title: "v3" })).revision
    const versions = await listVersions(user.id, note.id)
    expect(versions.map((version) => version.title)).toEqual(["v2", "v0"])

    for (let index = 0; index < 105; index += 1) {
      await database.insert(noteNoteVersions).values({
        id: `old-${index}`,
        noteId: note.id,
        title: `old ${index}`,
        body: doc(p()),
        createdAt: new Date(Date.now() - (200 + index) * 60_000),
      })
    }
    revision = (await saveNote(user.id, { id: note.id, revision, title: "v4" })).revision
    expect(await listVersions(user.id, note.id)).toHaveLength(100)

    const restored = await restoreVersion(user.id, { noteId: note.id, versionId: versions[1].id })
    expect(restored.title).toBe("v0")
    expect((await listVersions(user.id, note.id))[0].title).toBe("v4")
    expect(restored.revision).toBe(revision + 1)
  })
})

describe("search and owners", () => {
  it("finds words in the title, the body and the field values, only the owner's", async () => {
    const other = await insertUser(database)
    await createNote(other.id, { folderId: null, title: "Pricing for them" })
    const books = await booksFolder()
    const a = await createNote(user.id, { folderId: null, title: "Pricing ideas" })
    const b = await createNote(user.id, { folderId: null, body: doc(p(text("We talked about pricing"))) })
    const c = await createNote(user.id, { folderId: books.id })
    await setFieldValue(user.id, { noteId: c.id, fieldKey: books.status.key, value: "o-done" })

    const found = await listNotes(user.id, { scope: "all", search: "pricing" })
    expect(found.notes.map((note) => note.id).sort()).toEqual([a.id, b.id].sort())
    const byField = await listNotes(user.id, { scope: "all", search: "done" })
    expect(byField.notes.map((note) => note.id)).toEqual([c.id])
    await expect(loadNote(other.id, a.id)).rejects.toThrow(NOTES_SAY.noteNotFound)
  })
})

describe("Trash", () => {
  it("sends a folder to Trash with everything under it, and brings exactly that back", async () => {
    const books = await folder("Books")
    const fiction = await folder("Fiction", books)
    const inBooks = await createNote(user.id, { folderId: books })
    const inFiction = await createNote(user.id, { folderId: fiction })
    const alreadyTrashed = await createNote(user.id, { folderId: books })
    await trashNotes(user.id, [alreadyTrashed.id])

    const trashed = await trashFolder(user.id, books)
    expect(trashed).toMatchObject({ folders: 2, notes: 2 })
    expect(trashed.tree.folders).toEqual([])
    const trash = await listNotes(user.id, { scope: "trash" })
    expect(trash.notes.map((note) => note.id)).toEqual([alreadyTrashed.id])
    expect(trash.trashedFolders).toMatchObject([{ id: books, name: "Books", noteCount: 2 }])

    const tree = await restoreFolder(user.id, books)
    expect(tree.folders.map((each) => each.name).sort()).toEqual(["Books", "Fiction"])
    const back = await listNotes(user.id, { scope: "all" })
    expect(back.notes.map((note) => note.id).sort()).toEqual([inBooks.id, inFiction.id].sort())
    expect((await listNotes(user.id, { scope: "trash" })).notes.map((note) => note.id)).toEqual([alreadyTrashed.id])
  })

  it("restores a folder whose long name was taken meanwhile under a new name that fits", async () => {
    const long = "B".repeat(80)
    const first = await folder(long)
    await trashFolder(user.id, first)
    await folder(long)
    const tree = await restoreFolder(user.id, first)
    const restored = tree.folders.find((each) => each.id === first)!
    expect(restored.name).toBe(`${"B".repeat(80 - " (restored)".length)} (restored)`)
    expect(restored.name.length).toBe(80)
  })

  it("restores a note loose when its folder has gone", async () => {
    const books = await booksFolder()
    const note = await createNote(user.id, { folderId: books.id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: books.rating.key, value: 3 })
    await trashNotes(user.id, [note.id])
    await trashFolder(user.id, books.id)
    const restored = await restoreNote(user.id, note.id)
    expect(restored.folderId).toBeNull()
    expect(restored.values).toEqual({})
  })

  it("drops a note's reminders when it comes back loose, and keeps a folder's notes with the folder", async () => {
    const books = await folder("Books")
    const due = await createField(user.id, books, { name: "Finished", type: "date", options: [], remind: true })
    const alone = await createNote(user.id, { folderId: books })
    const withFolder = await createNote(user.id, { folderId: books })
    await setFieldValue(user.id, { noteId: alone.id, fieldKey: due.key, value: "2099-01-01", timeZone: "UTC" })
    await trashNotes(user.id, [alone.id])
    await trashFolder(user.id, books)
    await expect(restoreNote(user.id, withFolder.id)).rejects.toThrow(NOTES_SAY.restoreItsFolder)
    const restored = await restoreNote(user.id, alone.id)
    expect(restored.folderId).toBeNull()
    expect(await database.select().from(noteNoteReminders).where(eq(noteNoteReminders.noteId, alone.id))).toEqual([])
  })

  it("deletes for good what has been in Trash over 30 days, and nothing newer", async () => {
    const books = await folder("Books")
    const inFolder = await createNote(user.id, { folderId: books })
    const old = await createNote(user.id, { folderId: null })
    const fresh = await createNote(user.id, { folderId: null })
    await trashNotes(user.id, [old.id, fresh.id])
    await trashFolder(user.id, books)
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60_000)
    await database.update(noteNotes).set({ deletedAt: longAgo }).where(eq(noteNotes.id, old.id))
    await database.update(noteNoteFolders).set({ deletedAt: longAgo }).where(eq(noteNoteFolders.id, books))

    expect(await purgeOldTrash()).toBe(2)
    const left = await database.select({ id: noteNotes.id }).from(noteNotes)
    expect(left.map((row) => row.id)).toEqual([fresh.id])
    expect(await database.select().from(noteNoteFolders)).toEqual([])
    expect(inFolder.id).toBeDefined()
  })

  it("empties Trash at once on request", async () => {
    const books = await folder("Books")
    await createNote(user.id, { folderId: books })
    const loose = await createNote(user.id, { folderId: null })
    await trashNotes(user.id, [loose.id])
    await trashFolder(user.id, books)
    expect(await emptyTrash(user.id)).toEqual({ notes: 1, folders: 1 })
    expect((await listTree(user.id)).counts.trash).toBe(0)
  })
})

describe("folders inside folders", () => {
  it("refuses to put a folder inside its own child", async () => {
    const books = await folder("Books")
    const fiction = await folder("Fiction", books)
    await expect(moveFolder(user.id, books, { parentId: fiction, orderedIds: [books] })).rejects.toThrow(
      NOTES_SAY.folderIntoItself
    )
  })

  it("lets two folders share a name in different places, not side by side", async () => {
    const books = await folder("Books")
    await folder("Ideas")
    await expect(folder("Ideas", books)).resolves.toBeDefined()
    await expect(folder("IDEAS")).rejects.toThrow(NOTES_SAY.folderTaken)
  })
})

describe("reminders", () => {
  it("rings at 9:00 in the person's time zone, or at the date's own time", () => {
    expect(reminderDueAt("2026-10-20", "Europe/London")?.toISOString()).toBe("2026-10-20T08:00:00.000Z")
    expect(reminderDueAt("2026-12-20", "Europe/London")?.toISOString()).toBe("2026-12-20T09:00:00.000Z")
    expect(reminderDueAt("2026-10-20T14:30", "America/New_York")?.toISOString()).toBe("2026-10-20T18:30:00.000Z")
    expect(reminderDueAt("2026-10-20", "Asia/Tokyo")?.toISOString()).toBe("2026-10-20T00:00:00.000Z")
  })

  it("rings once in the bell when due, and never for a note in Trash", async () => {
    const id = await folder("Books")
    const due = await createField(user.id, id, { name: "Finished", type: "date", options: [], remind: true })
    const note = await createNote(user.id, { folderId: id, title: "Dune" })
    const binned = await createNote(user.id, { folderId: id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: due.key, value: "2099-01-01", timeZone: "UTC" })
    await setFieldValue(user.id, { noteId: binned.id, fieldKey: due.key, value: "2099-01-01", timeZone: "UTC" })
    expect(await database.select().from(noteNoteReminders)).toHaveLength(2)

    await trashNotes(user.id, [binned.id])
    await database.update(noteNoteReminders).set({ dueAt: new Date(Date.now() - 1000) })
    expect(await sendDueReminders()).toEqual({ sent: 1, full: false })
    expect(await sendDueReminders()).toEqual({ sent: 0, full: false })
    const links = await database.select().from(noteNoticeLinks)
    expect(links).toMatchObject([{ noteId: note.id, videoId: null }])

    await setFieldValue(user.id, { noteId: note.id, fieldKey: due.key, value: null })
    expect(await database.select().from(noteNoteReminders)).toHaveLength(0)
  })

  it("adds reminders for dates already filled in when Remind me is switched on", async () => {
    const id = await folder("Books")
    const due = await createField(user.id, id, { name: "Finished", type: "date", options: [], remind: false })
    const note = await createNote(user.id, { folderId: id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: due.key, value: "2099-03-01", timeZone: "UTC" })
    expect(await database.select().from(noteNoteReminders)).toHaveLength(0)
    await updateField(user.id, due.id, { name: "Finished", type: "date", options: [], remind: true }, "Asia/Tokyo")
    const [reminder] = await database.select().from(noteNoteReminders)
    expect(reminder.dueAt.toISOString()).toBe("2099-03-01T00:00:00.000Z")
    await updateField(user.id, due.id, { name: "Finished", type: "date", options: [], remind: false })
    expect(await database.select().from(noteNoteReminders)).toHaveLength(0)
  })

  it("sets no reminder for a date already past", async () => {
    const id = await folder("Books")
    const due = await createField(user.id, id, { name: "Finished", type: "date", options: [], remind: true })
    const note = await createNote(user.id, { folderId: id })
    await setFieldValue(user.id, { noteId: note.id, fieldKey: due.key, value: "2001-01-01", timeZone: "UTC" })
    expect(await database.select().from(noteNoteReminders)).toHaveLength(0)
  })
})

describe("AI suggestions", () => {
  it("keeps only suggestions that fit their field, choices by their own options", async () => {
    const books = await booksFolder()
    const tree = await listTree(user.id)
    const fields = tree.folders.find((each) => each.id === books.id)!.fields
    expect(
      readSuggestions(fields, {
        fields: [
          { name: "status", value: "done" },
          { name: "Rating", value: "4.5" },
          { name: "Mood", value: "happy" },
        ],
      })
    ).toEqual({ [books.status.key]: "o-done", [books.rating.key]: 4.5 })
    expect(
      readSuggestions(fields, {
        fields: [
          { name: "Status", value: "Abandoned" },
          { name: "Rating", value: "lots" },
        ],
      })
    ).toEqual({})
  })
})

describe("a note from a video", () => {
  it("copies the summary, the plan with its ticks and the quotes", () => {
    const body = videoNoteBody({
      summary: ["One", "Two"],
      actionPlan: [{ text: "Do it", done: true }],
      quotes: [{ text: "Said this" }],
    })
    const json = JSON.stringify(body)
    expect(json).toContain('"bulletList"')
    expect(json).toContain('"checked":true')
    expect(json).toContain('"blockquote"')
  })
})
