import { and, asc, eq, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import type { Db } from "@/server/note/notes/db-types"
import { folderFields } from "@/server/note/notes/fields"
import { requireLiveFolder, toView } from "@/server/note/notes/folders"
import { noteNoteFolders, noteNotes, noteNoteTemplates, noteNoteViews } from "@/server/note/schema"
import { cleanNoteBody, EMPTY_BODY } from "@/lib/note/notes/body"
import { cleanFieldValues } from "@/lib/note/notes/fields"
import {
  cleanNoteTitle,
  NOTES_SAY,
  TEMPLATE_NAME_MAX,
  VIEW_NAME_MAX,
  type NoteTemplate,
} from "@/lib/note/notes/notes"
import {
  cleanViewSettings,
  MAX_VIEWS_PER_FOLDER,
  VIEWS_SAY,
  type NoteView,
  type ViewKind,
  type ViewSettings,
} from "@/lib/note/notes/views"

/**
 * A folder's templates (what a new note in it starts with) and its saved
 * views (a named way of looking at it). Both belong to the folder (Tyler,
 * 18 Oct 2026) and go when it is deleted for good.
 */

function cleanName(name: string, max: number, empty: string) {
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, max)
  if (!cleaned) throw new Error(empty)
  return cleaned
}

async function nextPosition(table: typeof noteNoteTemplates | typeof noteNoteViews, folderId: string, tx: Db) {
  const [last] = await tx
    .select({ position: sql<number>`coalesce(max(${table.position}), -1)` })
    .from(table)
    .where(eq(table.folderId, folderId))
  return Number(last?.position ?? -1) + 1
}

// ---------------------------------------------------------------------------
// Templates

async function ownTemplate(ownerId: string, templateId: string, tx: Db = db) {
  const [row] = await tx
    .select({ template: noteNoteTemplates })
    .from(noteNoteTemplates)
    .innerJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNoteTemplates.folderId))
    .where(and(eq(noteNoteTemplates.id, templateId), eq(noteNoteFolders.ownerId, ownerId)))
  if (!row) throw new Error(NOTES_SAY.templateNotFound)
  return row.template
}

function toTemplate(row: typeof noteNoteTemplates.$inferSelect): NoteTemplate {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    position: row.position,
    title: row.title,
    body: row.body,
    values: row.fieldValues,
  }
}

export async function loadTemplate(ownerId: string, templateId: string): Promise<NoteTemplate> {
  return toTemplate(await ownTemplate(ownerId, templateId))
}

/** A new template, blank or copied from one of the folder's notes ("Save as template"). */
export async function createTemplate(
  ownerId: string,
  input: { folderId: string; name: string; fromNoteId?: string | null }
): Promise<NoteTemplate> {
  const name = cleanName(input.name, TEMPLATE_NAME_MAX, NOTES_SAY.templateNameEmpty)
  return db.transaction(async (tx) => {
    await requireLiveFolder(ownerId, input.folderId, tx)
    let title = ""
    let body = EMPTY_BODY
    let values = {}
    if (input.fromNoteId) {
      const [note] = await tx
        .select()
        .from(noteNotes)
        .where(and(eq(noteNotes.id, input.fromNoteId), eq(noteNotes.ownerId, ownerId)))
      if (!note) throw new Error(NOTES_SAY.noteNotFound)
      title = note.title
      body = note.body
      values = note.folderId === input.folderId ? note.fieldValues : {}
    }
    const at = now()
    const [row] = await tx
      .insert(noteNoteTemplates)
      .values({
        id: uuid(),
        folderId: input.folderId,
        name,
        title,
        body,
        fieldValues: values,
        position: await nextPosition(noteNoteTemplates, input.folderId, tx),
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return toTemplate(row)
  })
}

export async function updateTemplate(
  ownerId: string,
  templateId: string,
  input: { name?: string; title?: string; body?: unknown; values?: Record<string, unknown> }
): Promise<NoteTemplate> {
  return db.transaction(async (tx) => {
    const template = await ownTemplate(ownerId, templateId, tx)
    const changes: Partial<typeof noteNoteTemplates.$inferInsert> = { updatedAt: now() }
    if (input.name !== undefined) {
      changes.name = cleanName(input.name, TEMPLATE_NAME_MAX, NOTES_SAY.templateNameEmpty)
    }
    if (input.title !== undefined) changes.title = cleanNoteTitle(input.title)
    if (input.body !== undefined) changes.body = cleanNoteBody(input.body)
    if (input.values !== undefined) {
      changes.fieldValues = cleanFieldValues(await folderFields(template.folderId, tx), input.values)
    }
    const [row] = await tx
      .update(noteNoteTemplates)
      .set(changes)
      .where(eq(noteNoteTemplates.id, templateId))
      .returning()
    return toTemplate(row)
  })
}

export async function deleteTemplate(ownerId: string, templateId: string) {
  await ownTemplate(ownerId, templateId)
  await db.delete(noteNoteTemplates).where(eq(noteNoteTemplates.id, templateId))
}

export async function reorderTemplates(ownerId: string, folderId: string, ids: string[]) {
  await reorder(ownerId, folderId, ids, noteNoteTemplates, NOTES_SAY.templateNotFound)
}

// ---------------------------------------------------------------------------
// Views

async function ownView(ownerId: string, viewId: string, tx: Db = db) {
  const [row] = await tx
    .select({ view: noteNoteViews })
    .from(noteNoteViews)
    .innerJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNoteViews.folderId))
    .where(and(eq(noteNoteViews.id, viewId), eq(noteNoteFolders.ownerId, ownerId)))
  if (!row) throw new Error(NOTES_SAY.viewNotFound)
  return row.view
}

