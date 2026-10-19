import type { JSONContent } from "@tiptap/core"
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql, type SQL } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import type { Db } from "@/server/note/notes/db-types"
import { folderFields } from "@/server/note/notes/fields"
import { deleteFolderForGood, requireLiveFolder, trashedFolders } from "@/server/note/notes/folders"
import { cleanTimeZone, syncNoteReminders } from "@/server/note/notes/reminders"
import {
  noteNoteFolders,
  noteNoteLinks,
  noteNotes,
  noteNoteTemplates,
  noteNoteVersions,
  noteVideos,
  type NoteNoteRow,
} from "@/server/note/schema"
import { videoTitle } from "@/server/note/videos"
import { cleanNoteBody, EMPTY_BODY, isSafeImageSrc, noteBodyFacts } from "@/lib/note/notes/body"
import {
  carryFieldValues,
  cleanFieldValues,
  FIELDS_SAY,
  fieldsSearchText,
  parseFieldValue,
  type NoteField,
} from "@/lib/note/notes/fields"
import { cleanIcon } from "@/lib/note/notes/icons"
import {
  cleanNoteTitle,
  isFixedScope,
  NOTES_LIST_MAX,
  NOTES_SAY,
  RECENT_NOTES,
  TRASH_DAYS,
  VERSION_EVERY_MINUTES,
  VERSIONS_KEPT,
  type LinkedNoteState,
  type NoteCard,
  type NoteDetail,
  type NoteList,
  type NoteSave,
  type NoteScope,
  type NoteTitle,
  type NoteVersion,
  type NoteVersionSummary,
} from "@/lib/note/notes/notes"

/**
 * One person's written notes. Every read and write is scoped to the owner,
 * and every body is checked against the editor's own blocks before it is
 * stored (`cleanNoteBody`).
 *
 * A save of the title or body carries the revision it started from. When the
 * note moved on since (another tab saved first) the save is refused with
 * `NOTES_SAY.changedElsewhere`, and the screen asks which version to keep.
 * Field values save one at a time and never collide, so they do not count.
 */

// ---------------------------------------------------------------------------
// Reading

type FolderName = { folderName: string | null }

function toCard(row: NoteNoteRow & FolderName): NoteCard {
  return {
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    icon: row.icon,
    firstLine: row.firstLine,
    values: row.fieldValues,
    checklist: { done: row.checklistDone, total: row.checklistTotal },
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    trashedWithFolderId: row.trashedWithFolderId,
    updatedAt: row.updatedAt.toISOString(),
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
    folderName: row.folderName,
  }
}

const withFolderName = {
  note: noteNotes,
  folderName: noteNoteFolders.name,
}

function joinRow(row: { note: NoteNoteRow; folderName: string | null }) {
  return toCard({ ...row.note, folderName: row.folderName })
}

