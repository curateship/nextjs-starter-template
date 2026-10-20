import type { JSONContent } from "@tiptap/core"
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql, type SQL } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { cardsFor, detailFor, joinedCard, withFolderName } from "@/server/note/library/cards"
import type { Db } from "@/server/note/library/db-types"
import { removeNoteFiles } from "@/server/note/library/files"
import { authorMatches, folderForSource, requireFolder, requireLibrary } from "@/server/note/library/libraries"
import { noteFolders, noteLinks, noteNotes, noteTemplates, noteVersions, type NoteRow } from "@/server/note/schema"
import { cleanNoteBody, EMPTY_BODY, noteBodyFacts } from "@/lib/note/notes/body"
import {
  AUTHOR_HANDLE_MAX,
  cleanAuthorName,
  cleanNoteTitle,
  cleanTag,
  isFixedScope,
  isImportSource,
  LIBRARY_SAYS,
  NOTES_LIST_MAX,
  TAGS_PER_NOTE,
  TRASH_DAYS,
  VERSION_EVERY_MINUTES,
  VERSIONS_KEPT,
  type BulkOutcome,
  type NoteCard,
  type NoteDetail,
  type NoteFilters,
  type NoteList,
  type NotePriority,
  type NoteSave,
  type NoteScope,
  type NoteTitle,
  type NoteVersion,
  type NoteVersionSummary,
} from "@/lib/note/library/notes"

/**
 * One person's notes: the middle panel's list, the open note, and every
 * change a click makes. Every read and write is scoped to the owner, and every
 * body is checked against the editor's own blocks before it is stored
 * (`cleanNoteBody`).
 *
 * A save of the title or text carries the revision it started from. When the
 * note moved on since (another tab saved first) the save is refused with
 * `LIBRARY_SAYS.changedElsewhere`, and the screen asks which version to keep.
 * Tags, priority, author and folder save on their own and never collide, so
 * they do not count.
 */

// ---------------------------------------------------------------------------
// Reading

