import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { analyseNote, importLink, removeImport, savePlan } from "@/server/note/library/imports"
import {
  createFolder,
  createLibrary,
  deleteFolder,
  deleteLibrary,
  libraryForSaving,
  loadLibraryPage,
  markLibraryOpened,
} from "@/server/note/library/libraries"
import {
  createNote,
  listNotes,
  moveToLibrary,
  purgeOldTrash,
  restoreNote,
  saveNote,
  setAuthor,
  setTags,
  trashNotes,
  unlinkOtherLibraries,
} from "@/server/note/library/notes"
import { noteLinks, noteNotes } from "@/server/note/schema"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * Libraries on a real (in-memory) database: imports filed in their source's
 * folder, the same link once per library, the fixed fields, moving between
 * libraries, authors grouped by name, Trash, and that one person never sees
 * another's notes.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const SHORT = "https://www.youtube.com/shorts/aqz-KE-bpKQ"
const LONG = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
const POST = "https://x.com/naval/status/1002103360646823936"

async function library(name = "Content ideas") {
  return (await createLibrary(user.id, { name })).id
}

describe("importing a link", () => {
  it("makes the note at once in a folder named after its source, made the first time", async () => {
    const id = await library()
    const first = await importLink(user.id, { libraryId: id, url: SHORT })
    const second = await importLink(user.id, { libraryId: id, url: "https://www.youtube.com/shorts/abcDEF12345" })
    expect(first.note.title).toBe("Importing…")
    expect(first.note.source).toBe("youtube_short")
    expect(first.note.importStatus).toBe("waiting")
    expect(first.note.folderName).toBe("YouTube short")
    expect(second.note.folderId).toBe(first.note.folderId)
    const page = await loadLibraryPage(user.id, id)
    expect(page.folders.map((folder) => folder.name)).toEqual(["YouTube short"])
  })

  it("keeps using a source's folder after it is renamed, and takes over one made by hand", async () => {
    const id = await library()
    const made = await createFolder(user.id, id, "X/Twitter")
    const post = await importLink(user.id, { libraryId: id, url: POST })
    expect(post.note.folderId).toBe(made.id)
  })

  it("hands back the note already there when the same link comes twice", async () => {
    const id = await library()
    const first = await importLink(user.id, { libraryId: id, url: LONG })
    const again = await importLink(user.id, { libraryId: id, url: "https://youtu.be/jNQXAC9IVRw" })
    expect(again.alreadyThere).toBe(true)
    expect(again.note.id).toBe(first.note.id)
  })

  it("lets the same link sit in two libraries", async () => {
    const one = await library("One")
    const two = await library("Two")
    const first = await importLink(user.id, { libraryId: one, url: LONG })
    const second = await importLink(user.id, { libraryId: two, url: LONG })
    expect(second.alreadyThere).toBe(false)
    expect(second.note.id).not.toBe(first.note.id)
  })

  it("refuses a link from anywhere else, and another person's library", async () => {
    const id = await library()
    await expect(importLink(user.id, { libraryId: id, url: "https://vimeo.com/1" })).rejects.toThrow(LIBRARY_SAYS.notALink)
    await expect(importLink(other.id, { libraryId: id, url: LONG })).rejects.toThrow(LIBRARY_SAYS.libraryNotFound)
  })

  it("turns the note back into a plain note when the video is removed, keeping its text", async () => {
    const id = await library()
    const { note } = await importLink(user.id, { libraryId: id, url: LONG })
    await database
      .update(noteNotes)
      .set({ importStatus: "saved", title: "Me at the zoo", authorName: "jawed", summary: ["A zoo"] })
      .where(eq(noteNotes.id, note.id))
    const kept = await removeImport(user.id, note.id)
    expect(kept.source).toBe("note")
    expect(kept.title).toBe("Me at the zoo")
    expect(kept.authorName).toBeNull()
    expect(kept.summary).toEqual([])
    expect(kept.sourceUrl).toBeNull()
  })
})

describe("importing a link already in this library", () => {
  it("brings a note in Trash back out", async () => {
    const id = await library()
    const { note } = await importLink(user.id, { libraryId: id, url: LONG })
    await trashNotes(user.id, [note.id])
    const again = await importLink(user.id, { libraryId: id, url: LONG })
    expect(again).toMatchObject({ alreadyThere: true, restored: true })
    expect(again.note.id).toBe(note.id)
    expect(again.note.deletedAt).toBeNull()
  })
})

describe("One plan from many that failed", () => {
  it("can be written again, where before it was refused as not an import", async () => {
    const id = await library()
    const merged = await createNote(user.id, { libraryId: id, folderId: null, title: "Plan from 2 notes" })
    await database
      .update(noteNotes)
      .set({ mergedFrom: ["a", "b"], analyseStatus: "failed", analyseError: "Gemini was busy" })
      .where(eq(noteNotes.id, merged.id))
    // Past the refusal, the next check is the Gemini key, which a test has none of.
    await expect(analyseNote(user.id, merged.id)).rejects.toThrow(LIBRARY_SAYS.noGeminiKey)
    await database.update(noteNotes).set({ analyseStatus: "ready" }).where(eq(noteNotes.id, merged.id))
    await expect(analyseNote(user.id, merged.id)).rejects.toThrow(LIBRARY_SAYS.notAnImport)
  })
})

