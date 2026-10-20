import { and, asc, count, desc, eq, isNotNull, isNull, max, ne, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import type { Db } from "@/server/note/library/db-types"
import { removeNoteFiles } from "@/server/note/library/files"
import {
  noteFolders,
  noteLibraries,
  noteNotes,
  noteTemplates,
  noteViews,
  type NoteLibraryRow,
} from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import { isSafeImageSrc } from "@/lib/note/notes/body"
import {
  authorKey,
  cleanName,
  FOLDER_NAME_MAX,
  LIBRARY_COLOURS,
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_NAME_MAX,
  LIBRARY_SAYS,
  RECENT_NOTES,
  SOURCE_LABEL,
  TEMPLATE_NAME_MAX,
  VIEW_NAME_MAX,
  type ImportSource,
  type LibraryColour,
  type LibraryFolder,
  type LibraryPage,
  type LibraryRow,
  type NoteFilters,
} from "@/lib/note/library/notes"

/**
 * One person's libraries, each one's folders, saved views and templates, and
 * the figures its left panel shows. Every read and write is scoped to the
 * owner (Tyler, 20 Oct 2026: "Only its owner").
 */

// ---------------------------------------------------------------------------
// Libraries

function cleanColour(colour: string | undefined): LibraryColour {
  return (LIBRARY_COLOURS as readonly string[]).includes(colour ?? "") ? (colour as LibraryColour) : "slate"
}

function cleanPicture(url: string | null | undefined) {
  return url && isSafeImageSrc(url) ? url : null
}

function cleanDescription(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, LIBRARY_DESCRIPTION_MAX)
}

function toRow(row: NoteLibraryRow, noteCount: number, lastEdit: Date | null): LibraryRow {
  const editedAt = lastEdit && lastEdit > row.updatedAt ? lastEdit : row.updatedAt
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    colour: cleanColour(row.colour),
    avatarUrl: row.avatarUrl,
    bannerUrl: row.bannerUrl,
    pinned: row.pinnedAt !== null,
    noteCount,
    editedAt: editedAt.toISOString(),
  }
}

/** Every library of this person's, pinned first, with how many notes each holds. */
export async function listLibraries(ownerId: string): Promise<LibraryRow[]> {
  const rows = await db
    .select({
      library: noteLibraries,
      notes: sql<number>`count(${noteNotes.id}) filter (where ${noteNotes.deletedAt} is null)`,
      lastEdit: max(noteNotes.updatedAt),
    })
    .from(noteLibraries)
    .leftJoin(noteNotes, eq(noteNotes.libraryId, noteLibraries.id))
    .where(eq(noteLibraries.ownerId, ownerId))
    .groupBy(noteLibraries.id)
    .orderBy(sql`${noteLibraries.pinnedAt} desc nulls last`, asc(noteLibraries.name))
  return rows.map((row) => toRow(row.library, Number(row.notes), row.lastEdit))
}

export async function requireLibrary(ownerId: string, id: string, tx: Db = db): Promise<NoteLibraryRow> {
  const [row] = await tx
    .select()
    .from(noteLibraries)
    .where(and(eq(noteLibraries.id, id), eq(noteLibraries.ownerId, ownerId)))
  if (!row) throw new Error(LIBRARY_SAYS.libraryNotFound)
  return row
}

async function libraryRow(ownerId: string, id: string): Promise<LibraryRow> {
  const all = await listLibraries(ownerId)
  const found = all.find((each) => each.id === id)
  if (!found) throw new Error(LIBRARY_SAYS.libraryNotFound)
  return found
}

