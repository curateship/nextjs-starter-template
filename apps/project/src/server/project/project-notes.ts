import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, min } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { noteTitle } from "@/lib/project/project-notes"
import { NOTE_LINK, storedNotesForCopy } from "@/lib/project/notes"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireMembership,
  requireOpenProject,
  requireProjectAccess,
  visibleProjectIds,
  visibleProjectsWhere,
  type Membership,
  type ProjectDb,
} from "@/server/project/access"
import { projectNotes, projectProjects } from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * A project's notes, behind the note icon in its left panel's header (task
 * "Project notes"; Tyler, 6 Nov 2026: "Add a note feature here ... like in
 * travel app"). See `workspace/docs/project-notes.md`.
 *
 * - Everyone who can see the project writes its team notes ("Everyone on the
 *   project"), and an archived project's notes read only.
 * - There are no private notes (Tyler, 6 Nov 2026: "remove the privacy
 *   feature"). Whoever can see the project sees all its notes, so a "Just me"
 *   list's notes are its person's and the site admin's, like the list.
 * - Pins and the order are the same for everyone ("Same for everyone").
 * - Delete puts a note in the project's bin for 30 days with Undo ("Bin with
 *   Undo, no ask").
 */

export const MAX_PROJECT_NOTES = 200

export type ProjectNote = {
  id: string
  /** The first line, without the words of any # link (`noteTitle`). */
  title: string
  body: string
  pinned: boolean
  writer: { id: string; name: string; avatarUrl: string } | null
  updatedAt: string
}

export type ProjectNotesList = {
  notes: ProjectNote[]
  /** False on an archived project, where the notes read only. */
  canWrite: boolean
}

/** The order every list draws in: pinned first, then by place, newest first on a tie. */
const ORDER = [desc(projectNotes.pinned), asc(projectNotes.position), desc(projectNotes.createdAt)] as const

/**
 * The note, when this person may see it. A note on a project they can't see
 * and, unless `allowDeleted`, one in the bin both answer as missing. `write` needs the project open, not archived.
 */
async function requireNote(
  userId: string,
  noteId: string,
  database: ProjectDb,
  { write, allowDeleted = false }: { write: boolean; allowDeleted?: boolean }
) {
  const [note] = await database.select().from(projectNotes).where(eq(projectNotes.id, noteId)).limit(1)
  if (!note) throw new Error(PROJECT_ERRORS.noteNotFound)
  let access: Awaited<ReturnType<typeof requireProjectAccess>>
  try {
    access = write
      ? await requireOpenProject(userId, note.projectId, database)
      : await requireProjectAccess(userId, note.projectId, database)
  } catch (error) {
    // A project someone can't see says nothing of the notes on it.
    if (error instanceof Error && error.message === PROJECT_ERRORS.projectNotFound) {
      throw new Error(PROJECT_ERRORS.noteNotFound)
    }
    throw error
  }
  if (note.deletedAt && !allowDeleted) throw new Error(PROJECT_ERRORS.noteNotFound)
  return { note, ...access }
}

async function liveCount(projectId: string, database: ProjectDb) {
  const [row] = await database
    .select({ value: count() })
    .from(projectNotes)
    .where(and(eq(projectNotes.projectId, projectId), isNull(projectNotes.deletedAt)))
  return row?.value ?? 0
}

/** A place before every note on the project, so a note put there comes first in its group. */
async function topPosition(projectId: string, database: ProjectDb) {
  const [row] = await database
    .select({ value: min(projectNotes.position) })
    .from(projectNotes)
    .where(eq(projectNotes.projectId, projectId))
  return row?.value === null || row?.value === undefined ? 0 : row.value - 1
}

/** The project's notes this person may see, in the order everyone shares. */
export async function listProjectNotes(
  userId: string,
  projectId: string,
  database: ProjectDb = db
): Promise<ProjectNotesList> {
  const { project } = await requireProjectAccess(userId, projectId, database)
  const rows = await database
    .select({
      note: projectNotes,
      writerName: customShellUsers.name,
      writerAvatar: customShellUsers.avatarUrl,
    })
    .from(projectNotes)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectNotes.writerUserId))
    .where(and(eq(projectNotes.projectId, projectId), isNull(projectNotes.deletedAt)))
    .orderBy(...ORDER)
  return {
    notes: rows.map(({ note, writerName, writerAvatar }) => ({
        id: note.id,
        title: noteTitle(note.body),
        body: note.body,
        pinned: note.pinned,
        writer:
          note.writerUserId && writerName !== null
            ? { id: note.writerUserId, name: writerName, avatarUrl: writerAvatar ?? "" }
            : null,
        updatedAt: note.updatedAt.toISOString(),
      })),
    canWrite: !project.archivedAt,
  }
}

/** A new, empty note at the top of the unpinned ones. */
export async function createProjectNote(userId: string, projectId: string, database: ProjectDb = db) {
  const { project } = await requireOpenProject(userId, projectId, database)
  if ((await liveCount(project.id, database)) >= MAX_PROJECT_NOTES) throw new Error(PROJECT_ERRORS.tooManyNotes)
  const at = now()
  const id = uuid()
  await database.insert(projectNotes).values({
    id,
    projectId: project.id,
    writerUserId: userId,
    body: "",
    position: await topPosition(project.id, database),
    createdAt: at,
    updatedAt: at,
  })
  return { id }
}

/**
 * Saves what was written. A project note has no task, so it keeps the
 * project page's rule: no File block, uploaded picture or Video or Promo card.
 */
export async function saveProjectNote(
  userId: string,
  input: { noteId: string; body: string },
  database: ProjectDb = db
) {
  const { note } = await requireNote(userId, input.noteId, database, { write: true })
  await database
    .update(projectNotes)
    .set({ body: storedNotesForCopy(input.body, { noTask: true }), updatedAt: now() })
    .where(eq(projectNotes.id, note.id))
}

/**
 * A copy of the note at the top of the unpinned ones, written by whoever made
 * the copy.
 */
export async function duplicateProjectNote(userId: string, noteId: string, database: ProjectDb = db) {
  const { note } = await requireNote(userId, noteId, database, { write: true })
  if ((await liveCount(note.projectId, database)) >= MAX_PROJECT_NOTES) throw new Error(PROJECT_ERRORS.tooManyNotes)
  const at = now()
  const id = uuid()
  await database.insert(projectNotes).values({
    id,
    projectId: note.projectId,
    writerUserId: userId,
    body: note.body,
    position: await topPosition(note.projectId, database),
    createdAt: at,
    updatedAt: at,
  })
  return { id }
}

/** Pins a note to the top of the pinned ones, or unpins it to the top of the rest. */
export async function pinProjectNote(
  userId: string,
  input: { noteId: string; pinned: boolean },
  database: ProjectDb = db
) {
  const { note } = await requireNote(userId, input.noteId, database, { write: true })
  if (note.pinned === input.pinned) return
  await database
    .update(projectNotes)
    .set({ pinned: input.pinned, position: await topPosition(note.projectId, database) })
    .where(eq(projectNotes.id, note.id))
}

/**
 * Moves one note to just before another in its own group, or to the end of
 * its group when `beforeId` is null.
 */
export async function moveProjectNote(
  userId: string,
  input: { noteId: string; beforeId: string | null },
  database: ProjectDb = db
) {
  await database.transaction(async (tx) => {
    const { note } = await requireNote(userId, input.noteId, tx, { write: true })
    if (input.beforeId === note.id) return
    const before = input.beforeId ? (await requireNote(userId, input.beforeId, tx, { write: true })).note : null
    if (before && (before.projectId !== note.projectId || before.pinned !== note.pinned)) {
      throw new Error(PROJECT_ERRORS.pinnedNotesFirst)
    }
    const order = (
      await tx
        .select({ id: projectNotes.id, pinned: projectNotes.pinned })
        .from(projectNotes)
        .where(and(eq(projectNotes.projectId, note.projectId), isNull(projectNotes.deletedAt)))
        .orderBy(...ORDER)
    ).filter((row) => row.id !== note.id)
    // With no note to go before, the end of its own group: pinned notes end where the rest begin.
    const end = note.pinned ? order.filter((row) => row.pinned).length : order.length
    const at = before ? order.findIndex((row) => row.id === before.id) : end
    order.splice(at, 0, { id: note.id, pinned: note.pinned })
    for (const [position, row] of order.entries()) {
      await tx.update(projectNotes).set({ position }).where(eq(projectNotes.id, row.id))
    }
  })
}

/** Puts a note in the project's bin. Undo and the Bin bring it back. */
export async function deleteProjectNote(userId: string, noteId: string, database: ProjectDb = db) {
  const { note } = await requireNote(userId, noteId, database, { write: true })
  await database
    .update(projectNotes)
    .set({ deletedAt: now(), deletedByUserId: userId })
    .where(eq(projectNotes.id, note.id))
}

/** Takes a note out of the bin, back where it was. Whoever may delete it may bring it back. */
export async function restoreProjectNote(userId: string, noteId: string, database: ProjectDb = db) {
  const { note } = await requireNote(userId, noteId, database, { write: true, allowDeleted: true })
  if (!note.deletedAt) return
  if ((await liveCount(note.projectId, database)) >= MAX_PROJECT_NOTES) throw new Error(PROJECT_ERRORS.tooManyNotes)
  await database
    .update(projectNotes)
    .set({ deletedAt: null, deletedByUserId: null })
    .where(eq(projectNotes.id, note.id))
}

/** The project's binned notes, newest first, for the Bin. The caller has checked the project. */
export async function binnedProjectNotes(projectId: string, database: ProjectDb) {
  const rows = await database
    .select({ note: projectNotes, deletedByName: customShellUsers.name })
    .from(projectNotes)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectNotes.deletedByUserId))
    .where(and(eq(projectNotes.projectId, projectId), isNotNull(projectNotes.deletedAt)))
    .orderBy(desc(projectNotes.deletedAt))
  return rows.map(({ note, deletedByName }) => ({
    id: note.id,
    title: noteTitle(note.body),
    deletedAt: note.deletedAt!.toISOString(),
    deletedByName,
  }))
}