function searchFilter(search: string | undefined): SQL | undefined {
  const words = search?.trim()
  if (!words) return undefined
  const pattern = `%${words.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
  return or(
    ilike(noteNotes.title, pattern),
    ilike(noteNotes.bodyText, pattern),
    ilike(noteNotes.fieldsText, pattern)
  )
}

/**
 * The middle panel's notes: everything, the loose ones, the archived ones,
 * Trash, or one folder's, narrowed by the search box. A search shows archived
 * notes too (with their badge) and never shows Trash, except on Trash itself.
 */
export async function listNotes(
  ownerId: string,
  options: { scope: NoteScope; search?: string }
): Promise<NoteList> {
  const filters: (SQL | undefined)[] = [eq(noteNotes.ownerId, ownerId)]
  const searching = Boolean(options.search?.trim())
  const scope = options.scope
  if (scope === "trash") {
    filters.push(isNotNull(noteNotes.deletedAt), isNull(noteNotes.trashedWithFolderId))
  } else {
    filters.push(isNull(noteNotes.deletedAt))
    if (scope === "archived") filters.push(isNotNull(noteNotes.archivedAt))
    else if (!searching) filters.push(isNull(noteNotes.archivedAt))
    if (scope === "loose") filters.push(isNull(noteNotes.folderId))
    else if (!isFixedScope(scope)) filters.push(eq(noteNotes.folderId, scope))
  }
  filters.push(searchFilter(options.search))

  const rows = await db
    .select(withFolderName)
    .from(noteNotes)
    .leftJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNotes.folderId))
    .where(and(...filters))
    .orderBy(
      sql`${noteNotes.pinnedAt} desc nulls last`,
      desc(scope === "trash" ? noteNotes.deletedAt : noteNotes.updatedAt),
      desc(noteNotes.id)
    )
    .limit(NOTES_LIST_MAX + 1)

  return {
    notes: rows.slice(0, NOTES_LIST_MAX).map(joinRow),
    more: rows.length > NOTES_LIST_MAX,
    trashedFolders: scope === "trash" && !searching ? await trashedFolders(ownerId) : [],
  }
}

/** The last few notes this person opened, newest first. */
export async function recentNotes(ownerId: string): Promise<NoteCard[]> {
  const rows = await db
    .select(withFolderName)
    .from(noteNotes)
    .leftJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNotes.folderId))
    .where(
      and(eq(noteNotes.ownerId, ownerId), isNull(noteNotes.deletedAt), isNotNull(noteNotes.lastOpenedAt))
    )
    .orderBy(desc(noteNotes.lastOpenedAt))
    .limit(RECENT_NOTES)
  return rows.map(joinRow)
}

async function ownNote(ownerId: string, id: string, tx: Db = db) {
  const [row] = await tx
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  if (!row) throw new Error(NOTES_SAY.noteNotFound)
  return row
}

/**
 * The same, locked until the transaction ends. Every change that reads a
 * note's values and writes the whole set back uses this, so two quick field
 * saves on one note wait for each other instead of one wiping the other.
 */
async function lockOwnNote(ownerId: string, id: string, tx: Db) {
  const [row] = await tx
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
    .for("update")
  if (!row) throw new Error(NOTES_SAY.noteNotFound)
  return row
}

async function cardFor(ownerId: string, id: string, tx: Db = db): Promise<NoteCard> {
  const [row] = await tx
    .select(withFolderName)
    .from(noteNotes)
    .leftJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNotes.folderId))
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  if (!row) throw new Error(NOTES_SAY.noteNotFound)
  return joinRow(row)
}

/**
 * Everything the right panel shows about one note. Opening it (`open`)
 * marks it as just opened, which is what Recently opened reads.
 */
export async function loadNote(ownerId: string, id: string, options: { open?: boolean } = {}): Promise<NoteDetail> {
  if (options.open) {
    await db
      .update(noteNotes)
      .set({ lastOpenedAt: now() })
      .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  }
  const card = await cardFor(ownerId, id)
  const row = await ownNote(ownerId, id)
  const facts = noteBodyFacts(row.body)

  const [linkedFrom, linked, video] = await Promise.all([
    db
      .select({ id: noteNotes.id, title: noteNotes.title })
      .from(noteNoteLinks)
      .innerJoin(noteNotes, eq(noteNotes.id, noteNoteLinks.fromNoteId))
      .where(
        and(eq(noteNoteLinks.toNoteId, id), eq(noteNotes.ownerId, ownerId), isNull(noteNotes.deletedAt))
      )
      .orderBy(asc(noteNotes.title)),
    facts.linkedIds.length
      ? db
          .select({ id: noteNotes.id, title: noteNotes.title, deletedAt: noteNotes.deletedAt })
          .from(noteNotes)
          .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, facts.linkedIds)))
      : [],
    row.videoId ? linkedVideo(ownerId, row.videoId) : null,
  ])

  const linkTitles: NoteDetail["linkTitles"] = {}
  for (const linkedId of facts.linkedIds) {
    const found = linked.find((each) => each.id === linkedId)
    const state: LinkedNoteState = !found ? "gone" : found.deletedAt ? "trash" : "ok"
    linkTitles[linkedId] = { title: found?.title ?? "", state }
  }

  return {
    ...card,
    body: row.body,
    coverUrl: row.coverUrl,
    revision: row.revision,
    words: row.words,
    linkedFrom,
    linkTitles,
    video,
    videoGone: row.videoId === null && row.videoTitle !== null,
  }
}

async function coverAddress(path: string | null) {
  if (!path) return null
  try {
    return await getPublicMediaUrl(path)
  } catch {
    // No bucket set up here; the card simply has no picture.
    return null
  }
}

async function linkedVideo(ownerId: string, videoId: string) {
  const [video] = await db
    .select()
    .from(noteVideos)
    .where(and(eq(noteVideos.id, videoId), eq(noteVideos.ownerId, ownerId)))
  if (!video) return null
  return {
    id: video.id,
    title: videoTitle(video),
    coverUrl: await coverAddress(video.coverStoragePath),
    summary: video.summary ?? [],
  }
}

/** Titles for the "[[" picker: this person's notes matching the words, newest first. */
export async function noteTitles(
  ownerId: string,
  options: { search?: string; exceptId?: string }
): Promise<NoteTitle[]> {
  const rows = await db
    .select({ id: noteNotes.id, title: noteNotes.title, folderName: noteNoteFolders.name })
    .from(noteNotes)
    .leftJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNotes.folderId))
    .where(
      and(
        eq(noteNotes.ownerId, ownerId),
        isNull(noteNotes.deletedAt),
        options.exceptId ? ne(noteNotes.id, options.exceptId) : undefined,
        options.search?.trim()
          ? ilike(noteNotes.title, `%${options.search.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`)
          : undefined
      )
    )
    .orderBy(desc(noteNotes.updatedAt))
    .limit(20)
  return rows.map((row) => ({ id: row.id, title: row.title, folderName: row.folderName }))
}

// ---------------------------------------------------------------------------
// Writing

/** The facts a stored body carries beside it, worked out once on save. */
function bodyColumns(body: JSONContent) {
  const facts = noteBodyFacts(body)
  return {
    body,
    bodyText: facts.text,
    firstLine: facts.firstLine,
    checklistDone: facts.checklist.done,
    checklistTotal: facts.checklist.total,
    words: facts.words,
  }
}

function cleanCover(url: string | null | undefined) {
  if (!url) return null
  return isSafeImageSrc(url) ? url : null
}

/** Which of these ids are this person's notes (any state), for links. */
async function rewriteLinks(tx: Db, ownerId: string, noteId: string, linkedIds: string[]) {
  await tx.delete(noteNoteLinks).where(eq(noteNoteLinks.fromNoteId, noteId))
  const targets = linkedIds.filter((id) => id !== noteId)
  if (!targets.length) return
  const mine = await tx
    .select({ id: noteNotes.id })
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, targets)))
  if (!mine.length) return
  await tx
    .insert(noteNoteLinks)
    .values(mine.map((row) => ({ fromNoteId: noteId, toNoteId: row.id })))
    .onConflictDoNothing()
}

/**
 * A new note, in a folder or loose, either blank or from one of that
 * folder's templates. A title given here wins over the template's.
 */
export async function createNote(
  ownerId: string,
  input: {
    folderId: string | null
    templateId?: string | null
    title?: string
    body?: JSONContent
    /** Cleaned against the folder's fields here, so anything else is dropped. */
    values?: Record<string, unknown>
    videoId?: string | null
    timeZone?: string
  }
): Promise<NoteDetail> {
  const id = uuid()
  await db.transaction(async (tx) => {
    if (input.folderId) await requireLiveFolder(ownerId, input.folderId, tx)
    const fields = await folderFields(input.folderId, tx)
    let title = input.title ?? ""
    let body = input.body ?? EMPTY_BODY
    let values: Record<string, unknown> = input.values ?? {}
    if (input.templateId) {
      const [template] = input.folderId
        ? await tx
            .select()
            .from(noteNoteTemplates)
            .where(and(eq(noteNoteTemplates.id, input.templateId), eq(noteNoteTemplates.folderId, input.folderId)))
        : []
      if (!template) throw new Error(NOTES_SAY.templateNotFound)
      title = input.title ?? template.title
      body = template.body
      values = template.fieldValues
    }
    let videoTitleText: string | null = null
    if (input.videoId) {
      const [video] = await tx
        .select()
        .from(noteVideos)
        .where(and(eq(noteVideos.id, input.videoId), eq(noteVideos.ownerId, ownerId)))
      if (!video) throw new Error(NOTES_SAY.videoNotFound)
      videoTitleText = videoTitle(video)
    }
    const cleanBody = cleanNoteBody(body)
    const cleanValues = cleanFieldValues(fields, values)
    const at = now()
    await tx.insert(noteNotes).values({
      id,
      ownerId,
      folderId: input.folderId,
      title: cleanNoteTitle(title),
      ...bodyColumns(cleanBody),
      fieldValues: cleanValues,
      fieldsText: fieldsSearchText(fields, cleanValues),
      videoId: input.videoId ?? null,
      videoTitle: videoTitleText,
      lastOpenedAt: at,
      createdAt: at,
      updatedAt: at,
    })
    await rewriteLinks(tx, ownerId, id, noteBodyFacts(cleanBody).linkedIds)
    await syncNoteReminders(tx, { id, values: cleanValues }, fields, cleanTimeZone(input.timeZone))
  })
  return loadNote(ownerId, id)
}

/**
 * Saves the parts of a note that changed. The revision must be the one the
 * screen started from. Before a title or body change, the note as it was is
 * kept as an earlier copy, at most one per five minutes, newest 100 kept.
 */
export async function saveNote(ownerId: string, save: NoteSave): Promise<{ revision: number; card: NoteCard; words: number }> {
  const result = await db.transaction(async (tx) => {
    const row = await lockOwnNote(ownerId, save.id, tx)
    if (row.deletedAt) throw new Error(NOTES_SAY.inTrash)
    if (row.revision !== save.revision) throw new Error(NOTES_SAY.changedElsewhere)

    const changes: Partial<typeof noteNotes.$inferInsert> = {}
    if (save.title !== undefined) changes.title = cleanNoteTitle(save.title)
    let linkedIds: string[] | null = null
    if (save.body !== undefined) {
      const body = cleanNoteBody(save.body)
      Object.assign(changes, bodyColumns(body))
      linkedIds = noteBodyFacts(body).linkedIds
    }
    if (save.icon !== undefined) changes.icon = cleanIcon(save.icon)
    if (save.coverUrl !== undefined) changes.coverUrl = cleanCover(save.coverUrl)

    if (save.title !== undefined || save.body !== undefined) await keepEarlierCopy(tx, row)

    const at = now()
    const [saved] = await tx
      .update(noteNotes)
      .set({ ...changes, revision: row.revision + 1, updatedAt: at })
      .where(and(eq(noteNotes.id, save.id), eq(noteNotes.revision, row.revision)))
      .returning({ revision: noteNotes.revision, words: noteNotes.words })
    if (!saved) throw new Error(NOTES_SAY.changedElsewhere)
    if (linkedIds) await rewriteLinks(tx, ownerId, save.id, linkedIds)
    return saved
  })
  return { revision: result.revision, words: result.words, card: await cardFor(ownerId, save.id) }
}

/** The note as it is, kept as an earlier copy unless the newest copy is under five minutes old. */
async function keepEarlierCopy(tx: Db, row: NoteNoteRow) {
  const [newest] = await tx
    .select({ createdAt: noteNoteVersions.createdAt })
    .from(noteNoteVersions)
    .where(eq(noteNoteVersions.noteId, row.id))
    .orderBy(desc(noteNoteVersions.createdAt))
    .limit(1)
  const at = now()
  if (newest && at.getTime() - newest.createdAt.getTime() < VERSION_EVERY_MINUTES * 60_000) return
  await tx.insert(noteNoteVersions).values({
    id: uuid(),
    noteId: row.id,
    title: row.title,
    body: row.body,
    fieldValues: row.fieldValues,
    words: row.words,
    createdAt: at,
  })
  await trimVersions(tx, row.id)
}

async function trimVersions(tx: Db, noteId: string) {
  const keep = tx
    .select({ id: noteNoteVersions.id })
    .from(noteNoteVersions)
    .where(eq(noteNoteVersions.noteId, noteId))
    .orderBy(desc(noteNoteVersions.createdAt), desc(noteNoteVersions.id))
    .limit(VERSIONS_KEPT)
  await tx
    .delete(noteNoteVersions)
    .where(and(eq(noteNoteVersions.noteId, noteId), notInArray(noteNoteVersions.id, keep)))
}

/**
 * One field's value on one note. Refused with the reason when it does not
 * fit the field, keeps the folder's reminders in step, and never counts as
 * a revision, so it cannot collide with the text being typed.
 */
export async function setFieldValue(
  ownerId: string,
  input: { noteId: string; fieldKey: string; value: unknown; timeZone?: string }
): Promise<NoteCard> {
  await db.transaction(async (tx) => {
    const row = await lockOwnNote(ownerId, input.noteId, tx)
    if (row.deletedAt) throw new Error(NOTES_SAY.inTrash)
    const fields = await folderFields(row.folderId, tx)
    const field = fields.find((each) => each.key === input.fieldKey)
    if (!field) throw new Error(FIELDS_SAY.fieldNotFound)
    const parsed = parseFieldValue(field, input.value)
    if (!parsed.ok) throw new Error(parsed.reason)
    await writeValues(tx, row, fields, { ...row.fieldValues, [field.key]: parsed.value }, input.timeZone)
  })
  return cardFor(ownerId, input.noteId)
}

async function writeValues(
  tx: Db,
  row: Pick<NoteNoteRow, "id">,
  fields: NoteField[],
  raw: Record<string, unknown>,
  timeZone: string | undefined
) {
  const values = cleanFieldValues(fields, raw)
  await tx
    .update(noteNotes)
    .set({ fieldValues: values, fieldsText: fieldsSearchText(fields, values), updatedAt: now() })
    .where(eq(noteNotes.id, row.id))
  await syncNoteReminders(tx, { id: row.id, values }, fields, cleanTimeZone(timeZone))
}

/** The same value on several notes of one folder at once. */
export async function setFieldOnNotes(
  ownerId: string,
  input: { ids: string[]; fieldKey: string; value: unknown; timeZone?: string }
): Promise<BulkOutcome> {
  return db.transaction(async (tx) => {
    const rows = await ownNotes(tx, ownerId, input.ids, true)
    const done: string[] = []
    const fieldsByFolder = new Map<string, NoteField[]>()
    for (const row of rows) {
      if (row.deletedAt || !row.folderId) continue
      const fields = fieldsByFolder.get(row.folderId) ?? (await folderFields(row.folderId, tx))
      fieldsByFolder.set(row.folderId, fields)
      const field = fields.find((each) => each.key === input.fieldKey)
      if (!field) continue
      const parsed = parseFieldValue(field, input.value)
      if (!parsed.ok) throw new Error(parsed.reason)
      await writeValues(tx, row, fields, { ...row.fieldValues, [field.key]: parsed.value }, input.timeZone)
      done.push(row.id)
    }
    return outcome(input.ids, done)
  })
}

export type BulkOutcome = { done: string[]; skipped: string[] }

function outcome(asked: string[], done: string[]): BulkOutcome {
  return { done, skipped: asked.filter((id) => !done.includes(id)) }
}

async function ownNotes(tx: Db, ownerId: string, ids: string[], lock = false) {
  if (!ids.length) return []
  const query = tx
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, ids)))
    // In id order, so two changes to many notes at once lock them the same way round.
    .orderBy(asc(noteNotes.id))
  return lock ? query.for("update") : query
}

/**
 * What moving these notes into a folder would lose: the names of the fields
 * that hold something with no same-named field of the same type there.
 */
export async function previewMove(
  ownerId: string,
  input: { ids: string[]; folderId: string | null }
): Promise<{ lost: string[] }> {
  if (input.folderId) await requireLiveFolder(ownerId, input.folderId)
  const rows = await ownNotes(db, ownerId, input.ids)
  const to = await folderFields(input.folderId)
  const lost = new Set<string>()
  const cache = new Map<string | null, NoteField[]>()
  for (const row of rows) {
    if (row.folderId === input.folderId) continue
    const from = cache.get(row.folderId) ?? (await folderFields(row.folderId))
    cache.set(row.folderId, from)
    for (const name of carryFieldValues(from, to, row.fieldValues).lost) lost.add(name)
  }
  return { lost: [...lost] }
}

/** Moves notes into a folder, or out of every folder, carrying what fits. */
export async function moveNotes(
  ownerId: string,
  input: { ids: string[]; folderId: string | null; timeZone?: string }
): Promise<BulkOutcome> {
  return db.transaction(async (tx) => {
    if (input.folderId) await requireLiveFolder(ownerId, input.folderId, tx)
    const to = await folderFields(input.folderId, tx)
    const rows = await ownNotes(tx, ownerId, input.ids, true)
    const done: string[] = []
    const fieldsOf = new Map<string | null, NoteField[]>()
    for (const row of rows) {
      if (row.deletedAt || row.folderId === input.folderId) continue
      const from = fieldsOf.get(row.folderId) ?? (await folderFields(row.folderId, tx))
      fieldsOf.set(row.folderId, from)
      const { values } = carryFieldValues(from, to, row.fieldValues)
      await tx
        .update(noteNotes)
        .set({ folderId: input.folderId, fieldValues: values, fieldsText: fieldsSearchText(to, values), updatedAt: now() })
        .where(eq(noteNotes.id, row.id))
      await syncNoteReminders(tx, { id: row.id, values }, to, cleanTimeZone(input.timeZone))
      done.push(row.id)
    }
    return outcome(input.ids, done)
  })
}

async function stampNotes(
  ownerId: string,
  ids: string[],
  set: Partial<typeof noteNotes.$inferInsert>,
  only: SQL | undefined
): Promise<BulkOutcome> {
  if (!ids.length) return { done: [], skipped: [] }
  const rows = await db
    .update(noteNotes)
    .set(set)
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, ids), isNull(noteNotes.deletedAt), only))
    .returning({ id: noteNotes.id })
  return outcome(ids, rows.map((row) => row.id))
}

export function pinNotes(ownerId: string, ids: string[], pinned: boolean) {
  return stampNotes(
    ownerId,
    ids,
    { pinnedAt: pinned ? now() : null },
    pinned ? isNull(noteNotes.pinnedAt) : isNotNull(noteNotes.pinnedAt)
  )
}

export function archiveNotes(ownerId: string, ids: string[], archived: boolean) {
  return stampNotes(
    ownerId,
    ids,
    { archivedAt: archived ? now() : null },
    archived ? isNull(noteNotes.archivedAt) : isNotNull(noteNotes.archivedAt)
  )
}

export function trashNotes(ownerId: string, ids: string[]) {
  return stampNotes(ownerId, ids, { deletedAt: now(), trashedWithFolderId: null }, undefined)
}

/**
 * Brings a note back from Trash into its folder, or loose when that folder
 * is gone or still in Trash. A loose note has no fields, so its values go.
 */
export async function restoreNote(ownerId: string, id: string): Promise<NoteCard> {
  await db.transaction(async (tx) => {
    const row = await lockOwnNote(ownerId, id, tx)
    if (!row.deletedAt) return
    // A note that went with its folder comes back with its folder.
    if (row.trashedWithFolderId) throw new Error(NOTES_SAY.restoreItsFolder)
    let folderId = row.folderId
    if (folderId) {
      const [folder] = await tx
        .select({ deletedAt: noteNoteFolders.deletedAt })
        .from(noteNoteFolders)
        .where(eq(noteNoteFolders.id, folderId))
      if (!folder || folder.deletedAt) folderId = null
    }
    await tx
      .update(noteNotes)
      .set({
        deletedAt: null,
        trashedWithFolderId: null,
        folderId,
        ...(folderId ? {} : { fieldValues: {}, fieldsText: "" }),
        updatedAt: now(),
      })
      .where(eq(noteNotes.id, id))
    // A loose note has no fields, so its date reminders go with its values.
    if (!folderId) await syncNoteReminders(tx, { id, values: {} }, [], "UTC")
  })
  return cardFor(ownerId, id)
}

export async function deleteNoteForGood(ownerId: string, id: string) {
  const gone = await db
    .delete(noteNotes)
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId), isNotNull(noteNotes.deletedAt)))
    .returning({ id: noteNotes.id })
  if (!gone.length) throw new Error(NOTES_SAY.noteNotFound)
}

/** Empties this person's Trash now: every note and folder in it, for good. */
export async function emptyTrash(ownerId: string): Promise<{ notes: number; folders: number }> {
  return db.transaction(async (tx) => {
    const folders = await tx
      .select({ id: noteNoteFolders.id })
      .from(noteNoteFolders)
      .where(
        and(
          eq(noteNoteFolders.ownerId, ownerId),
          isNotNull(noteNoteFolders.deletedAt),
          isNull(noteNoteFolders.trashedWithFolderId)
        )
      )
    for (const folder of folders) await deleteFolderForGood(ownerId, folder.id, tx)
    const notes = await tx
      .delete(noteNotes)
      .where(and(eq(noteNotes.ownerId, ownerId), isNotNull(noteNotes.deletedAt)))
      .returning({ id: noteNotes.id })
    return { notes: notes.length, folders: folders.length }
  })
}

/** What the worker clears: anything in anyone's Trash for over 30 days. */
export async function purgeOldTrash(limit = 200): Promise<number> {
  const cutoff = new Date(now().getTime() - TRASH_DAYS * 24 * 60 * 60_000)
  const folders = await db
    .select({ id: noteNoteFolders.id, ownerId: noteNoteFolders.ownerId })
    .from(noteNoteFolders)
    .where(
      and(
        isNull(noteNoteFolders.trashedWithFolderId),
        lt(noteNoteFolders.deletedAt, cutoff)
      )
    )
    // Oldest first: a folder trashed on its own before its parent is deleted
    // with its notes before the parent's delete would take it along.
    .orderBy(asc(noteNoteFolders.deletedAt))
    .limit(limit)
  for (const folder of folders) {
    await db.transaction((tx) => deleteFolderForGood(folder.ownerId, folder.id, tx))
  }
  const notes = await db
    .delete(noteNotes)
    .where(
      inArray(
        noteNotes.id,
        db
          .select({ id: noteNotes.id })
          .from(noteNotes)
          .where(and(isNull(noteNotes.trashedWithFolderId), lt(noteNotes.deletedAt, cutoff)))
          .limit(limit)
      )
    )
    .returning({ id: noteNotes.id })
  return folders.length + notes.length
}

// ---------------------------------------------------------------------------
// History

export async function listVersions(ownerId: string, noteId: string): Promise<NoteVersionSummary[]> {
  await ownNote(ownerId, noteId)
  const rows = await db
    .select({
      id: noteNoteVersions.id,
      createdAt: noteNoteVersions.createdAt,
      title: noteNoteVersions.title,
      words: noteNoteVersions.words,
    })
    .from(noteNoteVersions)
    .where(eq(noteNoteVersions.noteId, noteId))
    .orderBy(desc(noteNoteVersions.createdAt), desc(noteNoteVersions.id))
    .limit(VERSIONS_KEPT)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

export async function loadVersion(ownerId: string, noteId: string, versionId: string): Promise<NoteVersion> {
  await ownNote(ownerId, noteId)
  const [row] = await db
    .select()
    .from(noteNoteVersions)
    .where(and(eq(noteNoteVersions.id, versionId), eq(noteNoteVersions.noteId, noteId)))
  if (!row) throw new Error(NOTES_SAY.versionNotFound)
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    title: row.title,
    words: row.words,
    body: row.body,
    values: row.fieldValues,
  }
}

/**
 * Puts an earlier copy back. The note as it is now is kept as a copy first,
 * whatever the five-minute rule says, so a restore can itself be undone.
 * Values come back only for fields the folder still has.
 */
export async function restoreVersion(
  ownerId: string,
  input: { noteId: string; versionId: string; timeZone?: string }
): Promise<NoteDetail> {
  await db.transaction(async (tx) => {
    const row = await lockOwnNote(ownerId, input.noteId, tx)
    if (row.deletedAt) throw new Error(NOTES_SAY.inTrash)
    const [version] = await tx
      .select()
      .from(noteNoteVersions)
      .where(and(eq(noteNoteVersions.id, input.versionId), eq(noteNoteVersions.noteId, input.noteId)))
    if (!version) throw new Error(NOTES_SAY.versionNotFound)
    const at = now()
    await tx.insert(noteNoteVersions).values({
      id: uuid(),
      noteId: row.id,
      title: row.title,
      body: row.body,
      fieldValues: row.fieldValues,
      words: row.words,
      createdAt: at,
    })
    await trimVersions(tx, row.id)
    const fields = await folderFields(row.folderId, tx)
    const body = cleanNoteBody(version.body)
    const values = cleanFieldValues(fields, version.fieldValues)
    await tx
      .update(noteNotes)
      .set({
        title: version.title,
        ...bodyColumns(body),
        fieldValues: values,
        fieldsText: fieldsSearchText(fields, values),
        revision: row.revision + 1,
        updatedAt: at,
      })
      .where(eq(noteNotes.id, row.id))
    await rewriteLinks(tx, ownerId, row.id, noteBodyFacts(body).linkedIds)
    await syncNoteReminders(tx, { id: row.id, values }, fields, cleanTimeZone(input.timeZone))
  })
  return loadNote(ownerId, input.noteId)
}

// ---------------------------------------------------------------------------
// Videos

/** Points a note at one of this person's saved videos, or at none. */
export async function linkNoteVideo(
  ownerId: string,
  input: { noteId: string; videoId: string | null }
): Promise<NoteDetail> {
  const row = await ownNote(ownerId, input.noteId)
  if (row.deletedAt) throw new Error(NOTES_SAY.inTrash)
  let title: string | null = null
  if (input.videoId) {
    const [video] = await db
      .select()
      .from(noteVideos)
      .where(and(eq(noteVideos.id, input.videoId), eq(noteVideos.ownerId, ownerId)))
    if (!video) throw new Error(NOTES_SAY.videoNotFound)
    title = videoTitle(video)
  }
  await db
    .update(noteNotes)
    .set({ videoId: input.videoId, videoTitle: title, updatedAt: now() })
    .where(eq(noteNotes.id, input.noteId))
  return loadNote(ownerId, input.noteId)
}

/**
 * A new note made from a saved video: its title, the summary as bullets, the
 * action plan as a checklist with the same ticks, the quotes as quote
 * blocks, and a link back to the video. A copy: analysing the video again
 * changes nothing in it.
 */
export async function noteFromVideo(
  ownerId: string,
  input: { videoId: string; folderId: string | null; timeZone?: string }
): Promise<NoteDetail> {
  const [video] = await db
    .select()
    .from(noteVideos)
    .where(and(eq(noteVideos.id, input.videoId), eq(noteVideos.ownerId, ownerId)))
  if (!video) throw new Error(NOTES_SAY.videoNotFound)
  return createNote(ownerId, {
    folderId: input.folderId,
    title: videoTitle(video),
    body: videoNoteBody(video),
    videoId: video.id,
    timeZone: input.timeZone,
  })
}

export function videoNoteBody(video: {
  summary: string[] | null
  actionPlan: { text: string; done: boolean }[] | null
  quotes: { text: string }[] | null
}): JSONContent {
  const paragraph = (text: string): JSONContent => ({
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  })
  const heading = (text: string): JSONContent => ({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text }],
  })
  const content: JSONContent[] = []
  if (video.summary?.length) {
    content.push(heading("Summary"), {
      type: "bulletList",
      content: video.summary.map((line) => ({ type: "listItem", content: [paragraph(line)] })),
    })
  }
  if (video.actionPlan?.length) {
    content.push(heading("Action plan"), {
      type: "taskList",
      content: video.actionPlan.map((step) => ({
        type: "taskItem",
        attrs: { checked: step.done },
        content: [paragraph(step.text)],
      })),
    })
  }
  if (video.quotes?.length) {
    content.push(heading("Key quotes"))
    for (const quote of video.quotes) content.push({ type: "blockquote", content: [paragraph(quote.text)] })
  }
  if (!content.length) content.push(paragraph(""))
  return { type: "doc", content }
}