export async function createLibrary(
  ownerId: string,
  input: { name: string; description?: string; colour?: string }
): Promise<LibraryRow> {
  const at = now()
  const id = uuid()
  try {
    await db.insert(noteLibraries).values({
      id,
      ownerId,
      name: cleanName(input.name, LIBRARY_NAME_MAX, LIBRARY_SAYS.libraryNameEmpty),
      description: cleanDescription(input.description),
      colour: cleanColour(input.colour),
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(LIBRARY_SAYS.libraryTaken)
    throw error
  }
  return libraryRow(ownerId, id)
}

/** The library settings window: name, description, colour, picture and banner. */
export async function updateLibrary(
  ownerId: string,
  id: string,
  changes: {
    name?: string
    description?: string
    colour?: string
    avatarUrl?: string | null
    bannerUrl?: string | null
  }
): Promise<LibraryRow> {
  await requireLibrary(ownerId, id)
  const set: Partial<typeof noteLibraries.$inferInsert> = { updatedAt: now() }
  if (changes.name !== undefined) set.name = cleanName(changes.name, LIBRARY_NAME_MAX, LIBRARY_SAYS.libraryNameEmpty)
  if (changes.description !== undefined) set.description = cleanDescription(changes.description)
  if (changes.colour !== undefined) set.colour = cleanColour(changes.colour)
  if (changes.avatarUrl !== undefined) set.avatarUrl = cleanPicture(changes.avatarUrl)
  if (changes.bannerUrl !== undefined) set.bannerUrl = cleanPicture(changes.bannerUrl)
  try {
    await db
      .update(noteLibraries)
      .set(set)
      .where(and(eq(noteLibraries.id, id), eq(noteLibraries.ownerId, ownerId)))
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(LIBRARY_SAYS.libraryTaken)
    throw error
  }
  return libraryRow(ownerId, id)
}

export async function pinLibrary(ownerId: string, id: string, pinned: boolean): Promise<void> {
  const done = await db
    .update(noteLibraries)
    .set({ pinnedAt: pinned ? now() : null })
    .where(and(eq(noteLibraries.id, id), eq(noteLibraries.ownerId, ownerId)))
    .returning({ id: noteLibraries.id })
  if (!done.length) throw new Error(LIBRARY_SAYS.libraryNotFound)
}

/**
 * Deletes the library and every note in it for good, with their saved files.
 * There is no Trash for libraries; the confirm said how many notes go.
 */
export async function deleteLibrary(ownerId: string, id: string): Promise<{ notes: number }> {
  await requireLibrary(ownerId, id)
  const notes = await db
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.libraryId, id), eq(noteNotes.ownerId, ownerId)))
  // The files first: a failure stops before the rows go, so pressing Delete
  // again finishes the job rather than leaving files nothing points at.
  for (const note of notes) await removeNoteFiles(note)
  await db.delete(noteLibraries).where(and(eq(noteLibraries.id, id), eq(noteLibraries.ownerId, ownerId)))
  return { notes: notes.filter((note) => note.deletedAt === null).length }
}

/**
 * The library the Save from x.com button saves into: the one opened last, or
 * a new one called "My library" for somebody with none yet.
 */
export async function libraryForSaving(ownerId: string): Promise<string> {
  const [last] = await db
    .select({ id: noteLibraries.id })
    .from(noteLibraries)
    .where(eq(noteLibraries.ownerId, ownerId))
    .orderBy(sql`${noteLibraries.lastOpenedAt} desc nulls last`, desc(noteLibraries.createdAt))
    .limit(1)
  if (last) return last.id
  try {
    return (await createLibrary(ownerId, { name: "My library" })).id
  } catch (error) {
    // Made by a second press a moment ago.
    if (error instanceof Error && error.message === LIBRARY_SAYS.libraryTaken) return libraryForSaving(ownerId)
    throw error
  }
}

// ---------------------------------------------------------------------------
// The left panel

/**
 * Everything the dashboard's left panel and headers need: the library, its
 * folders with counts, the four fixed rows' counts, the authors, the tags,
 * Recently opened, the saved views and templates, and the other libraries a
 * note can move to.
 */
