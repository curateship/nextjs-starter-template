import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { filtersSchema, idSchema, idsSchema } from "./library"
import { userGet, userPost } from "@/server/guards"
import {
  addTagToNotes,
  archiveNotes,
  createNote,
  deleteNoteForGood,
  emptyTrash,
  listNotes,
  listVersions,
  loadNote,
  loadVersion,
  moveToFolder,
  moveToLibrary,
  noteTitles,
  pinNotes,
  removeTagFromNotes,
  restoreNote,
  restoreVersion,
  saveNote,
  setAuthor,
  setPriority,
  setTags,
  trashNotes,
} from "@/server/note/library/notes"
import {
  AUTHOR_HANDLE_MAX,
  AUTHOR_NAME_MAX,
  FIXED_SCOPES,
  LIBRARY_SAYS,
  NOTE_PRIORITIES,
  NOTE_TITLE_MAX,
  TAG_MAX,
  TAGS_PER_NOTE,
  type BulkOutcome,
  type NoteCard,
  type NoteDetail,
  type NoteFilters,
  type NoteList,
  type NotePriority,
  type NoteTitle,
  type NoteVersion,
  type NoteVersionSummary,
} from "@/lib/note/library/notes"

/**
 * Notes in a library, for the member who wrote or imported them. Each
 * function passes on only the id the session resolved to, so every query is
 * that person's own. Refusals are said with `getLibraryErrorMessage`.
 */

/** Whether a refused save was refused because another tab saved first. */
export function isChangedElsewhere(error: unknown) {
  return error instanceof Error && error.message.includes(LIBRARY_SAYS.changedElsewhere)
}

const scope = z.union([z.enum(FIXED_SCOPES), idSchema])
/** The editor's document. Its shape is checked on the server by `cleanNoteBody`. */
const body = z.record(z.string(), z.unknown())
const tag = z.string().min(1).max(TAG_MAX * 2)

// ---------------------------------------------------------------------------
// Reading

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({ libraryId: idSchema, scope, search: z.string().max(200).optional(), filters: filtersSchema.optional() })
  )
  .handler(async ({ data, context }): Promise<NoteList> => listNotes(context.user.id, data))

export function loadNotes(data: { libraryId: string; scope: string; search?: string; filters?: NoteFilters }) {
  return listFn({ data })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema, open: z.boolean() }))
  .handler(async ({ data, context }): Promise<NoteDetail> => loadNote(context.user.id, data.id, { open: data.open }))

/**
 * Everything the right panel shows about one note. A POST because opening a
 * note marks it as just opened, which is what Recently opened reads.
 */
export function loadNoteDetail(noteId: string, open = true) {
  return readFn({ data: { id: noteId, open } })
}

const titlesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ libraryId: idSchema, search: z.string().max(200).optional(), exceptId: idSchema.optional() }))
  .handler(async ({ data, context }): Promise<NoteTitle[]> => noteTitles(context.user.id, data))

/** Note titles in the same library, for the "[[" picker. */
export function findNoteTitles(libraryId: string, search: string, exceptId?: string) {
  return titlesFn({ data: { libraryId, search, exceptId } })
}

// ---------------------------------------------------------------------------
// Writing

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      libraryId: idSchema,
      folderId: idSchema.nullable(),
      templateId: idSchema.nullable().optional(),
      title: z.string().max(NOTE_TITLE_MAX * 2).optional(),
      body: body.optional(),
      priority: z.enum(NOTE_PRIORITIES).optional(),
      tags: z.array(tag).max(TAGS_PER_NOTE * 2).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<NoteDetail> => createNote(context.user.id, data))

export function createNoteIn(data: {
  libraryId: string
  folderId: string | null
  templateId?: string | null
  title?: string
  body?: Record<string, unknown>
  priority?: NotePriority
  tags?: string[]
}) {
  return createFn({ data })
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      id: idSchema,
      revision: z.number().int().min(0),
      title: z.string().max(NOTE_TITLE_MAX * 2).optional(),
      body: body.optional(),
    })
  )
  .handler(async ({ data, context }) => saveNote(context.user.id, data))

/** Saves the title or text that changed. Refused when another tab saved first. */
export function saveNoteChanges(data: { id: string; revision: number; title?: string; body?: Record<string, unknown> }) {
  return saveFn({ data })
}

const tagsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema, tags: z.array(tag).max(TAGS_PER_NOTE * 2) }))
  .handler(async ({ data, context }): Promise<NoteCard> => setTags(context.user.id, data.id, data.tags))

export function saveNoteTags(id: string, tags: string[]) {
  return tagsFn({ data: { id, tags } })
}

const authorFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      id: idSchema,
      name: z.string().max(AUTHOR_NAME_MAX * 2),
      handle: z.string().max(AUTHOR_HANDLE_MAX * 2).nullable(),
    })
  )
  .handler(async ({ data, context }): Promise<NoteCard> => setAuthor(context.user.id, data.id, data))

export function saveNoteAuthor(id: string, name: string, handle: string | null) {
  return authorFn({ data: { id, name, handle } })
}

// ---------------------------------------------------------------------------
// One change to many notes

const bulkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("pin"), ids: idsSchema, on: z.boolean() }),
      z.object({ change: z.literal("archive"), ids: idsSchema, on: z.boolean() }),
      z.object({ change: z.literal("trash"), ids: idsSchema }),
      z.object({ change: z.literal("priority"), ids: idsSchema, priority: z.enum(NOTE_PRIORITIES) }),
      z.object({ change: z.literal("addTag"), ids: idsSchema, tag }),
      z.object({ change: z.literal("removeTag"), ids: idsSchema, tag }),
      z.object({ change: z.literal("folder"), ids: idsSchema, folderId: idSchema.nullable() }),
    ])
  )
  .handler(async ({ data, context }): Promise<BulkOutcome> => {
    const owner = context.user.id
    switch (data.change) {
      case "pin":
        return pinNotes(owner, data.ids, data.on)
      case "archive":
        return archiveNotes(owner, data.ids, data.on)
      case "trash":
        return trashNotes(owner, data.ids)
      case "priority":
        return setPriority(owner, data.ids, data.priority)
      case "addTag":
        return addTagToNotes(owner, data.ids, data.tag)
      case "removeTag":
        return removeTagFromNotes(owner, data.ids, data.tag)
      case "folder":
        return moveToFolder(owner, data.ids, data.folderId)
    }
  })

export type NoteChange =
  | { change: "pin"; on: boolean }
  | { change: "archive"; on: boolean }
  | { change: "trash" }
  | { change: "priority"; priority: NotePriority }
  | { change: "addTag"; tag: string }
  | { change: "removeTag"; tag: string }
  | { change: "folder"; folderId: string | null }

/** One change to one note or many, in one request. */
export function changeNotes(ids: string[], change: NoteChange) {
  return bulkFn({ data: { ...change, ids } })
}

const moveLibraryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids: idsSchema, libraryId: idSchema }))
  .handler(async ({ data, context }) => moveToLibrary(context.user.id, data.ids, data.libraryId))

export function moveNotesToLibrary(ids: string[], libraryId: string) {
  return moveLibraryFn({ data: { ids, libraryId } })
}

// ---------------------------------------------------------------------------
// Trash

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }): Promise<NoteCard> => restoreNote(context.user.id, data.id))

export function restoreNoteFromTrash(id: string) {
  return restoreFn({ data: { id } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }) => deleteNoteForGood(context.user.id, data.id))

export function deleteNoteNow(id: string) {
  return deleteFn({ data: { id } })
}

const emptyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ libraryId: idSchema }))
  .handler(async ({ data, context }) => emptyTrash(context.user.id, data.libraryId))

export function emptyLibraryTrash(libraryId: string) {
  return emptyFn({ data: { libraryId } })
}

// ---------------------------------------------------------------------------
// History

const versionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ noteId: idSchema }))
  .handler(async ({ data, context }): Promise<NoteVersionSummary[]> => listVersions(context.user.id, data.noteId))

export function loadNoteVersions(noteId: string) {
  return versionsFn({ data: { noteId } })
}

const versionFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ noteId: idSchema, versionId: idSchema }))
  .handler(
    async ({ data, context }): Promise<NoteVersion> => loadVersion(context.user.id, data.noteId, data.versionId)
  )

export function loadNoteVersion(noteId: string, versionId: string) {
  return versionFn({ data: { noteId, versionId } })
}

const restoreVersionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: idSchema, versionId: idSchema }))
  .handler(async ({ data, context }): Promise<NoteDetail> => restoreVersion(context.user.id, data))

export function restoreNoteVersion(noteId: string, versionId: string) {
  return restoreVersionFn({ data: { noteId, versionId } })
}
