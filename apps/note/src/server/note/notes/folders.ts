import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { readFields } from "@/server/note/notes/fields"
import {
  noteNoteFolders,
  noteNotes,
  noteNoteTemplates,
  noteNoteViews,
} from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import type { Db } from "@/server/note/notes/db-types"
import { cleanIcon } from "@/lib/note/notes/icons"
import {
  cleanFolderName,
  folderAndBelow,
  folderDepth,
  MAX_FOLDER_DEPTH,
  NOTES_FOLDER_NAME_MAX,
  NOTES_SAY,
  type NoteFolder,
  type NoteFolderTree,
} from "@/lib/note/notes/notes"
import { cleanViewSettings, type NoteView } from "@/lib/note/notes/views"

/**
 * One person's note folders. A folder can sit inside another, and each has
 * its own fields, views and templates. A folder sent to Trash takes the
 * folders and notes under it along (Tyler, 18 Oct 2026), and restoring it
 * brings exactly those back. Every read and write is scoped to the owner.
 */

/** Every live folder with its fields, views and template names, plus the counts. */
export async function listTree(ownerId: string): Promise<NoteFolderTree> {
  const folders = await db
    .select()
    .from(noteNoteFolders)
    .where(and(eq(noteNoteFolders.ownerId, ownerId), isNull(noteNoteFolders.deletedAt)))
    .orderBy(asc(noteNoteFolders.position), asc(noteNoteFolders.createdAt))
  const ids = folders.map((folder) => folder.id)

  const [fields, views, templates, perFolder, counts] = await Promise.all([
    readFields(ids),
    ids.length
      ? db
          .select()
          .from(noteNoteViews)
          .where(inArray(noteNoteViews.folderId, ids))
          .orderBy(asc(noteNoteViews.position), asc(noteNoteViews.createdAt))
      : [],
    ids.length
      ? db
          .select({
            id: noteNoteTemplates.id,
            folderId: noteNoteTemplates.folderId,
            name: noteNoteTemplates.name,
            position: noteNoteTemplates.position,
          })
          .from(noteNoteTemplates)
          .where(inArray(noteNoteTemplates.folderId, ids))
          .orderBy(asc(noteNoteTemplates.position), asc(noteNoteTemplates.createdAt))
      : [],
    db
      .select({ folderId: noteNotes.folderId, notes: count() })
      .from(noteNotes)
      .where(
        and(eq(noteNotes.ownerId, ownerId), isNull(noteNotes.deletedAt), isNull(noteNotes.archivedAt))
      )
      .groupBy(noteNotes.folderId),
    db
      .select({
        archived: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is null and ${noteNotes.archivedAt} is not null)`,
        trashedNotes: sql<number>`count(*) filter (where ${noteNotes.deletedAt} is not null and ${noteNotes.trashedWithFolderId} is null)`,
      })
      .from(noteNotes)
      .where(eq(noteNotes.ownerId, ownerId)),
  ])
  const [trashedFolders] = await db
    .select({ folders: count() })
    .from(noteNoteFolders)
    .where(
      and(
        eq(noteNoteFolders.ownerId, ownerId),
        isNotNull(noteNoteFolders.deletedAt),
        isNull(noteNoteFolders.trashedWithFolderId)
      )
    )

  const noteCounts = new Map(perFolder.map((row) => [row.folderId, Number(row.notes)]))
  return {
    folders: folders.map(
      (folder): NoteFolder => ({
        id: folder.id,
        parentId: folder.parentId,
        name: folder.name,
        icon: folder.icon,
        position: folder.position,
        noteCount: noteCounts.get(folder.id) ?? 0,
        fields: fields.get(folder.id) ?? [],
        views: views
          .filter((view) => view.folderId === folder.id)
          .map((view) => toView(view, fields.get(folder.id) ?? [])),
        templates: templates
          .filter((template) => template.folderId === folder.id)
          .map(({ id, name, position }) => ({ id, name, position })),
      })
    ),
    counts: {
      // Live notes in live folders and loose ones. Notes in a trashed folder
      // went to Trash with it, so they are already out of this count.
      all: perFolder.reduce((sum, row) => sum + Number(row.notes), 0),
      loose: noteCounts.get(null) ?? 0,
      archived: Number(counts[0]?.archived ?? 0),
      trash: Number(counts[0]?.trashedNotes ?? 0) + Number(trashedFolders?.folders ?? 0),
    },
  }
}

export function toView(
  row: typeof noteNoteViews.$inferSelect,
  fields: Parameters<typeof cleanViewSettings>[0]
): NoteView {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    kind: row.kind,
    position: row.position,
    ...cleanViewSettings(fields, {
      filters: row.filters,
      sort: row.sort,
      groupBy: row.groupBy,
      totals: row.totals,
    }),
  }
}

/** A live folder of this person's, or the refusal. */
export async function requireLiveFolder(ownerId: string, folderId: string, tx: Db = db) {
  const [folder] = await tx
    .select()
    .from(noteNoteFolders)
    .where(and(eq(noteNoteFolders.id, folderId), eq(noteNoteFolders.ownerId, ownerId)))
  if (!folder) throw new Error(NOTES_SAY.folderNotFound)
  if (folder.deletedAt) throw new Error(NOTES_SAY.folderInTrash)
  return folder
}

async function liveFolders(ownerId: string, tx: Db) {
  return tx
    .select({ id: noteNoteFolders.id, parentId: noteNoteFolders.parentId })
    .from(noteNoteFolders)
    .where(and(eq(noteNoteFolders.ownerId, ownerId), isNull(noteNoteFolders.deletedAt)))
}

async function nextPosition(ownerId: string, parentId: string | null, tx: Db) {
  const [last] = await tx
    .select({ position: sql<number>`coalesce(max(${noteNoteFolders.position}), -1)` })
    .from(noteNoteFolders)
    .where(
      and(
        eq(noteNoteFolders.ownerId, ownerId),
        parentId ? eq(noteNoteFolders.parentId, parentId) : isNull(noteNoteFolders.parentId),
        isNull(noteNoteFolders.deletedAt)
      )
    )
  return Number(last?.position ?? -1) + 1
}

/** Makes a folder at the foot of its parent's list, or at the top level. */
export async function createFolder(
  ownerId: string,
  input: { name: string; parentId: string | null }
): Promise<{ id: string; tree: NoteFolderTree }> {
  const name = cleanFolderName(input.name)
  const id = uuid()
  try {
    await db.transaction(async (tx) => {
      if (input.parentId) {
        await requireLiveFolder(ownerId, input.parentId, tx)
        if (folderDepth(await liveFolders(ownerId, tx), input.parentId) >= MAX_FOLDER_DEPTH) {
          throw new Error(NOTES_SAY.folderTooDeep)
        }
      }
      const at = now()
      await tx.insert(noteNoteFolders).values({
        id,
        ownerId,
        parentId: input.parentId,
        name,
        position: await nextPosition(ownerId, input.parentId, tx),
        createdAt: at,
        updatedAt: at,
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(NOTES_SAY.folderTaken)
    throw error
  }
  return { id, tree: await listTree(ownerId) }
}

export async function updateFolder(
  ownerId: string,
  folderId: string,
  input: { name?: string; icon?: string | null }
): Promise<NoteFolderTree> {
  await requireLiveFolder(ownerId, folderId)
  try {
    await db
      .update(noteNoteFolders)
      .set({
        ...(input.name !== undefined ? { name: cleanFolderName(input.name) } : {}),
        ...(input.icon !== undefined ? { icon: cleanIcon(input.icon) } : {}),
        updatedAt: now(),
      })
      .where(and(eq(noteNoteFolders.id, folderId), eq(noteNoteFolders.ownerId, ownerId)))
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(NOTES_SAY.folderTaken)
    throw error
  }
  return listTree(ownerId)
}

/**
 * Puts a folder inside another one (or at the top level) at a place in that
 * list. Refused when it would go inside itself or one of its own folders, or
 * would make the tree deeper than six.
 */
export async function moveFolder(
  ownerId: string,
  folderId: string,
  input: { parentId: string | null; orderedIds: string[] }
): Promise<NoteFolderTree> {
  try {
    await db.transaction(async (tx) => {
      await requireLiveFolder(ownerId, folderId, tx)
      const folders = await liveFolders(ownerId, tx)
      if (input.parentId) {
        await requireLiveFolder(ownerId, input.parentId, tx)
        if (folderAndBelow(folders, folderId).has(input.parentId)) {
          throw new Error(NOTES_SAY.folderIntoItself)
        }
        const below = folderAndBelow(folders, folderId)
        const height = Math.max(
          ...[...below].map((id) => folderDepth(folders, id) - folderDepth(folders, folderId) + 1)
        )
        if (folderDepth(folders, input.parentId) + height > MAX_FOLDER_DEPTH) {
          throw new Error(NOTES_SAY.folderTooDeep)
        }
      }
      const siblings = folders.filter(
        (folder) => (folder.parentId ?? null) === input.parentId && folder.id !== folderId
      )
      const wanted = [...siblings.map((folder) => folder.id), folderId]
      if (
        input.orderedIds.length !== wanted.length ||
        new Set(input.orderedIds).size !== input.orderedIds.length ||
        input.orderedIds.some((id) => !wanted.includes(id))
      ) {
        throw new Error(NOTES_SAY.folderNotFound)
      }
      const at = now()
      for (const [position, id] of input.orderedIds.entries()) {
        await tx
          .update(noteNoteFolders)
          .set({ position, updatedAt: at, ...(id === folderId ? { parentId: input.parentId } : {}) })
          .where(and(eq(noteNoteFolders.id, id), eq(noteNoteFolders.ownerId, ownerId)))
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(NOTES_SAY.folderTaken)
    throw error
  }
  return listTree(ownerId)
}

/**
 * Sends a folder to Trash with every folder and note under it (Tyler,
 * 18 Oct 2026). Each of those remembers which folder it went with, so a note
 * already in Trash on its own stays on its own.
 */
export async function trashFolder(ownerId: string, folderId: string) {
  const moved = await db.transaction(async (tx) => {
    await requireLiveFolder(ownerId, folderId, tx)
    const below = [...folderAndBelow(await liveFolders(ownerId, tx), folderId)]
    const at = now()
    await tx
      .update(noteNoteFolders)
      .set({ deletedAt: at, trashedWithFolderId: null, updatedAt: at })
      .where(and(eq(noteNoteFolders.id, folderId), eq(noteNoteFolders.ownerId, ownerId)))
    const others = below.filter((id) => id !== folderId)
    if (others.length) {
      await tx
        .update(noteNoteFolders)
        .set({ deletedAt: at, trashedWithFolderId: folderId, updatedAt: at })
        .where(and(inArray(noteNoteFolders.id, others), eq(noteNoteFolders.ownerId, ownerId)))
    }
    const notes = await tx
      .update(noteNotes)
      .set({ deletedAt: at, trashedWithFolderId: folderId })
      .where(
        and(
          eq(noteNotes.ownerId, ownerId),
          inArray(noteNotes.folderId, below),
          isNull(noteNotes.deletedAt)
        )
      )
      .returning({ id: noteNotes.id })
    return { folders: below.length, notes: notes.length }
  })
  return { ...moved, tree: await listTree(ownerId) }
}

/**
 * Brings a folder back from Trash with exactly what went with it. If the
 * folder it sat in is gone or still in Trash, it comes back at the top
 * level. A name taken meanwhile gets " (restored)" on the end.
 */
export async function restoreFolder(ownerId: string, folderId: string): Promise<NoteFolderTree> {
  await db.transaction(async (tx) => {
    const [folder] = await tx
      .select()
      .from(noteNoteFolders)
      .where(
        and(
          eq(noteNoteFolders.id, folderId),
          eq(noteNoteFolders.ownerId, ownerId),
          isNotNull(noteNoteFolders.deletedAt),
          isNull(noteNoteFolders.trashedWithFolderId)
        )
      )
    if (!folder) throw new Error(NOTES_SAY.folderNotFound)
    let parentId = folder.parentId
    if (parentId) {
      const [parent] = await tx
        .select({ deletedAt: noteNoteFolders.deletedAt })
        .from(noteNoteFolders)
        .where(eq(noteNoteFolders.id, parentId))
      if (!parent || parent.deletedAt) parentId = null
    }
    const taken = await tx
      .select({ name: noteNoteFolders.name })
      .from(noteNoteFolders)
      .where(
        and(
          eq(noteNoteFolders.ownerId, ownerId),
          parentId ? eq(noteNoteFolders.parentId, parentId) : isNull(noteNoteFolders.parentId),
          isNull(noteNoteFolders.deletedAt)
        )
      )
    const names = new Set(taken.map((row) => row.name.toLowerCase()))
    // The name is cut short to make room for the ending, never the ending cut
    // off, so each try is a different name and the loop ends: there are only
    // so many folders beside it.
    let name = folder.name
    for (let n = 1; names.has(name.toLowerCase()); n += 1) {
      const ending = ` (restored${n > 1 ? ` ${n}` : ""})`
      name = `${folder.name.slice(0, NOTES_FOLDER_NAME_MAX - ending.length).trimEnd()}${ending}`
    }
    const at = now()
    await tx
      .update(noteNoteFolders)
      .set({ deletedAt: null, parentId, name, position: await nextPosition(ownerId, parentId, tx), updatedAt: at })
      .where(eq(noteNoteFolders.id, folderId))
    await tx
      .update(noteNoteFolders)
      .set({ deletedAt: null, trashedWithFolderId: null, updatedAt: at })
      .where(and(eq(noteNoteFolders.ownerId, ownerId), eq(noteNoteFolders.trashedWithFolderId, folderId)))
    await tx
      .update(noteNotes)
      .set({ deletedAt: null, trashedWithFolderId: null })
      .where(and(eq(noteNotes.ownerId, ownerId), eq(noteNotes.trashedWithFolderId, folderId)))
  })
  return listTree(ownerId)
}

/** Folders in Trash that went there themselves, with how many notes went along. */
export async function trashedFolders(ownerId: string) {
  const rows = await db
    .select({ id: noteNoteFolders.id, name: noteNoteFolders.name, deletedAt: noteNoteFolders.deletedAt })
    .from(noteNoteFolders)
    .where(
      and(
        eq(noteNoteFolders.ownerId, ownerId),
        isNotNull(noteNoteFolders.deletedAt),
        isNull(noteNoteFolders.trashedWithFolderId)
      )
    )
    .orderBy(desc(noteNoteFolders.deletedAt))
  if (!rows.length) return []
  const counts = await db
    .select({ folderId: noteNotes.trashedWithFolderId, notes: count() })
    .from(noteNotes)
    .where(
      and(
        eq(noteNotes.ownerId, ownerId),
        inArray(
          noteNotes.trashedWithFolderId,
          rows.map((row) => row.id)
        )
      )
    )
    .groupBy(noteNotes.trashedWithFolderId)
  const byFolder = new Map(counts.map((row) => [row.folderId, Number(row.notes)]))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    deletedAt: (row.deletedAt as Date).toISOString(),
    noteCount: byFolder.get(row.id) ?? 0,
  }))
}

/** A trashed folder deleted for good now, with what went to Trash with it. */
export async function deleteFolderForGood(ownerId: string, folderId: string, tx: Db = db) {
  await tx
    .delete(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), eq(noteNotes.trashedWithFolderId, folderId)))
  // The folders inside go with it through the parent link.
  await tx
    .delete(noteNoteFolders)
    .where(
      and(
        eq(noteNoteFolders.ownerId, ownerId),
        or(eq(noteNoteFolders.id, folderId), eq(noteNoteFolders.trashedWithFolderId, folderId)),
        isNotNull(noteNoteFolders.deletedAt)
      )
    )
}
