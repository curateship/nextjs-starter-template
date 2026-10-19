import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { userGet, userPost } from "@/server/guards"
import {
  archiveNotes,
  createNote,
  deleteNoteForGood,
  emptyTrash,
  linkNoteVideo,
  listNotes,
  listVersions,
  loadNote,
  loadVersion,
  moveNotes,
  noteFromVideo,
  noteTitles,
  pinNotes,
  previewMove,
  recentNotes,
  restoreNote,
  restoreVersion,
  saveNote,
  setFieldOnNotes,
  setFieldValue,
  trashNotes,
  type BulkOutcome,
} from "@/server/note/notes/notes"
import { suggestFields } from "@/server/note/notes/suggest"
import { BODY_SAYS } from "@/lib/note/notes/body"
import { FIELDS_SAY, MAX_FIELDS_PER_FOLDER, VALUE_SAYS, type NoteFieldValues } from "@/lib/note/notes/fields"
import { VIEWS_SAY } from "@/lib/note/notes/views"
import {
  NOTE_SCOPES,
  NOTE_TITLE_MAX,
  NOTES_SAY,
  type NoteCard,
  type NoteDetail,
  type NoteList,
  type NoteTitle,
  type NoteVersion,
  type NoteVersionSummary,
} from "@/lib/note/notes/notes"

/**
 * Written notes, for the member who wrote them. Open to every signed-in
 * member, like Videos (Tyler, 18 Oct 2026), and each function passes on only
 * the id the session resolved to, so every query is that person's own.
 */

const sentences = [NOTES_SAY, FIELDS_SAY, VALUE_SAYS, BODY_SAYS, VIEWS_SAY].flatMap((group) => Object.values(group))

const describe = createErrorMessage(
  {
    ...Object.fromEntries(sentences.map((sentence) => [sentence, sentence])),
    AI_LIMIT_REACHED: NOTES_SAY.aiLimitReached,
    SECRET_UNREADABLE: NOTES_SAY.geminiKeyUnreadable,
    ENCRYPTION_NOT_CONFIGURED: NOTES_SAY.geminiKeyUnreadable,
    "Google is turning requests away": "Google is turning requests away right now. Wait a minute and try again.",
    "free allowance for today": "This Gemini key's free allowance for today is used up. It resets tomorrow.",
    "Suggesting fields": "The AI could not be reached. Try again in a moment.",
  },
  "That did not work. Try again in a moment."
)

export function getNotesErrorMessage(error: unknown) {
  return describe(error)
}

/** Whether a refused save was refused because another tab saved first. */
export function isChangedElsewhere(error: unknown) {
  return error instanceof Error && error.message.includes(NOTES_SAY.changedElsewhere)
}

const id = z.string().min(1).max(36)
const ids = z.array(id).min(1).max(500)
const scope = z.union([z.enum(NOTE_SCOPES), id])
const timeZone = z.string().max(64).optional()
/** The editor's document. Its shape is checked on the server by `cleanNoteBody`. */
const body = z.record(z.string(), z.unknown())
const fieldValue = z
  .union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(36)).max(60)])
  .nullable()
/** A folder has at most 30 fields, so more keys than that are refused before anything reads them. */
const fieldValues = z
  .record(z.string().max(60), fieldValue)
  .refine((values) => Object.keys(values).length <= MAX_FIELDS_PER_FOLDER)

// ---------------------------------------------------------------------------
// Reading

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ scope, search: z.string().max(200).optional() }))
  .handler(async ({ data, context }): Promise<NoteList> => listNotes(context.user.id, data))

export function loadNotes(data: { scope: string; search?: string }) {
  return listFn({ data })
}

const recentFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<NoteCard[]> => recentNotes(context.user.id))

export function loadRecentNotes() {
  return recentFn()
}

const readFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id, open: z.boolean() }))
  .handler(
    async ({ data, context }): Promise<NoteDetail> => loadNote(context.user.id, data.id, { open: data.open })
  )

/**
 * Everything the right panel shows about one note. A POST because opening a
 * note marks it as just opened, which is what Recently opened reads.
 */
export function loadNoteDetail(noteId: string, open = true) {
  return readFn({ data: { id: noteId, open } })
}

const titlesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ search: z.string().max(200).optional(), exceptId: id.optional() }))
  .handler(async ({ data, context }): Promise<NoteTitle[]> => noteTitles(context.user.id, data))

/** Note titles for the "[[" picker. */
export function findNoteTitles(search: string, exceptId?: string) {
  return titlesFn({ data: { search, exceptId } })
}

// ---------------------------------------------------------------------------
// Writing

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      folderId: id.nullable(),
      templateId: id.nullable().optional(),
      title: z.string().max(NOTE_TITLE_MAX * 2).optional(),
      body: body.optional(),
      values: fieldValues.optional(),
      timeZone,
    })
  )
  .handler(async ({ data, context }): Promise<NoteDetail> => createNote(context.user.id, data))

export function createNoteIn(data: {
  folderId: string | null
  templateId?: string | null
  title?: string
  body?: Record<string, unknown>
  values?: NoteFieldValues
}) {
  return createFn({ data: { ...data, timeZone: browserTimeZone() } })
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      id,
      revision: z.number().int().min(0),
      title: z.string().max(NOTE_TITLE_MAX * 2).optional(),
      body: body.optional(),
      icon: z.string().max(40).nullable().optional(),
      coverUrl: z.string().max(2000).nullable().optional(),
    })
  )
  .handler(async ({ data, context }) => saveNote(context.user.id, data))