export async function loadLibraryPage(ownerId: string, id: string): Promise<LibraryPage> {
  await requireLibrary(ownerId, id)
  const live = and(eq(noteNotes.libraryId, id), isNull(noteNotes.deletedAt))
  const shown = and(live, isNull(noteNotes.archivedAt))

  const [library, folders, folderCounts, counts, authors, tags, recent, views, templates, others] =
    await Promise.all([
      libraryRow(ownerId, id),
      db.select().from(noteFolders).where(eq(noteFolders.libraryId, id)).orderBy(asc(noteFolders.position), asc(noteFolders.name)),
      db
        .select({ folderId: noteNotes.folderId, total: count() })
        .from(noteNotes)
        .where(and(shown, isNotNull(noteNotes.folderId)))
        .groupBy(noteNotes.folderId),
      db
        .select({
          all: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is null)`,
          loose: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is null and ${noteNotes.folderId} is null)`,
          archived: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is not null)`,
          trash: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is not null)`,
        })
        .from(noteNotes)
        .where(eq(noteNotes.libraryId, id)),
      db
        .select({
          key: sql<string>`lower(${noteNotes.authorName})`,
          name: sql<string>`(array_agg(${noteNotes.authorName} order by ${noteNotes.updatedAt} desc))[1]`,
          picture: sql<string | null>`(array_agg(${noteNotes.authorPicturePath} order by ${noteNotes.authorPicturePath} is null, ${noteNotes.updatedAt} desc))[1]`,
          total: count(),
        })
        .from(noteNotes)
        .where(and(shown, isNotNull(noteNotes.authorName), sql`trim(${noteNotes.authorName}) <> ''`))
        .groupBy(sql`1`)
        .orderBy(desc(count()), sql`1`)
        .limit(200),
      db
        .select({ tag: sql<string>`t.tag`, total: count() })
        .from(sql`${noteNotes}, jsonb_array_elements_text(${noteNotes.tags}) as t(tag)`)
        .where(shown)
        .groupBy(sql`t.tag`)
        .orderBy(desc(count()), sql`t.tag`)
        .limit(300),
      db
        .select({ id: noteNotes.id, title: noteNotes.title, openedAt: noteNotes.lastOpenedAt })
        .from(noteNotes)
        .where(and(live, isNotNull(noteNotes.lastOpenedAt)))
        .orderBy(desc(noteNotes.lastOpenedAt))
        .limit(RECENT_NOTES),
      db.select().from(noteViews).where(eq(noteViews.libraryId, id)).orderBy(asc(noteViews.position), asc(noteViews.createdAt)),
      db
        .select({ id: noteTemplates.id, name: noteTemplates.name, position: noteTemplates.position })
        .from(noteTemplates)
        .where(eq(noteTemplates.libraryId, id))
        .orderBy(asc(noteTemplates.position), asc(noteTemplates.createdAt)),
      db
        .select({ id: noteLibraries.id, name: noteLibraries.name, colour: noteLibraries.colour })
        .from(noteLibraries)
        .where(and(eq(noteLibraries.ownerId, ownerId), ne(noteLibraries.id, id)))
        .orderBy(asc(noteLibraries.name)),
    ])

  const countOf = new Map(folderCounts.map((row) => [row.folderId, Number(row.total)]))
  const totals = counts[0]
  return {
    library,
    folders: folders.map(
      (folder): LibraryFolder => ({
        id: folder.id,
        name: folder.name,
        source: folder.source,
        position: folder.position,
        noteCount: countOf.get(folder.id) ?? 0,
      })
    ),
    counts: {
      all: Number(totals?.all ?? 0),
      loose: Number(totals?.loose ?? 0),
      archived: Number(totals?.archived ?? 0),
      trash: Number(totals?.trash ?? 0),
    },
    authors: await Promise.all(
      authors.map(async (author) => ({
        key: author.key,
        name: author.name,
        pictureUrl: author.picture ? await getPublicMediaUrl(author.picture).catch(() => null) : null,
        count: Number(author.total),
      }))
    ),
    tags: tags.map((row) => ({ tag: row.tag, count: Number(row.total) })),
    recent: recent.map((row) => ({ id: row.id, title: row.title, openedAt: (row.openedAt ?? new Date()).toISOString() })),
    views: views.map((view) => ({ id: view.id, name: view.name, filters: view.filters, position: view.position })),
    templates,
    otherLibraries: others.map((other) => ({ ...other, colour: cleanColour(other.colour) })),
  }
}