/** A new saved view, checked against the folder's fields. */
export async function createView(
  ownerId: string,
  input: { folderId: string; name: string; kind: ViewKind; settings: ViewSettings }
): Promise<NoteView> {
  const name = cleanName(input.name, VIEW_NAME_MAX, NOTES_SAY.viewNameEmpty)
  return db.transaction(async (tx) => {
    await requireLiveFolder(ownerId, input.folderId, tx)
    const [{ views }] = await tx
      .select({ views: sql<number>`count(*)` })
      .from(noteNoteViews)
      .where(eq(noteNoteViews.folderId, input.folderId))
    if (Number(views) >= MAX_VIEWS_PER_FOLDER) {
      throw new Error(VIEWS_SAY.tooMany)
    }
    const fields = await folderFields(input.folderId, tx)
    const settings = cleanViewSettings(fields, input.settings)
    const at = now()
    const [row] = await tx
      .insert(noteNoteViews)
      .values({
        id: uuid(),
        folderId: input.folderId,
        name,
        kind: input.kind,
        ...settings,
        position: await nextPosition(noteNoteViews, input.folderId, tx),
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return toView(row, fields)
  })
}

export async function updateView(
  ownerId: string,
  viewId: string,
  input: { name?: string; kind?: ViewKind; settings?: ViewSettings }
): Promise<NoteView> {
  return db.transaction(async (tx) => {
    const view = await ownView(ownerId, viewId, tx)
    const fields = await folderFields(view.folderId, tx)
    const [row] = await tx
      .update(noteNoteViews)
      .set({
        ...(input.name !== undefined
          ? { name: cleanName(input.name, VIEW_NAME_MAX, NOTES_SAY.viewNameEmpty) }
          : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.settings !== undefined ? cleanViewSettings(fields, input.settings) : {}),
        updatedAt: now(),
      })
      .where(eq(noteNoteViews.id, viewId))
      .returning()
    return toView(row, fields)
  })
}

export async function deleteView(ownerId: string, viewId: string) {
  await ownView(ownerId, viewId)
  await db.delete(noteNoteViews).where(eq(noteNoteViews.id, viewId))
}

export async function reorderViews(ownerId: string, folderId: string, ids: string[]) {
  await reorder(ownerId, folderId, ids, noteNoteViews, NOTES_SAY.viewNotFound)
}

async function reorder(
  ownerId: string,
  folderId: string,
  ids: string[],
  table: typeof noteNoteTemplates | typeof noteNoteViews,
  missing: string
) {
  await db.transaction(async (tx) => {
    await requireLiveFolder(ownerId, folderId, tx)
    const rows = await tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.folderId, folderId))
      .orderBy(asc(table.position))
    const known = new Set(rows.map((row) => row.id))
    if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
      throw new Error(missing)
    }
    const at = now()
    for (const [position, id] of ids.entries()) {
      await tx.update(table).set({ position, updatedAt: at }).where(eq(table.id, id))
    }
  })
}