/** Deletes one project's binned notes for good (Empty bin). */
export async function purgeBinnedNotes(projectId: string, database: ProjectDb) {
  await database
    .delete(projectNotes)
    .where(and(eq(projectNotes.projectId, projectId), isNotNull(projectNotes.deletedAt)))
}

/** Deletes for good every note that has sat in a bin since before `cutoff`. */
export async function purgeOldBinnedNotes(cutoff: Date, database: ProjectDb) {
  await database.delete(projectNotes).where(and(isNotNull(projectNotes.deletedAt), lt(projectNotes.deletedAt, cutoff)))
}

/** What one reader sees of a linked note: its first line, or why it can't be opened. */
export type NoteLinkTarget =
  | { state: "open"; title: string; projectId: string }
  | { state: "hidden" }
  | { state: "deleted" }

/**
 * Every linked note as this reader sees it. A note on a project they can't
 * see is hidden; one in a bin, gone or in another team is deleted.
 */
export async function resolveNoteLinks(
  membership: Membership,
  noteIds: readonly string[],
  database: ProjectDb
): Promise<Map<string, NoteLinkTarget>> {
  const targets = new Map<string, NoteLinkTarget>()
  const wanted = [...new Set(noteIds)]
  if (wanted.length === 0) return targets
  const rows = await database
    .select({ note: projectNotes })
    .from(projectNotes)
    .innerJoin(projectProjects, eq(projectProjects.id, projectNotes.projectId))
    .where(and(inArray(projectNotes.id, wanted), eq(projectProjects.teamId, membership.teamId)))
  const visible = await visibleProjectIds(membership, database)
  const found = new Map(rows.map((row) => [row.note.id, row.note]))
  for (const id of wanted) {
    const note = found.get(id)
    // Whether a note someone can't see is in a bin is no business of theirs either.
    if (note && !visible.has(note.projectId)) targets.set(id, { state: "hidden" })
    else if (!note || note.deletedAt) targets.set(id, { state: "deleted" })
    else targets.set(id, { state: "open", title: noteTitle(note.body), projectId: note.projectId })
  }
  return targets
}

/** Notes looked through for the # list: the most recently changed this many. */
const LINK_SEARCH_DEPTH = 500

/**
 * Notes this person can open whose first line holds the words, for the #
 * list, newest change first. Each comes back under its link id (`note:<id>`).
 */
export async function findNotesToLink(userId: string, q: string, database: ProjectDb = db) {
  const membership = await requireMembership(userId, database)
  const rows = await database
    .select({ note: projectNotes, projectName: projectProjects.name })
    .from(projectNotes)
    .innerJoin(projectProjects, eq(projectProjects.id, projectNotes.projectId))
    .where(and(visibleProjectsWhere(membership), isNull(projectNotes.deletedAt)))
    .orderBy(desc(projectNotes.updatedAt))
    .limit(LINK_SEARCH_DEPTH)
  const words = q.trim().toLowerCase()
  return rows
    .map((row) => ({ row, title: noteTitle(row.note.body) }))
    .filter(({ title }) => !words || title.toLowerCase().includes(words))
    .slice(0, 8)
    .map(({ row, title }) => ({
      id: NOTE_LINK + row.note.id,
      title,
      projectId: row.note.projectId,
      projectName: row.projectName,
    }))
}