describe("a note's fixed fields", () => {
  it("starts Normal with no tags, and keeps tags lowercased and once each", async () => {
    const id = await library()
    const note = await createNote(user.id, { libraryId: id, folderId: null, title: "Hooks" })
    expect(note.priority).toBe("normal")
    expect(note.source).toBe("note")
    const card = await setTags(user.id, note.id, ["Hooks", "hooks", " Reels "])
    expect(card.tags).toEqual(["hooks", "reels"])
    await expect(setTags(user.id, note.id, Array.from({ length: 26 }, (_, n) => `t${n}`))).rejects.toThrow(
      LIBRARY_SAYS.tooManyTags
    )
  })

  it("refuses a stale save of the text", async () => {
    const id = await library()
    const note = await createNote(user.id, { libraryId: id, folderId: null })
    await saveNote(user.id, { id: note.id, revision: note.revision, title: "First" })
    await expect(saveNote(user.id, { id: note.id, revision: note.revision, title: "Second" })).rejects.toThrow(
      LIBRARY_SAYS.changedElsewhere
    )
  })
})

describe("the list", () => {
  it("shows only this library's notes, and finds them by tag, priority, source and author", async () => {
    const id = await library()
    const elsewhere = await library("Elsewhere")
    const a = await createNote(user.id, { libraryId: id, folderId: null, title: "A", priority: "high", tags: ["hooks"] })
    await createNote(user.id, { libraryId: id, folderId: null, title: "B" })
    await createNote(user.id, { libraryId: elsewhere, folderId: null, title: "C" })
    await setAuthor(user.id, a.id, { name: "Marques Brownlee", handle: "mkbhd" })

    const all = await listNotes(user.id, { libraryId: id, scope: "all" })
    expect(all.notes.map((note) => note.title).sort()).toEqual(["A", "B"])
    const titles = async (filters: object) =>
      (await listNotes(user.id, { libraryId: id, scope: "all", filters })).notes.map((note) => note.title)
    expect(await titles({ tag: "hooks" })).toEqual(["A"])
    expect(await titles({ priority: "high" })).toEqual(["A"])
    expect(await titles({ source: "note" })).toHaveLength(2)
    expect(await titles({ author: "marques  brownlee" })).toEqual(["A"])
    await expect(listNotes(other.id, { libraryId: id, scope: "all" })).rejects.toThrow(LIBRARY_SAYS.libraryNotFound)
  })

  it("finds a plan's progress", async () => {
    const id = await library()
    const { note } = await importLink(user.id, { libraryId: id, url: LONG })
    await database.update(noteNotes).set({ actionPlan: [{ text: "Do it", done: false }] }).where(eq(noteNotes.id, note.id))
    await savePlan(user.id, note.id, [
      { text: "Do it", done: true },
      { text: "Then this", done: false },
    ])
    const found = await listNotes(user.id, { libraryId: id, scope: "all", filters: { progress: "in_progress" } })
    expect(found.notes.map((each) => each.id)).toEqual([note.id])
  })
})

describe("authors", () => {
  it("group by name, so two accounts edited to one name are one row", async () => {
    const id = await library()
    const video = await createNote(user.id, { libraryId: id, folderId: null, title: "Video" })
    const post = await createNote(user.id, { libraryId: id, folderId: null, title: "Post" })
    await setAuthor(user.id, video.id, { name: "MKBHD", handle: null })
    await setAuthor(user.id, post.id, { name: "Marques Brownlee", handle: "@mkbhd" })
    expect((await loadLibraryPage(user.id, id)).authors.map((author) => author.count)).toEqual([1, 1])

    await setAuthor(user.id, video.id, { name: " marques\u00a0brownlee\t", handle: null })
    const authors = (await loadLibraryPage(user.id, id)).authors
    expect(authors).toHaveLength(1)
    expect(authors[0]).toMatchObject({ key: "marques brownlee", count: 2 })
    // The odd spaces were made plain on the way in, so the card's row finds both notes.
    const found = await listNotes(user.id, { libraryId: id, scope: "all", filters: { author: "Marques Brownlee" } })
    expect(found.notes).toHaveLength(2)
  })
})