/** Saves the parts that changed. Refused when another tab saved first. */
export function saveNoteChanges(data: {
  id: string
  revision: number
  title?: string
  body?: Record<string, unknown>
  icon?: string | null
  coverUrl?: string | null
}) {
  return saveFn({ data })
}

const fieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, fieldKey: z.string().min(1).max(60), value: fieldValue, timeZone }))
  .handler(async ({ data, context }): Promise<NoteCard> => setFieldValue(context.user.id, data))

export function saveNoteField(noteId: string, fieldKey: string, value: unknown) {
  return fieldFn({
    data: { noteId, fieldKey, value: value as z.infer<typeof fieldValue>, timeZone: browserTimeZone() },
  })
}

const bulkFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids, fieldKey: z.string().min(1).max(60), value: fieldValue, timeZone }))
  .handler(async ({ data, context }): Promise<BulkOutcome> => setFieldOnNotes(context.user.id, data))

export function saveFieldOnNotes(noteIds: string[], fieldKey: string, value: unknown) {
  return bulkFieldFn({
    data: { ids: noteIds, fieldKey, value: value as z.infer<typeof fieldValue>, timeZone: browserTimeZone() },
  })
}

const previewMoveFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ ids, folderId: id.nullable() }))
  .handler(async ({ data, context }) => previewMove(context.user.id, data))

/** The names of the fields whose values a move would lose, for the warning. */
export function checkNoteMove(noteIds: string[], folderId: string | null) {
  return previewMoveFn({ data: { ids: noteIds, folderId } })
}

const moveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids, folderId: id.nullable(), timeZone }))
  .handler(async ({ data, context }): Promise<BulkOutcome> => moveNotes(context.user.id, data))

export function moveNotesTo(noteIds: string[], folderId: string | null) {
  return moveFn({ data: { ids: noteIds, folderId, timeZone: browserTimeZone() } })
}

const pinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids, pinned: z.boolean() }))
  .handler(async ({ data, context }): Promise<BulkOutcome> => pinNotes(context.user.id, data.ids, data.pinned))

export function pinNoteIds(noteIds: string[], pinned: boolean) {
  return pinFn({ data: { ids: noteIds, pinned } })
}

const archiveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids, archived: z.boolean() }))
  .handler(
    async ({ data, context }): Promise<BulkOutcome> => archiveNotes(context.user.id, data.ids, data.archived)
  )

export function archiveNoteIds(noteIds: string[], archived: boolean) {
  return archiveFn({ data: { ids: noteIds, archived } })
}

const trashFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids }))
  .handler(async ({ data, context }): Promise<BulkOutcome> => trashNotes(context.user.id, data.ids))

export function trashNoteIds(noteIds: string[]) {
  return trashFn({ data: { ids: noteIds } })
}

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }): Promise<NoteCard> => restoreNote(context.user.id, data.id))

export function restoreNoteFromTrash(noteId: string) {
  return restoreFn({ data: { id: noteId } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }) => deleteNoteForGood(context.user.id, data.id))

export function deleteNoteNow(noteId: string) {
  return deleteFn({ data: { id: noteId } })
}

const emptyTrashFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => emptyTrash(context.user.id))

export function emptyNotesTrash() {
  return emptyTrashFn()
}

// ---------------------------------------------------------------------------
// History

const versionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ noteId: id }))
  .handler(
    async ({ data, context }): Promise<NoteVersionSummary[]> => listVersions(context.user.id, data.noteId)
  )

export function loadNoteVersions(noteId: string) {
  return versionsFn({ data: { noteId } })
}

const versionFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ noteId: id, versionId: id }))
  .handler(
    async ({ data, context }): Promise<NoteVersion> => loadVersion(context.user.id, data.noteId, data.versionId)
  )

export function loadNoteVersion(noteId: string, versionId: string) {
  return versionFn({ data: { noteId, versionId } })
}

const restoreVersionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, versionId: id, timeZone }))
  .handler(async ({ data, context }): Promise<NoteDetail> => restoreVersion(context.user.id, data))

export function restoreNoteVersion(noteId: string, versionId: string) {
  return restoreVersionFn({ data: { noteId, versionId, timeZone: browserTimeZone() } })
}

// ---------------------------------------------------------------------------
// Videos and the AI

const linkVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, videoId: id.nullable() }))
  .handler(async ({ data, context }): Promise<NoteDetail> => linkNoteVideo(context.user.id, data))

export function linkVideoToNote(noteId: string, videoId: string | null) {
  return linkVideoFn({ data: { noteId, videoId } })
}

const fromVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ videoId: id, folderId: id.nullable(), timeZone }))
  .handler(async ({ data, context }): Promise<NoteDetail> => noteFromVideo(context.user.id, data))

export function makeNoteFromVideo(videoId: string, folderId: string | null) {
  return fromVideoFn({ data: { videoId, folderId, timeZone: browserTimeZone() } })
}

const suggestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => suggestFields(context.user.id, data.noteId))

/** Asks the AI for values for the note's empty fields. Nothing is saved. */
export function suggestNoteFields(noteId: string) {
  return suggestFn({ data: { noteId } })
}

/** The browser's own time zone, which is what a reminder's 9:00 means. */
function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
