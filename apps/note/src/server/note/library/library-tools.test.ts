import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import * as storage from "@/server/media/storage"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { removeNoteFiles } from "@/server/note/library/files"
import { importLink, saveFromLink, saveHighlights } from "@/server/note/library/imports"
import {
  createFolder,
  createLibrary,
  createView,
  loadLibraryPage,
  markLibraryOpened,
  pinFolder,
  pinLibraryRowToCard,
} from "@/server/note/library/libraries"
import {
  createNote,
  deleteNoteForGood,
  deleteTag,
  duplicateNote,
  listLibraryQuotes,
  listNotes,
  listPlanSteps,
  renameAuthor,
  renameTag,
  savePlayedSeconds,
  setAuthor,
  setPriority,
  setTags,
  trashNotes,
} from "@/server/note/library/notes"
import { saveKeyFor } from "@/server/note/library/save-key"
import { noteNotes, noteViews } from "@/server/note/schema"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * The library tools of Tyler's task 02 on a real (in-memory) database:
 * sorting, pinned folders, renaming and merging tags and authors with the
 * saved views that name them, duplicates that share their files, the Plan
 * steps and Quotes lists, where a video was stopped, and the Save to Note
 * button taking every source.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser
let workspaceId: string
let libraryId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
  workspaceId = (await insertWorkspace(database)).id
  libraryId = (await createLibrary(user.id, { name: "Content ideas" })).id
  vi.spyOn(storage, "getPublicMediaUrl").mockImplementation(async (path) => `https://files.test/${path}`)
  vi.spyOn(storage, "deleteFromR2").mockResolvedValue(undefined)
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function note(title: string) {
  return (await createNote(user.id, { libraryId, folderId: null, title })).id
}

async function rowOf(id: string) {
  const [row] = await database.select().from(noteNotes).where(eq(noteNotes.id, id))
  return row
}

/** An imported video note whose file is saved, as the worker leaves it. */
async function savedVideo(url = "https://www.youtube.com/watch?v=jNQXAC9IVRw") {
  const imported = await importLink(user.id, { libraryId, url })
  const mediaId = uuid()
  const at = now()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: user.id,
    filename: `${mediaId}.mp4`,
    originalName: "video.mp4",
    fileSize: 1000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${mediaId}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  await database
    .update(noteNotes)
    .set({
      importStatus: "saved",
      title: "Me at the zoo",
      videoMediaId: mediaId,
      coverPath: `note-imports/${user.id}/${imported.note.id}/cover.jpg`,
      transcript: [
        { startMs: 0, endMs: 4000, text: "All right, so here we are in front of the elephants" },
        { startMs: 4000, endMs: 9000, text: "the cool thing about these guys is that they have really long trunks" },
      ],
      quotes: [{ text: "they have really long trunks", startMs: 4000 }],
      actionPlan: [
        { text: "Visit the zoo", done: false },
        { text: "Look at the trunks", done: true },
      ],
    })
    .where(eq(noteNotes.id, imported.note.id))
  return { id: imported.note.id, mediaId, storagePath: `${user.id}/${mediaId}.mp4` }
}

describe("sorting the notes table", () => {
  it("puts High first, keeps pinned notes as their own group, and turns round on a second click", async () => {
    const low = await note("Low one")
    const high = await note("High one")
    const normal = await note("Normal one")
    const pinnedLow = await note("Pinned low")
    await setPriority(user.id, [low, pinnedLow], "low")
    await setPriority(user.id, [high], "high")
    await database.update(noteNotes).set({ pinnedAt: now() }).where(eq(noteNotes.id, pinnedLow))

    const highFirst = await listNotes(user.id, { libraryId, scope: "all", sort: { column: "priority", descending: true } })
    expect(highFirst.notes.map((each) => each.id)).toEqual([pinnedLow, high, normal, low])

    const lowFirst = await listNotes(user.id, { libraryId, scope: "all", sort: { column: "priority", descending: false } })
    expect(lowFirst.notes.map((each) => each.id)).toEqual([pinnedLow, low, normal, high])

    const byTitle = await listNotes(user.id, { libraryId, scope: "all", sort: { column: "title", descending: false } })
    expect(byTitle.notes.map((each) => each.title)).toEqual(["Pinned low", "High one", "Low one", "Normal one"])
  })

  it("reads Plan steps and Quotes as All notes", async () => {
    await note("One")
    const all = await listNotes(user.id, { libraryId, scope: "all" })
    const steps = await listNotes(user.id, { libraryId, scope: "steps" })
    expect(steps.notes.map((each) => each.id)).toEqual(all.notes.map((each) => each.id))
  })
})