/** Marks the library as the last one opened, which is where the Save from x.com button saves. */
export async function markLibraryOpened(ownerId: string, id: string): Promise<void> {
  const done = await db
    .update(noteLibraries)
    .set({ lastOpenedAt: now() })
    .where(and(eq(noteLibraries.id, id), eq(noteLibraries.ownerId, ownerId)))
    .returning({ id: noteLibraries.id })
  if (!done.length) throw new Error(LIBRARY_SAYS.libraryNotFound)
}

/** The SQL that matches one author's notes, by the key the Authors card groups on. */
export function authorMatches(author: string) {
  return sql`lower(${noteNotes.authorName}) = ${authorKey(author)}`
}

// ---------------------------------------------------------------------------
// Folders

export async function requireFolder(ownerId: string, folderId: string, tx: Db = db) {
  const [row] = await tx
    .select({ folder: noteFolders })
    .from(noteFolders)
    .innerJoin(noteLibraries, eq(noteLibraries.id, noteFolders.libraryId))
    .where(and(eq(noteFolders.id, folderId), eq(noteLibraries.ownerId, ownerId)))
  if (!row) throw new Error(LIBRARY_SAYS.folderNotFound)
  return row.folder
}

async function nextFolderPosition(libraryId: string, tx: Db) {
  const [row] = await tx
    .select({ top: max(noteFolders.position) })
    .from(noteFolders)
    .where(eq(noteFolders.libraryId, libraryId))
  return (row?.top ?? -1) + 1
}