function escapeLike(words: string) {
  return `%${words.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}

/**
 * Search reads titles, the note's text, the post's words, the transcript, the
 * AI's summary, the tags and the author's name (Tyler's task, part 28).
 */
function searchFilter(search: string | undefined): SQL | undefined {
  const words = search?.trim()
  if (!words) return undefined
  const pattern = escapeLike(words)
  return or(
    ilike(noteNotes.title, pattern),
    ilike(noteNotes.bodyText, pattern),
    ilike(noteNotes.postText, pattern),
    ilike(noteNotes.transcriptText, pattern),
    ilike(noteNotes.authorName, pattern),
    ilike(noteNotes.authorHandle, pattern),
    sql`${noteNotes.quoted}::text ilike ${pattern}`,
    sql`${noteNotes.thread}::text ilike ${pattern}`,
    sql`${noteNotes.summary}::text ilike ${pattern}`,
    sql`${noteNotes.tags}::text ilike ${pattern}`
  )
}

function progressFilter(progress: NonNullable<NoteFilters["progress"]>): SQL {
  const hasPlan = sql`(jsonb_typeof(${noteNotes.actionPlan}) = 'array' and jsonb_array_length(${noteNotes.actionPlan}) > 0)`
  if (progress === "none") return sql`not coalesce(${hasPlan}, false)`
  const someTicked = sql`jsonb_path_exists(${noteNotes.actionPlan}, '$[*] ? (@.done == true)')`
  const someOpen = sql`jsonb_path_exists(${noteNotes.actionPlan}, '$[*] ? (@.done == false)')`
  if (progress === "done") return sql`(${hasPlan} and not ${someOpen})`
  if (progress === "in_progress") return sql`(${hasPlan} and ${someTicked} and ${someOpen})`
  return sql`(${hasPlan} and not ${someTicked})`
}

function analysedFilter(analysed: NonNullable<NoteFilters["analysed"]>): SQL | undefined {
  if (analysed === "analysed") return isNotNull(noteNotes.analysedAt)
  if (analysed === "importing") return inArray(noteNotes.importStatus, ["waiting", "reading", "downloading"])
  if (analysed === "failed") return or(eq(noteNotes.importStatus, "failed"), eq(noteNotes.analyseStatus, "failed"))
  return and(eq(noteNotes.importStatus, "saved"), isNull(noteNotes.analysedAt))
}

/** The Filter popover's picks as SQL. */
function filtersWhere(filters: NoteFilters): (SQL | undefined)[] {
  return [
    filters.source ? eq(noteNotes.source, filters.source) : undefined,
    filters.priority ? eq(noteNotes.priority, filters.priority) : undefined,
    filters.tag ? sql`${noteNotes.tags} @> ${JSON.stringify([filters.tag])}::jsonb` : undefined,
    filters.author ? authorMatches(filters.author) : undefined,
    filters.analysed ? analysedFilter(filters.analysed) : undefined,
    filters.progress ? progressFilter(filters.progress) : undefined,
  ]
}

/**
 * The middle panel's notes: everything, the loose ones, the archived ones,
 * Trash, or one folder's, narrowed by the filters and the search box. A search
 * shows archived notes too and never shows Trash, except on Trash itself.
 * Pinned notes come first, then the newest edited.
 */
export async function listNotes(
  ownerId: string,
  options: { libraryId: string; scope: NoteScope; search?: string; filters?: NoteFilters }
): Promise<NoteList> {
  await requireLibrary(ownerId, options.libraryId)
  const where: (SQL | undefined)[] = [eq(noteNotes.ownerId, ownerId), eq(noteNotes.libraryId, options.libraryId)]
  const searching = Boolean(options.search?.trim())
  const scope = options.scope
  if (scope === "trash") {
    where.push(isNotNull(noteNotes.deletedAt))
  } else {
    where.push(isNull(noteNotes.deletedAt))
    if (scope === "archived") where.push(isNotNull(noteNotes.archivedAt))
    else if (!searching) where.push(isNull(noteNotes.archivedAt))
    if (scope === "loose") where.push(isNull(noteNotes.folderId))
    else if (!isFixedScope(scope)) where.push(eq(noteNotes.folderId, scope))
  }
  where.push(searchFilter(options.search), ...filtersWhere(options.filters ?? {}))

  const rows = await db
    .select(withFolderName)
    .from(noteNotes)
    .leftJoin(noteFolders, eq(noteFolders.id, noteNotes.folderId))
    .where(and(...where))
    .orderBy(
      sql`${noteNotes.pinnedAt} desc nulls last`,
      desc(scope === "trash" ? noteNotes.deletedAt : noteNotes.updatedAt),
      desc(noteNotes.id)
    )
    .limit(NOTES_LIST_MAX + 1)
  return { notes: rows.slice(0, NOTES_LIST_MAX).map(joinedCard), more: rows.length > NOTES_LIST_MAX }
}

export async function requireNote(ownerId: string, id: string, tx: Db = db): Promise<NoteRow> {
  const [row] = await tx
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  if (!row) throw new Error(LIBRARY_SAYS.noteNotFound)
  return row
}

/**
 * The same, locked until the transaction ends, so two quick saves of one
 * note's tags wait for each other instead of one wiping the other.
 */
async function lockNote(ownerId: string, id: string, tx: Db): Promise<NoteRow> {
  const [row] = await tx
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
    .for("update")
  if (!row) throw new Error(LIBRARY_SAYS.noteNotFound)
  return row
}

async function oneCard(ownerId: string, id: string): Promise<NoteCard> {
  const [card] = await cardsFor(ownerId, [id])
  if (!card) throw new Error(LIBRARY_SAYS.noteNotFound)
  return card
}

/** Everything the right panel shows. Opening it (`open`) is what Recently opened reads. */
export async function loadNote(ownerId: string, id: string, options: { open?: boolean } = {}): Promise<NoteDetail> {
  if (options.open) {
    await db
      .update(noteNotes)
      .set({ lastOpenedAt: now() })
      .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  }
  return detailFor(ownerId, id)
}

/** Titles for the "[[" picker: notes in the same library matching the words, newest first. */
export async function noteTitles(
  ownerId: string,
  options: { libraryId: string; search?: string; exceptId?: string }
): Promise<NoteTitle[]> {
  const rows = await db
    .select({ id: noteNotes.id, title: noteNotes.title, folderName: noteFolders.name })
    .from(noteNotes)
    .leftJoin(noteFolders, eq(noteFolders.id, noteNotes.folderId))
    .where(
      and(
        eq(noteNotes.ownerId, ownerId),
        eq(noteNotes.libraryId, options.libraryId),
        isNull(noteNotes.deletedAt),
        options.exceptId ? ne(noteNotes.id, options.exceptId) : undefined,
        options.search?.trim() ? ilike(noteNotes.title, escapeLike(options.search.trim())) : undefined
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
  return { body, bodyText: facts.text, words: facts.words }
}

/** Keeps the "[[" links in step with the text. Only notes in the same library count. */
async function rewriteLinks(tx: Db, row: Pick<NoteRow, "id" | "ownerId" | "libraryId">, linkedIds: string[]) {
  await tx.delete(noteLinks).where(eq(noteLinks.fromNoteId, row.id))
  const targets = linkedIds.filter((id) => id !== row.id)
  if (!targets.length) return
  const mine = await tx
    .select({ id: noteNotes.id })
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, row.ownerId), eq(noteNotes.libraryId, row.libraryId), inArray(noteNotes.id, targets)))
  if (!mine.length) return
  await tx
    .insert(noteLinks)
    .values(mine.map((target) => ({ fromNoteId: row.id, toNoteId: target.id })))
    .onConflictDoNothing()
}

/**
 * A new note, in a folder or loose, either blank or from one of the library's
 * templates. A title given here wins over the template's. New notes are Normal
 * (the default Tyler was offered, 20 Oct 2026).
 */
export async function createNote(
  ownerId: string,
  input: {
    libraryId: string
    folderId: string | null
    templateId?: string | null
    title?: string
    body?: JSONContent
    priority?: NotePriority
    tags?: string[]
  }
): Promise<NoteDetail> {
  const id = uuid()
  await db.transaction(async (tx) => {
    await requireLibrary(ownerId, input.libraryId, tx)
    if (input.folderId) {
      const folder = await requireFolder(ownerId, input.folderId, tx)
      if (folder.libraryId !== input.libraryId) throw new Error(LIBRARY_SAYS.folderNotFound)
    }
    let title = input.title ?? ""
    let body = input.body ?? EMPTY_BODY
    if (input.templateId) {
      const [template] = await tx
        .select()
        .from(noteTemplates)
        .where(and(eq(noteTemplates.id, input.templateId), eq(noteTemplates.libraryId, input.libraryId)))
      if (!template) throw new Error(LIBRARY_SAYS.templateNotFound)
      title = input.title?.trim() ? input.title : template.title
      body = template.body
    }
    const clean = cleanNoteBody(body)
    const at = now()
    const row = {
      id,
      ownerId,
      libraryId: input.libraryId,
      folderId: input.folderId,
      title: cleanNoteTitle(title),
      ...bodyColumns(clean),
      tags: cleanTags(input.tags ?? []),
      priority: input.priority ?? "normal",
      lastOpenedAt: at,
      createdAt: at,
      updatedAt: at,
    } satisfies typeof noteNotes.$inferInsert
    await tx.insert(noteNotes).values(row)
    await rewriteLinks(tx, row, noteBodyFacts(clean).linkedIds)
  })
  return loadNote(ownerId, id)
}

/**
 * Saves the title or text that changed. The revision must be the one the
 * screen started from. Before a change, the note as it was is kept as an
 * earlier copy, at most one per five minutes, newest 100 kept.
 */
export async function saveNote(
  ownerId: string,
  save: NoteSave
): Promise<{ revision: number; card: NoteCard; words: number }> {
  const result = await db.transaction(async (tx) => {
    const row = await lockNote(ownerId, save.id, tx)
    if (row.deletedAt) throw new Error(LIBRARY_SAYS.inTrash)
    if (row.revision !== save.revision) throw new Error(LIBRARY_SAYS.changedElsewhere)

    const changes: Partial<typeof noteNotes.$inferInsert> = {}
    if (save.title !== undefined) changes.title = cleanNoteTitle(save.title)
    let linkedIds: string[] | null = null
    if (save.body !== undefined) {
      const body = cleanNoteBody(save.body)
      Object.assign(changes, bodyColumns(body))
      linkedIds = noteBodyFacts(body).linkedIds
    }
    await keepEarlierCopy(tx, row)
    const [saved] = await tx
      .update(noteNotes)
      .set({ ...changes, revision: row.revision + 1, updatedAt: now() })
      .where(and(eq(noteNotes.id, save.id), eq(noteNotes.revision, row.revision)))
      .returning({ revision: noteNotes.revision, words: noteNotes.words })
    if (!saved) throw new Error(LIBRARY_SAYS.changedElsewhere)
    if (linkedIds) await rewriteLinks(tx, row, linkedIds)
    return saved
  })
  return { revision: result.revision, words: result.words, card: await oneCard(ownerId, save.id) }
}

/** The note as it is, kept as an earlier copy unless the newest copy is under five minutes old. */
async function keepEarlierCopy(tx: Db, row: NoteRow, always = false) {
  if (!always) {
    const [newest] = await tx
      .select({ createdAt: noteVersions.createdAt })
      .from(noteVersions)
      .where(eq(noteVersions.noteId, row.id))
      .orderBy(desc(noteVersions.createdAt))
      .limit(1)
    if (newest && now().getTime() - newest.createdAt.getTime() < VERSION_EVERY_MINUTES * 60_000) return
  }
  await tx.insert(noteVersions).values({
    id: uuid(),
    noteId: row.id,
    title: row.title,
    body: row.body,
    words: row.words,
    createdAt: now(),
  })
  const keep = tx
    .select({ id: noteVersions.id })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, row.id))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
    .limit(VERSIONS_KEPT)
  await tx.delete(noteVersions).where(and(eq(noteVersions.noteId, row.id), notInArray(noteVersions.id, keep)))
}

/** Tags as they are kept: cleaned, said once, at most 25 (`TAGS_PER_NOTE`). */
export function cleanTags(tags: readonly string[]): string[] {
  const kept: string[] = []
  for (const tag of tags) {
    const clean = cleanTag(tag)
    if (!kept.includes(clean)) kept.push(clean)
  }
  if (kept.length > TAGS_PER_NOTE) throw new Error(LIBRARY_SAYS.tooManyTags)
  return kept
}

/** The open note's tags, as the tags box now holds them. */
export async function setTags(ownerId: string, id: string, tags: string[]): Promise<NoteCard> {
  const clean = cleanTags(tags)
  await db.transaction(async (tx) => {
    const row = await lockNote(ownerId, id, tx)
    if (row.deletedAt) throw new Error(LIBRARY_SAYS.inTrash)
    await tx.update(noteNotes).set({ tags: clean, updatedAt: now() }).where(eq(noteNotes.id, id))
  })
  return oneCard(ownerId, id)
}

async function ownNotes(tx: Db, ownerId: string, ids: string[], lock = false) {
  if (!ids.length) return []
  const query = tx
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, ids), isNull(noteNotes.deletedAt)))
    // In id order, so two changes to many notes at once lock them the same way round.
    .orderBy(asc(noteNotes.id))
  return lock ? query.for("update") : query
}

function outcome(asked: string[], done: string[]): BulkOutcome {
  return { done, skipped: asked.filter((id) => !done.includes(id)) }
}

/** One tag onto many notes. A note that has it already, or is full, is skipped. */
export async function addTagToNotes(ownerId: string, ids: string[], tag: string): Promise<BulkOutcome> {
  const clean = cleanTag(tag)
  return db.transaction(async (tx) => {
    const done: string[] = []
    for (const row of await ownNotes(tx, ownerId, ids, true)) {
      if (row.tags.includes(clean) || row.tags.length >= TAGS_PER_NOTE) continue
      await tx.update(noteNotes).set({ tags: [...row.tags, clean], updatedAt: now() }).where(eq(noteNotes.id, row.id))
      done.push(row.id)
    }
    return outcome(ids, done)
  })
}

export async function removeTagFromNotes(ownerId: string, ids: string[], tag: string): Promise<BulkOutcome> {
  const clean = cleanTag(tag)
  return db.transaction(async (tx) => {
    const done: string[] = []
    for (const row of await ownNotes(tx, ownerId, ids, true)) {
      if (!row.tags.includes(clean)) continue
      await tx
        .update(noteNotes)
        .set({ tags: row.tags.filter((each) => each !== clean), updatedAt: now() })
        .where(eq(noteNotes.id, row.id))
      done.push(row.id)
    }
    return outcome(ids, done)
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
    .set({ ...set, updatedAt: now() })
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, ids), isNull(noteNotes.deletedAt), only))
    .returning({ id: noteNotes.id })
  return outcome(
    ids,
    rows.map((row) => row.id)
  )
}

export function setPriority(ownerId: string, ids: string[], priority: NotePriority) {
  return stampNotes(ownerId, ids, { priority }, ne(noteNotes.priority, priority))
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
  return stampNotes(ownerId, ids, { deletedAt: now() }, undefined)
}

/**
 * The author on one note: read from the link, and editable (Tyler, 20 Oct
 * 2026: "Read from link but I can edit it"). A plain note can be given one.
 * Notes group under the name, so two accounts edited to one name join.
 */
export async function setAuthor(
  ownerId: string,
  id: string,
  input: { name: string; handle: string | null }
): Promise<NoteCard> {
  const name = cleanAuthorName(input.name)
  const handle = input.handle?.replace(/\s+/g, "").replace(/^@/, "").slice(0, AUTHOR_HANDLE_MAX) || null
  const row = await requireNote(ownerId, id)
  if (row.deletedAt) throw new Error(LIBRARY_SAYS.inTrash)
  await db
    .update(noteNotes)
    .set({ authorName: name || null, authorHandle: name ? handle : null, updatedAt: now() })
    .where(eq(noteNotes.id, id))
  return oneCard(ownerId, id)
}

/** Into one folder of the notes' own library, or out of every folder with null. */
export async function moveToFolder(ownerId: string, ids: string[], folderId: string | null): Promise<BulkOutcome> {
  return db.transaction(async (tx) => {
    const folder = folderId ? await requireFolder(ownerId, folderId, tx) : null
    const done: string[] = []
    for (const row of await ownNotes(tx, ownerId, ids, true)) {
      if (row.folderId === folderId) continue
      if (folder && folder.libraryId !== row.libraryId) continue
      await tx.update(noteNotes).set({ folderId, updatedAt: now() }).where(eq(noteNotes.id, row.id))
      done.push(row.id)
    }
    return outcome(ids, done)
  })
}

/**
 * Into another of this person's libraries (Tyler, 20 Oct 2026: "notes can
 * move to diff libraries"). An import goes into that library's folder for its
 * source, made if it needs to be; a plain note goes loose. Tags and author go
 * with it. A "[[" link to a note left behind turns into plain text, and links
 * from the old library to it go. A link already in the other library is
 * skipped, since the same link is one note in a library.
 */
export async function moveToLibrary(
  ownerId: string,
  ids: string[],
  libraryId: string
): Promise<BulkOutcome & { alreadyThere: number }> {
  return db.transaction(async (tx) => {
    await requireLibrary(ownerId, libraryId, tx)
    const done: string[] = []
    let alreadyThere = 0
    const rows = (await ownNotes(tx, ownerId, ids, true)).filter((row) => row.libraryId !== libraryId)
    // Which notes really go, before any body is rewritten: a link to a note
    // that was skipped must turn into plain text like any other left behind.
    const movers: NoteRow[] = []
    for (const row of rows) {
      if (row.platformId) {
        const [twin] = await tx
          .select({ id: noteNotes.id })
          .from(noteNotes)
          .where(
            and(eq(noteNotes.libraryId, libraryId), eq(noteNotes.source, row.source), eq(noteNotes.platformId, row.platformId))
          )
        if (twin) {
          alreadyThere += 1
          continue
        }
      }
      movers.push(row)
    }
    const moving = new Set(movers.map((each) => each.id))
    for (const row of movers) {
      const folderId = isImportSource(row.source) ? await folderForSource(libraryId, row.source, tx) : null
      const body = unlinkOtherLibraries(row.body, moving)
      await tx
        .update(noteNotes)
        .set({ libraryId, folderId, ...bodyColumns(body), revision: row.revision + 1, updatedAt: now() })
        .where(eq(noteNotes.id, row.id))
      done.push(row.id)
    }
    if (done.length) {
      // Links into the moved notes from notes that stayed, and out of them to notes that stayed.
      await tx
        .delete(noteLinks)
        .where(
          or(
            and(inArray(noteLinks.toNoteId, done), notInArray(noteLinks.fromNoteId, done)),
            and(inArray(noteLinks.fromNoteId, done), notInArray(noteLinks.toNoteId, done))
          )
        )
    }
    return { ...outcome(ids, done), alreadyThere }
  })
}

/** A body with every "[[" link to a note outside `moving` turned into its plain title. */
export function unlinkOtherLibraries(body: JSONContent, moving: ReadonlySet<string>): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === "noteLink" && !moving.has(String(node.attrs?.id ?? ""))) {
      return { type: "text", text: String(node.attrs?.label || "Untitled") }
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node
  }
  return walk(body)
}

/** Brings a note back from Trash into its folder, or loose when that folder has gone. */
export async function restoreNote(ownerId: string, id: string): Promise<NoteCard> {
  const done = await db
    .update(noteNotes)
    .set({ deletedAt: null, updatedAt: now() })
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId), isNotNull(noteNotes.deletedAt)))
    .returning({ id: noteNotes.id })
  if (!done.length) await requireNote(ownerId, id)
  return oneCard(ownerId, id)
}

async function deleteRowsForGood(rows: NoteRow[]) {
  for (const row of rows) {
    await removeNoteFiles(row)
    await db.delete(noteNotes).where(eq(noteNotes.id, row.id))
  }
}

/** Delete for good, from Trash: the note, its earlier copies and its saved files. */
export async function deleteNoteForGood(ownerId: string, id: string): Promise<void> {
  const row = await requireNote(ownerId, id)
  if (!row.deletedAt) throw new Error(LIBRARY_SAYS.noteNotFound)
  await deleteRowsForGood([row])
}

/** Empties one library's Trash now. */
export async function emptyTrash(ownerId: string, libraryId: string): Promise<{ notes: number }> {
  await requireLibrary(ownerId, libraryId)
  const rows = await db
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), eq(noteNotes.libraryId, libraryId), isNotNull(noteNotes.deletedAt)))
  await deleteRowsForGood(rows)
  return { notes: rows.length }
}

/** What the worker clears: anything in anyone's Trash for over 30 days, a batch at a time. */
export async function purgeOldTrash(limit = 50): Promise<number> {
  const cutoff = new Date(now().getTime() - TRASH_DAYS * 24 * 60 * 60_000)
  const rows = await db
    .select()
    .from(noteNotes)
    .where(lt(noteNotes.deletedAt, cutoff))
    .orderBy(asc(noteNotes.deletedAt))
    .limit(limit)
  // One note whose file will not delete is logged and passed over, so it
  // never holds up clearing everybody else's Trash.
  let cleared = 0
  for (const row of rows) {
    try {
      await deleteRowsForGood([row])
      cleared += 1
    } catch (error) {
      console.error("An old note in Trash was not cleared", row.id, error)
    }
  }
  return cleared
}

// ---------------------------------------------------------------------------
// History

export async function listVersions(ownerId: string, noteId: string): Promise<NoteVersionSummary[]> {
  await requireNote(ownerId, noteId)
  const rows = await db
    .select({
      id: noteVersions.id,
      createdAt: noteVersions.createdAt,
      title: noteVersions.title,
      words: noteVersions.words,
    })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
    .limit(VERSIONS_KEPT)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

export async function loadVersion(ownerId: string, noteId: string, versionId: string): Promise<NoteVersion> {
  await requireNote(ownerId, noteId)
  const [row] = await db
    .select()
    .from(noteVersions)
    .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)))
  if (!row) throw new Error(LIBRARY_SAYS.versionNotFound)
  return { id: row.id, createdAt: row.createdAt.toISOString(), title: row.title, words: row.words, body: row.body }
}

/**
 * Puts an earlier copy back. The note as it is now is kept as a copy first,
 * whatever the five-minute rule says, so a restore can itself be undone.
 */
export async function restoreVersion(ownerId: string, input: { noteId: string; versionId: string }): Promise<NoteDetail> {
  await db.transaction(async (tx) => {
    const row = await lockNote(ownerId, input.noteId, tx)
    if (row.deletedAt) throw new Error(LIBRARY_SAYS.inTrash)
    const [version] = await tx
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.id, input.versionId), eq(noteVersions.noteId, input.noteId)))
    if (!version) throw new Error(LIBRARY_SAYS.versionNotFound)
    await keepEarlierCopy(tx, row, true)
    const body = cleanNoteBody(version.body)
    await tx
      .update(noteNotes)
      .set({ title: version.title, ...bodyColumns(body), revision: row.revision + 1, updatedAt: now() })
      .where(eq(noteNotes.id, row.id))
    await rewriteLinks(tx, row, noteBodyFacts(body).linkedIds)
  })
  return loadNote(ownerId, input.noteId)
}