describe("pinned folders", () => {
  it("pins and unpins a folder, and the page says when", async () => {
    const folder = await createFolder(user.id, libraryId, "Hooks")
    await pinFolder(user.id, folder.id, true)
    const pinned = await loadLibraryPage(user.id, libraryId)
    expect(pinned.folders[0].pinnedAt).not.toBeNull()
    await pinFolder(user.id, folder.id, false)
    expect((await loadLibraryPage(user.id, libraryId)).folders[0].pinnedAt).toBeNull()
  })

  it("pins the LIBRARY card's own rows in the order pinned, once each", async () => {
    await pinLibraryRowToCard(user.id, libraryId, "trash", true)
    await pinLibraryRowToCard(user.id, libraryId, "all", true)
    await pinLibraryRowToCard(user.id, libraryId, "trash", true)
    const page = await loadLibraryPage(user.id, libraryId)
    expect(page.pinnedRows.map((each) => each.row)).toEqual(["trash", "all"])
    await pinLibraryRowToCard(user.id, libraryId, "trash", false)
    expect((await loadLibraryPage(user.id, libraryId)).pinnedRows.map((each) => each.row)).toEqual(["all"])
    await expect(pinLibraryRowToCard(other.id, libraryId, "loose", true)).rejects.toThrow(LIBRARY_SAYS.libraryNotFound)
  })

  it("will not pin another person's folder", async () => {
    const folder = await createFolder(user.id, libraryId, "Hooks")
    await expect(pinFolder(other.id, folder.id, true)).rejects.toThrow(LIBRARY_SAYS.folderNotFound)
  })
})

describe("renaming tags and authors across a library", () => {
  it("renames a tag on every note and in the views that filter on it", async () => {
    const one = await note("One")
    const two = await note("Two")
    await setTags(user.id, one, ["hook"])
    await setTags(user.id, two, ["hook", "money"])
    await createView(user.id, libraryId, { name: "Hooks", filters: { tag: "hook" } })

    expect(await renameTag(user.id, libraryId, "hook", "Hooks")).toEqual({ notes: 2 })
    expect((await rowOf(one)).tags).toEqual(["hooks"])
    expect((await rowOf(two)).tags).toEqual(["hooks", "money"])
    const [view] = await database.select().from(noteViews).where(eq(noteViews.libraryId, libraryId))
    expect(view.filters).toEqual({ tag: "hooks" })
  })

  it("merges into a tag already there, each note keeping it once", async () => {
    const one = await note("One")
    await setTags(user.id, one, ["hook", "hooks"])
    await renameTag(user.id, libraryId, "hook", "hooks")
    expect((await rowOf(one)).tags).toEqual(["hooks"])
  })

  it("refuses the same name, and leaves another person's library alone", async () => {
    await expect(renameTag(user.id, libraryId, "hook", "Hook")).rejects.toThrow(LIBRARY_SAYS.sameName)
    await expect(renameTag(other.id, libraryId, "hook", "hooks")).rejects.toThrow(LIBRARY_SAYS.libraryNotFound)
  })

  it("deletes a tag from every note", async () => {
    const one = await note("One")
    await setTags(user.id, one, ["hook", "money"])
    expect(await deleteTag(user.id, libraryId, "hook")).toEqual({ notes: 1 })
    expect((await rowOf(one)).tags).toEqual(["money"])
  })

  it("renames an author on every note, so two names become one row", async () => {
    const one = await note("One")
    const two = await note("Two")
    await setAuthor(user.id, one, { name: "MKBHD", handle: "mkbhd" })
    await setAuthor(user.id, two, { name: "Marques Brownlee", handle: null })
    await createView(user.id, libraryId, { name: "His", filters: { author: "mkbhd" } })

    expect(await renameAuthor(user.id, libraryId, "mkbhd", "Marques Brownlee")).toEqual({ notes: 1 })
    expect((await rowOf(one)).authorName).toBe("Marques Brownlee")
    expect((await rowOf(one)).authorHandle).toBe("mkbhd")
    const page = await loadLibraryPage(user.id, libraryId)
    expect(page.authors).toHaveLength(1)
    expect(page.authors[0].count).toBe(2)
    const [view] = await database.select().from(noteViews).where(eq(noteViews.libraryId, libraryId))
    expect(view.filters).toEqual({ author: "Marques Brownlee" })
  })

  it("refuses an empty author name", async () => {
    await expect(renameAuthor(user.id, libraryId, "mkbhd", "  ")).rejects.toThrow(LIBRARY_SAYS.authorEmpty)
  })
})