export async function createFolder(ownerId: string, libraryId: string, name: string): Promise<LibraryFolder> {
  await requireLibrary(ownerId, libraryId)
  const at = now()
  const id = uuid()
  try {
    await db.insert(noteFolders).values({
      id,
      libraryId,
      name: cleanName(name, FOLDER_NAME_MAX, LIBRARY_SAYS.folderNameEmpty),
      position: await nextFolderPosition(libraryId, db),
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(LIBRARY_SAYS.folderTaken)
    throw error
  }
  const folder = await requireFolder(ownerId, id)
  return { id, name: folder.name, source: null, position: folder.position, noteCount: 0 }
}

export async function renameFolder(ownerId: string, folderId: string, name: string): Promise<void> {
  await requireFolder(ownerId, folderId)
  try {
    await db
      .update(noteFolders)
      .set({ name: cleanName(name, FOLDER_NAME_MAX, LIBRARY_SAYS.folderNameEmpty), updatedAt: now() })
      .where(eq(noteFolders.id, folderId))
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(LIBRARY_SAYS.folderTaken)
    throw error
  }
}

/**
 * Deletes the folder. Its notes go to Trash, where Restore brings each back
 * as a loose note, since the folder has gone.
 */
export async function deleteFolder(ownerId: string, folderId: string): Promise<{ notes: number }> {
  return db.transaction(async (tx) => {
    const folder = await requireFolder(ownerId, folderId, tx)
    const at = now()
    const trashed = await tx
      .update(noteNotes)
      .set({ deletedAt: at, folderId: null, updatedAt: at })
      .where(and(eq(noteNotes.folderId, folder.id), isNull(noteNotes.deletedAt)))
      .returning({ id: noteNotes.id })
    await tx.delete(noteFolders).where(eq(noteFolders.id, folder.id))
    return { notes: trashed.length }
  })
}

/**
 * The folder an import from this source is filed in, made the first time
 * (Tyler, 20 Oct 2026: "Import files it there"). It is found by its source,
 * so one renamed by hand is still used. A folder of the same name made by
 * hand is taken over for the source rather than doubled.
 */
export async function folderForSource(libraryId: string, source: ImportSource, tx: Db = db): Promise<string> {
  const [mine] = await tx
    .select({ id: noteFolders.id })
    .from(noteFolders)
    .where(and(eq(noteFolders.libraryId, libraryId), eq(noteFolders.source, source)))
  if (mine) return mine.id
  const name = SOURCE_LABEL[source]
  const [named] = await tx
    .select({ id: noteFolders.id })
    .from(noteFolders)
    .where(and(eq(noteFolders.libraryId, libraryId), sql`lower(${noteFolders.name}) = ${name.toLowerCase()}`, isNull(noteFolders.source)))
  if (named) {
    await tx.update(noteFolders).set({ source, updatedAt: now() }).where(eq(noteFolders.id, named.id))
    return named.id
  }
  const at = now()
  const id = uuid()
  const made = await tx
    .insert(noteFolders)
    .values({ id, libraryId, name, source, position: await nextFolderPosition(libraryId, tx), createdAt: at, updatedAt: at })
    .onConflictDoNothing()
    .returning({ id: noteFolders.id })
  if (made.length) return id
  // Another import made it in the same moment.
  const [raced] = await tx
    .select({ id: noteFolders.id })
    .from(noteFolders)
    .where(and(eq(noteFolders.libraryId, libraryId), eq(noteFolders.source, source)))
  if (!raced) throw new Error(LIBRARY_SAYS.folderTaken)
  return raced.id
}

// ---------------------------------------------------------------------------
// Saved views

export async function createView(
  ownerId: string,
  libraryId: string,
  input: { name: string; filters: NoteFilters }
): Promise<{ id: string }> {
  await requireLibrary(ownerId, libraryId)
  const at = now()
  const id = uuid()
  const [top] = await db.select({ top: max(noteViews.position) }).from(noteViews).where(eq(noteViews.libraryId, libraryId))
  try {
    await db.insert(noteViews).values({
      id,
      libraryId,
      name: cleanName(input.name, VIEW_NAME_MAX, LIBRARY_SAYS.viewNameEmpty),
      filters: input.filters,
      position: (top?.top ?? -1) + 1,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(LIBRARY_SAYS.viewTaken)
    throw error
  }
  return { id }
}

async function requireView(ownerId: string, viewId: string) {
  const [row] = await db
    .select({ id: noteViews.id })
    .from(noteViews)
    .innerJoin(noteLibraries, eq(noteLibraries.id, noteViews.libraryId))
    .where(and(eq(noteViews.id, viewId), eq(noteLibraries.ownerId, ownerId)))
  if (!row) throw new Error(LIBRARY_SAYS.viewNotFound)
}

/** Deleting a view never deletes a note. */
export async function deleteView(ownerId: string, viewId: string): Promise<void> {
  await requireView(ownerId, viewId)
  await db.delete(noteViews).where(eq(noteViews.id, viewId))
}

// ---------------------------------------------------------------------------
// Templates

/** Saves a note's title and text as a template in its library. */
export async function createTemplate(ownerId: string, noteId: string, name: string): Promise<{ id: string }> {
  const [note] = await db
    .select({ libraryId: noteNotes.libraryId, title: noteNotes.title, body: noteNotes.body })
    .from(noteNotes)
    .where(and(eq(noteNotes.id, noteId), eq(noteNotes.ownerId, ownerId)))
  if (!note) throw new Error(LIBRARY_SAYS.noteNotFound)
  const [top] = await db
    .select({ top: max(noteTemplates.position) })
    .from(noteTemplates)
    .where(eq(noteTemplates.libraryId, note.libraryId))
  const at = now()
  const id = uuid()
  await db.insert(noteTemplates).values({
    id,
    libraryId: note.libraryId,
    name: cleanName(name, TEMPLATE_NAME_MAX, LIBRARY_SAYS.templateNameEmpty),
    title: note.title,
    body: note.body,
    position: (top?.top ?? -1) + 1,
    createdAt: at,
    updatedAt: at,
  })
  return { id }
}

export async function deleteTemplate(ownerId: string, templateId: string): Promise<void> {
  const [row] = await db
    .select({ id: noteTemplates.id })
    .from(noteTemplates)
    .innerJoin(noteLibraries, eq(noteLibraries.id, noteTemplates.libraryId))
    .where(and(eq(noteTemplates.id, templateId), eq(noteLibraries.ownerId, ownerId)))
  if (!row) throw new Error(LIBRARY_SAYS.templateNotFound)
  await db.delete(noteTemplates).where(eq(noteTemplates.id, templateId))
}