describe("moving to another library", () => {
  it("files an import in that library's folder for its source and leaves a plain note loose", async () => {
    const from = await library("From")
    const to = await library("To")
    const { note: imported } = await importLink(user.id, { libraryId: from, url: SHORT })
    const plain = await createNote(user.id, { libraryId: from, folderId: null, title: "Plain" })
    const moved = await moveToLibrary(user.id, [imported.id, plain.id], to)
    expect(moved.done.sort()).toEqual([imported.id, plain.id].sort())
    const there = await listNotes(user.id, { libraryId: to, scope: "all" })
    expect(there.notes.find((note) => note.id === imported.id)?.folderName).toBe("YouTube short")
    expect(there.notes.find((note) => note.id === plain.id)?.folderId).toBeNull()
  })

  it("skips a link the other library already has", async () => {
    const from = await library("From")
    const to = await library("To")
    const { note } = await importLink(user.id, { libraryId: from, url: LONG })
    await importLink(user.id, { libraryId: to, url: LONG })
    const moved = await moveToLibrary(user.id, [note.id], to)
    expect(moved.done).toEqual([])
    expect(moved.alreadyThere).toBe(1)
  })

  it("turns a [[ link to a note left behind into plain text", async () => {
    const from = await library("From")
    const to = await library("To")
    const target = await createNote(user.id, { libraryId: from, folderId: null, title: "Stays" })
    const body = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "noteLink", attrs: { id: target.id, label: "Stays" } }] }],
    }
    const mover = await createNote(user.id, { libraryId: from, folderId: null, title: "Moves", body })
    expect(await database.select().from(noteLinks).where(eq(noteLinks.fromNoteId, mover.id))).toHaveLength(1)
    await moveToLibrary(user.id, [mover.id], to)
    const [row] = await database.select().from(noteNotes).where(eq(noteNotes.id, mover.id))
    expect(JSON.stringify(row.body)).not.toContain("noteLink")
    expect(row.bodyText).toContain("Stays")
    expect(await database.select().from(noteLinks).where(eq(noteLinks.fromNoteId, mover.id))).toHaveLength(0)
  })

  it("turns a link to a note skipped for its twin into plain text too", async () => {
    const from = await library("From")
    const to = await library("To")
    const { note: skipped } = await importLink(user.id, { libraryId: from, url: LONG })
    await importLink(user.id, { libraryId: to, url: LONG })
    const body = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "noteLink", attrs: { id: skipped.id, label: "The zoo" } }] }],
    }
    const mover = await createNote(user.id, { libraryId: from, folderId: null, title: "Moves", body })
    const moved = await moveToLibrary(user.id, [mover.id, skipped.id], to)
    expect(moved).toMatchObject({ done: [mover.id], alreadyThere: 1 })
    const [row] = await database.select().from(noteNotes).where(eq(noteNotes.id, mover.id))
    expect(JSON.stringify(row.body)).not.toContain("noteLink")
  })

  it("keeps a link between two notes that move together", () => {
    const body = { type: "doc", content: [{ type: "noteLink", attrs: { id: "b", label: "B" } }] }
    expect(unlinkOtherLibraries(body, new Set(["a", "b"]))).toEqual(body)
  })
})

describe("folders, Trash and libraries", () => {
  it("sends a deleted folder's notes to Trash, and restores them loose", async () => {
    const id = await library()
    const folder = await createFolder(user.id, id, "Hooks")
    const note = await createNote(user.id, { libraryId: id, folderId: folder.id, title: "In it" })
    expect((await deleteFolder(user.id, folder.id)).notes).toBe(1)
    expect((await listNotes(user.id, { libraryId: id, scope: "trash" })).notes.map((each) => each.id)).toEqual([note.id])
    const back = await restoreNote(user.id, note.id)
    expect(back.deletedAt).toBeNull()
    expect(back.folderId).toBeNull()
  })

  it("clears Trash over 30 days old and keeps what is newer", async () => {
    const id = await library()
    const old = await createNote(user.id, { libraryId: id, folderId: null, title: "Old" })
    const fresh = await createNote(user.id, { libraryId: id, folderId: null, title: "Fresh" })
    await trashNotes(user.id, [old.id, fresh.id])
    await database
      .update(noteNotes)
      .set({ deletedAt: new Date(now().getTime() - 31 * 24 * 60 * 60_000) })
      .where(eq(noteNotes.id, old.id))
    expect(await purgeOldTrash()).toBe(1)
    const left = await database.select({ id: noteNotes.id }).from(noteNotes)
    expect(left.map((row) => row.id)).toEqual([fresh.id])
  })

  it("deletes a library with its notes, and refuses another person", async () => {
    const id = await library()
    await createNote(user.id, { libraryId: id, folderId: null, title: "Gone" })
    await expect(deleteLibrary(other.id, id)).rejects.toThrow(LIBRARY_SAYS.libraryNotFound)
    expect((await deleteLibrary(user.id, id)).notes).toBe(1)
    expect(await database.select().from(noteNotes)).toHaveLength(0)
  })

  it("saves from x.com into the library opened last, or a new My library", async () => {
    const madeFirst = await libraryForSaving(user.id)
    const page = await loadLibraryPage(user.id, madeFirst)
    expect(page.library.name).toBe("My library")
    const second = await library("Second")
    await markLibraryOpened(user.id, second)
    expect(await libraryForSaving(user.id)).toBe(second)
  })
})
