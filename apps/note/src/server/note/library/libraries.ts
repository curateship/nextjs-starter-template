import { and, asc, count, desc, eq, isNotNull, isNull, max, ne, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import type { Db } from "@/server/note/library/db-types"
import { removeNoteFiles } from "@/server/note/library/files"
import {
  noteLibraries,
  noteNotes,
  noteTemplates,
  noteViews,
  type NoteLibraryRow,
} from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import {
  authorKey,
  cleanName,
  LIBRARY_COLOURS,
  LIBRARY_NAME_MAX,
  LIBRARY_SAYS,
  TEMPLATE_NAME_MAX,
  VIEW_NAME_MAX,
  type LibraryColour,
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

function toRow(row: NoteLibraryRow, noteCount: number, lastEdit: Date | null): LibraryRow {
  const editedAt = lastEdit && lastEdit > row.updatedAt ? lastEdit : row.updatedAt
  return {
    id: row.id,
    name: row.name,
    colour: cleanColour(row.colour),
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
  input: { name: string; colour?: string }
): Promise<LibraryRow> {
  const at = now()
  const id = uuid()
  try {
    await db.insert(noteLibraries).values({
      id,
      ownerId,
      name: cleanName(input.name, LIBRARY_NAME_MAX, LIBRARY_SAYS.libraryNameEmpty),
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

/**
 * A library row's ⋮: its name and colour. A description, picture and banner
 * showed only on the old `/library` table and went with it (Tyler, 15 Nov
 * 2026); their columns stay, unread.
 */
export async function updateLibrary(
  ownerId: string,
  id: string,
  changes: { name?: string; colour?: string }
): Promise<LibraryRow> {
  await requireLibrary(ownerId, id)
  const set: Partial<typeof noteLibraries.$inferInsert> = { updatedAt: now() }
  if (changes.name !== undefined) set.name = cleanName(changes.name, LIBRARY_NAME_MAX, LIBRARY_SAYS.libraryNameEmpty)
  if (changes.colour !== undefined) set.colour = cleanColour(changes.colour)
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
 * Everything the dashboard's blocks and headers need: the library, the tabs'
 * and Show's counts, the authors for Filter, the tags, the saved views and
 * templates, and the other libraries a note can move to.
 */
export async function loadLibraryPage(ownerId: string, id: string): Promise<LibraryPage> {
  await requireLibrary(ownerId, id)
  const shown = and(eq(noteNotes.libraryId, id), isNull(noteNotes.deletedAt), isNull(noteNotes.archivedAt))

  const [library, counts, authors, tags, views, templates, others] = await Promise.all([
    libraryRow(ownerId, id),
    db
      .select({
        all: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is null)`,
        pinned: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is null and ${noteNotes.pinnedAt} is not null)`,
        archived: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is not null)`,
        trash: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is not null)`,
        // Unticked plan steps, and quotes plus highlighted transcript lines, on shown notes.
        openSteps: sql<number>`coalesce(sum(case when jsonb_typeof(${noteNotes.actionPlan}) = 'array' then jsonb_array_length(jsonb_path_query_array(${noteNotes.actionPlan}, '$[*] ? (@.done == false)')) end) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is null), 0)`,
        quotes: sql<number>`coalesce(sum(
          (case when jsonb_typeof(${noteNotes.quotes}) = 'array' then jsonb_array_length(${noteNotes.quotes}) else 0 end)
          + (case when jsonb_typeof(${noteNotes.highlights}) = 'array' then jsonb_array_length(jsonb_path_query_array(${noteNotes.highlights}, '$[*] ? (@.part starts with "line-")')) else 0 end)
        ) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is null), 0)`,
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

  const totals = counts[0]
  return {
    library,
    counts: {
      all: Number(totals?.all ?? 0),
      pinned: Number(totals?.pinned ?? 0),
      archived: Number(totals?.archived ?? 0),
      trash: Number(totals?.trash ?? 0),
      openSteps: Number(totals?.openSteps ?? 0),
      quotes: Number(totals?.quotes ?? 0),
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
