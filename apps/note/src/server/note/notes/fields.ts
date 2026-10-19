import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import type { Db } from "@/server/note/notes/db-types"
import { cleanTimeZone, syncNoteReminders } from "@/server/note/notes/reminders"
import { noteNoteFields, noteNoteFolders, noteNoteReminders, noteNotes } from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import {
  cleanFieldName,
  cleanFieldValues,
  cleanOptions,
  FIELDS_SAY,
  fieldsSearchText,
  makeFieldKey,
  MAX_FIELDS_PER_FOLDER,
  sameName,
  type NoteField,
  type NoteFieldOption,
  type NoteFieldType,
} from "@/lib/note/notes/fields"
import { NOTES_SAY } from "@/lib/note/notes/notes"

/**
 * A folder's own fields. Each change that could leave a note holding a value
 * its field no longer allows (an option taken away, a field deleted) cleans
 * that folder's notes in the same transaction, so a stored value always fits.
 */

function toField(row: typeof noteNoteFields.$inferSelect): NoteField {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    options: row.options,
    remind: row.remind,
    position: row.position,
  }
}

/** Every listed folder's fields, in their order. */
export async function readFields(folderIds: string[], tx: Db = db): Promise<Map<string, NoteField[]>> {
  const out = new Map<string, NoteField[]>()
  if (!folderIds.length) return out
  const rows = await tx
    .select()
    .from(noteNoteFields)
    .where(inArray(noteNoteFields.folderId, folderIds))
    .orderBy(asc(noteNoteFields.position), asc(noteNoteFields.createdAt))
  for (const row of rows) {
    const list = out.get(row.folderId) ?? []
    list.push(toField(row))
    out.set(row.folderId, list)
  }
  return out
}

/** One folder's fields; a loose note's "folder" has none. */
export async function folderFields(folderId: string | null, tx: Db = db): Promise<NoteField[]> {
  if (!folderId) return []
  return (await readFields([folderId], tx)).get(folderId) ?? []
}

/** The folder, checked as this person's and not in Trash. */
async function ownFolder(ownerId: string, folderId: string, tx: Db) {
  const [folder] = await tx
    .select({ id: noteNoteFolders.id, deletedAt: noteNoteFolders.deletedAt })
    .from(noteNoteFolders)
    .where(and(eq(noteNoteFolders.id, folderId), eq(noteNoteFolders.ownerId, ownerId)))
  if (!folder) throw new Error(NOTES_SAY.folderNotFound)
  if (folder.deletedAt) throw new Error(NOTES_SAY.folderInTrash)
}

async function ownField(ownerId: string, fieldId: string, tx: Db) {
  const [row] = await tx
    .select({ field: noteNoteFields })
    .from(noteNoteFields)
    .innerJoin(noteNoteFolders, eq(noteNoteFolders.id, noteNoteFields.folderId))
    .where(and(eq(noteNoteFields.id, fieldId), eq(noteNoteFolders.ownerId, ownerId)))
  if (!row) throw new Error(FIELDS_SAY.fieldNotFound)
  return row.field
}

export type FieldInput = {
  name: string
  type: NoteFieldType
  options: NoteFieldOption[]
  remind: boolean
}

function cleanInput(input: FieldInput) {
  if (input.remind && input.type !== "date") throw new Error(FIELDS_SAY.remindOnlyDates)
  return {
    name: cleanFieldName(input.name),
    type: input.type,
    options: cleanOptions(input.type, input.options),
    remind: input.type === "date" && input.remind,
  }
}