describe("duplicating a note", () => {
  it("copies an import with its cards and ticks, and shares its saved file", async () => {
    const video = await savedVideo()
    const copy = await duplicateNote(user.id, video.id)
    const row = await rowOf(copy.id)
    expect(copy.title).toBe("Copy of Me at the zoo")
    expect(copy.folderId).toBe((await rowOf(video.id)).folderId)
    expect(row.videoMediaId).toBe(video.mediaId)
    expect(row.actionPlan).toEqual([
      { text: "Visit the zoo", done: false },
      { text: "Look at the trunks", done: true },
    ])
    // The link stays one note in this library.
    expect(row.platformId).toBeNull()
  })

  it("keeps the file while the copy uses it, and deletes it with the last of the two", async () => {
    const video = await savedVideo()
    const copy = await duplicateNote(user.id, video.id)
    const deleted = vi.mocked(storage.deleteFromR2)

    await trashNotes(user.id, [copy.id])
    await deleteNoteForGood(user.id, copy.id)
    expect(deleted).not.toHaveBeenCalled()
    const [media] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, video.mediaId))
    expect(media).toBeDefined()

    const original = await rowOf(video.id)
    await removeNoteFiles(original)
    expect(deleted).toHaveBeenCalledWith(video.storagePath)
    const [gone] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, video.mediaId))
    expect(gone).toBeUndefined()
  })

  it("into another library goes into its source's folder and keeps the site's id there", async () => {
    const video = await savedVideo()
    const elsewhere = (await createLibrary(user.id, { name: "Archive" })).id
    const copy = await duplicateNote(user.id, video.id, elsewhere)
    expect(copy.libraryId).toBe(elsewhere)
    expect(copy.folderName).toBe("YouTube long")
    expect((await rowOf(copy.id)).platformId).toBe("jNQXAC9IVRw")
  })

  it("waits for an import to finish, and never copies another person's note", async () => {
    const waiting = await importLink(user.id, { libraryId, url: "https://www.youtube.com/watch?v=abcdefghijk" })
    await expect(duplicateNote(user.id, waiting.note.id)).rejects.toThrow(LIBRARY_SAYS.notImported)
    await expect(duplicateNote(other.id, waiting.note.id)).rejects.toThrow(LIBRARY_SAYS.noteNotFound)
  })
})

describe("Plan steps and Quotes", () => {
  it("lists every plan and every quote, with highlighted transcript lines after the quotes", async () => {
    const video = await savedVideo()
    await saveHighlights(user.id, video.id, [{ part: "line-0", start: 11, end: 25 }])
    const groups = await listPlanSteps(user.id, libraryId)
    expect(groups).toEqual([
      {
        noteId: video.id,
        title: "Me at the zoo",
        steps: [
          { text: "Visit the zoo", done: false },
          { text: "Look at the trunks", done: true },
        ],
      },
    ])
    const quotes = await listLibraryQuotes(user.id, libraryId)
    expect(quotes.map((quote) => [quote.kind, quote.text, quote.startMs])).toEqual([
      ["quote", "they have really long trunks", 4000],
      ["highlight", "so here we are", 0],
    ])
  })

  it("leaves out Archived and Trash", async () => {
    const video = await savedVideo()
    await trashNotes(user.id, [video.id])
    expect(await listPlanSteps(user.id, libraryId)).toEqual([])
    expect(await listLibraryQuotes(user.id, libraryId)).toEqual([])
  })
})

describe("where a video was stopped", () => {
  it("is saved without moving the note's Edited time, and an odd value is refused", async () => {
    const video = await savedVideo()
    const before = (await rowOf(video.id)).updatedAt
    await savePlayedSeconds(user.id, video.id, 150)
    const row = await rowOf(video.id)
    expect(row.playedSeconds).toBe(150)
    expect(row.updatedAt).toEqual(before)
    await expect(savePlayedSeconds(user.id, video.id, -3)).rejects.toThrow(LIBRARY_SAYS.playedOutOfRange)
    await expect(savePlayedSeconds(other.id, video.id, 10)).rejects.toThrow(LIBRARY_SAYS.noteNotFound)
  })
})

describe("Save to Note", () => {
  it("saves a YouTube, a Reddit and an X link into the library opened last, each in its own folder", async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY ??= "a".repeat(64)
    await markLibraryOpened(user.id, libraryId)
    const key = saveKeyFor(user.id)
    const youtube = await saveFromLink(user.id, "https://youtu.be/jNQXAC9IVRw", key)
    const reddit = await saveFromLink(user.id, "https://www.reddit.com/r/videos/comments/1abc2de/a_title/", key)
    const x = await saveFromLink(user.id, "https://x.com/naval/status/1002103360646823936", key)
    expect([youtube.note.folderName, reddit.note.folderName, x.note.folderName]).toEqual([
      "YouTube long",
      "Reddit",
      "X/Twitter",
    ])
    expect(reddit.note.libraryId).toBe(libraryId)
  })

  it("refuses another person's key", async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY ??= "a".repeat(64)
    await expect(saveFromLink(user.id, "https://youtu.be/jNQXAC9IVRw", saveKeyFor(other.id))).rejects.toThrow(
      LIBRARY_SAYS.saveKeyWrong
    )
  })
})

describe("the left panel's counts", () => {
  it("counts unticked plan steps and every quote and highlighted line", async () => {
    const video = await savedVideo()
    await saveHighlights(user.id, video.id, [{ part: "line-1", start: 4, end: 9 }])
    const page = await loadLibraryPage(user.id, libraryId)
    expect(page.counts.openSteps).toBe(1)
    expect(page.counts.quotes).toBe(2)
  })
})