export async function createField(ownerId: string, folderId: string, input: FieldInput): Promise<NoteField> {
  const clean = cleanInput(input)
  try {
    return await db.transaction(async (tx) => {
      await ownFolder(ownerId, folderId, tx)
      const existing = await folderFields(folderId, tx)
      if (existing.length >= MAX_FIELDS_PER_FOLDER) throw new Error(FIELDS_SAY.tooMany)
      if (existing.some((field) => sameName(field.name, clean.name))) throw new Error(FIELDS_SAY.nameTaken)
      const at = now()
      const [row] = await tx
        .insert(noteNoteFields)
        .values({
          id: uuid(),
          folderId,
          key: makeFieldKey(clean.name, existing.map((field) => field.key)),
          ...clean,
          position: existing.length,
          createdAt: at,
          updatedAt: at,
        })
        .returning()
      return toField(row)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(FIELDS_SAY.nameTaken)
    throw error
  }
}

/**
 * Renames a field, changes its options or its reminder switch. The type can
 * change only while no note holds a value in it (the default Tyler agreed on
 * 18 Oct 2026); after that a new field is made instead.
 */
export async function updateField(
  ownerId: string,
  fieldId: string,
  input: FieldInput,
  timeZone?: string
): Promise<NoteField> {
  const clean = cleanInput(input)
  try {
    return await db.transaction(async (tx) => {
      const field = await ownField(ownerId, fieldId, tx)
      const siblings = await folderFields(field.folderId, tx)
      if (siblings.some((other) => other.id !== fieldId && sameName(other.name, clean.name))) {
        throw new Error(FIELDS_SAY.nameTaken)
      }
      if (clean.type !== field.type) {
        const [used] = await tx
          .select({ id: noteNotes.id })
          .from(noteNotes)
          .where(and(eq(noteNotes.folderId, field.folderId), sql`${noteNotes.fieldValues} ? ${field.key}`))
          .limit(1)
        if (used) throw new Error(FIELDS_SAY.typeLocked)
      }
      const [row] = await tx
        .update(noteNoteFields)
        .set({ ...clean, updatedAt: now() })
        .where(eq(noteNoteFields.id, fieldId))
        .returning()
      await recleanFolderNotes(field.folderId, tx)
      if (clean.remind && !field.remind) {
        // Switched on: every date already filled in gets its reminder now.
        const fields = await folderFields(field.folderId, tx)
        const notes = await tx
          .select({ id: noteNotes.id, values: noteNotes.fieldValues })
          .from(noteNotes)
          .where(
            and(
              eq(noteNotes.folderId, field.folderId),
              isNull(noteNotes.deletedAt),
              sql`${noteNotes.fieldValues} ? ${field.key}`
            )
          )
        for (const note of notes) await syncNoteReminders(tx, note, fields, cleanTimeZone(timeZone))
      }
      if (!clean.remind) {
        await tx
          .delete(noteNoteReminders)
          .where(
            and(
              eq(noteNoteReminders.fieldKey, field.key),
              inArray(
                noteNoteReminders.noteId,
                tx.select({ id: noteNotes.id }).from(noteNotes).where(eq(noteNotes.folderId, field.folderId))
              )
            )
          )
      }
      return toField(row)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(FIELDS_SAY.nameTaken)
    throw error
  }
}

/** Deletes a field and every value notes held in it, with its reminders. */
export async function deleteField(ownerId: string, fieldId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const field = await ownField(ownerId, fieldId, tx)
    await tx.delete(noteNoteFields).where(eq(noteNoteFields.id, fieldId))
    await tx
      .delete(noteNoteReminders)
      .where(
        and(
          eq(noteNoteReminders.fieldKey, field.key),
          inArray(
            noteNoteReminders.noteId,
            tx.select({ id: noteNotes.id }).from(noteNotes).where(eq(noteNotes.folderId, field.folderId))
          )
        )
      )
    await recleanFolderNotes(field.folderId, tx)
  })
}

/** How many notes in the field's folder hold a value in it, for the delete warning. */
export async function fieldUseCount(ownerId: string, fieldId: string): Promise<number> {
  const field = await ownField(ownerId, fieldId, db)
  const [row] = await db
    .select({ notes: sql<number>`count(*)` })
    .from(noteNotes)
    .where(and(eq(noteNotes.folderId, field.folderId), sql`${noteNotes.fieldValues} ? ${field.key}`))
  return Number(row?.notes ?? 0)
}

export async function reorderFields(ownerId: string, folderId: string, fieldIds: string[]) {
  await db.transaction(async (tx) => {
    await ownFolder(ownerId, folderId, tx)
    const existing = await folderFields(folderId, tx)
    const known = new Set(existing.map((field) => field.id))
    if (
      fieldIds.length !== known.size ||
      new Set(fieldIds).size !== fieldIds.length ||
      fieldIds.some((id) => !known.has(id))
    ) {
      throw new Error(FIELDS_SAY.fieldNotFound)
    }
    const at = now()
    for (const [position, id] of fieldIds.entries()) {
      await tx.update(noteNoteFields).set({ position, updatedAt: at }).where(eq(noteNoteFields.id, id))
    }
  })
}

/**
 * Every note in a folder with its values cleaned against the folder's fields
 * as they are now, and its search words rewritten to match. Run after any
 * field change, inside the same transaction.
 */
async function recleanFolderNotes(folderId: string, tx: Db) {
  const fields = await folderFields(folderId, tx)
  const notes = await tx
    .select({ id: noteNotes.id, values: noteNotes.fieldValues, text: noteNotes.fieldsText })
    .from(noteNotes)
    .where(eq(noteNotes.folderId, folderId))
  for (const note of notes) {
    const values = cleanFieldValues(fields, note.values)
    const text = fieldsSearchText(fields, values)
    if (JSON.stringify(values) === JSON.stringify(note.values) && text === note.text) continue
    await tx.update(noteNotes).set({ fieldValues: values, fieldsText: text }).where(eq(noteNotes.id, note.id))
  }
}
