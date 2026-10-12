import { and, asc, desc, eq, notInArray } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { taskNotesText } from "@/lib/project/notes"
import { LIMITS } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, type ProjectDb, type TaskRow } from "@/server/project/access"
import { projectTaskNoteVersions, projectTasks } from "@/server/project/schema"
import { notesForReader, notesLinkedTaskIds, resolveTaskLinks } from "@/server/project/task-links"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Earlier versions of a task's notes, so an accidental delete of a brief
 * isn't permanent. Each editing session keeps one version however often it
 * saves: the notes save when the editor is left, and leaving for the link
 * box and coming back is still the same session. The newest version is the
 * notes as they are; the 20 before it are listed under "Earlier versions",
 * and bringing one back saves it as a new version, so nothing is lost either
 * way. See `workspace/docs/task-chat.md`, "Earlier versions of the notes".
 */

export type NoteVersion = {
  id: string
  /** Null for the notes as they were before versions were kept, or someone who left. */
  savedBy: string | null
  /** Null for the notes as they were before versions were kept. */
  savedAt: string | null
  /** The start of its words, with # links named for this reader. */
  preview: string
  empty: boolean
}

/**
 * Called with the task's new notes, inside the transaction that saves them.
 * The first edit of a task's notes also keeps what was there before, which
 * nobody wrote with versions kept, so it has no author or time.
 */
export async function keepNotesVersion(
  tx: ProjectDb,
  task: TaskRow,
  notes: string,
  actor: Actor,
  sessionId: string
) {
  const [newest] = await tx
    .select({ id: projectTaskNoteVersions.id })
    .from(projectTaskNoteVersions)
    .where(eq(projectTaskNoteVersions.taskId, task.id))
    .limit(1)
  if (!newest && task.notes.trim()) {
    await tx.insert(projectTaskNoteVersions).values({
      id: uuid(),
      taskId: task.id,
      notes: task.notes,
      savedByUserId: null,
      // Written first, so it stays the oldest whatever the clock says.
      savedAt: new Date(0),
      sessionId: null,
    })
  }
  const [same] = await tx
    .select({ id: projectTaskNoteVersions.id })
    .from(projectTaskNoteVersions)
    .where(
      and(eq(projectTaskNoteVersions.taskId, task.id), eq(projectTaskNoteVersions.sessionId, sessionId))
    )
    .limit(1)
  if (same) {
    await tx
      .update(projectTaskNoteVersions)
      .set({ notes, savedByUserId: actor.id, savedAt: now() })
      .where(eq(projectTaskNoteVersions.id, same.id))
  } else {
    await tx.insert(projectTaskNoteVersions).values({
      id: uuid(),
      taskId: task.id,
      notes,
      savedByUserId: actor.id,
      savedAt: now(),
      sessionId,
    })
  }
  // The current notes and the 20 before them stay; older ones go.
  const kept = await tx
    .select({ id: projectTaskNoteVersions.id })
    .from(projectTaskNoteVersions)
    .where(eq(projectTaskNoteVersions.taskId, task.id))
    .orderBy(desc(projectTaskNoteVersions.savedAt))
    .limit(LIMITS.noteVersions + 1)
  await tx.delete(projectTaskNoteVersions).where(
    and(
      eq(projectTaskNoteVersions.taskId, task.id),
      notInArray(
        projectTaskNoteVersions.id,
        kept.map((row) => row.id)
      )
    )
  )
}

const PREVIEW_LENGTH = 160

/** "Earlier versions": every kept version but the one showing now, newest first. */
export async function listNoteVersions(
  userId: string,
  taskId: string,
  database = db
): Promise<NoteVersion[]> {
  const { membership, task } = await requireTaskAccess(userId, taskId, database, { allowArchived: true })
  const rows = await database
    .select({
      id: projectTaskNoteVersions.id,
      notes: projectTaskNoteVersions.notes,
      savedAt: projectTaskNoteVersions.savedAt,
      sessionId: projectTaskNoteVersions.sessionId,
      savedBy: customShellUsers.name,
    })
    .from(projectTaskNoteVersions)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskNoteVersions.savedByUserId))
    .where(eq(projectTaskNoteVersions.taskId, task.id))
    .orderBy(desc(projectTaskNoteVersions.savedAt), asc(projectTaskNoteVersions.id))
  const earlier = rows[0]?.notes === task.notes ? rows.slice(1) : rows
  const targets = await resolveTaskLinks(
    membership,
    earlier.flatMap((row) => notesLinkedTaskIds(row.notes)),
    database
  )
  return earlier.map((row) => {
    const words = taskNotesText(notesForReader(row.notes, targets), { withTaskLinks: true }).replace(/\s+/g, " ")
    return {
      id: row.id,
      savedBy: row.savedBy,
      savedAt: row.sessionId ? row.savedAt.toISOString() : null,
      preview: words.length > PREVIEW_LENGTH ? `${words.slice(0, PREVIEW_LENGTH - 1)}…` : words,
      empty: !words,
    }
  })
}

/** Puts an earlier version back as the notes, which keeps it as a new version. */
export async function restoreNoteVersion(actor: Actor, versionId: string, database = db) {
  await database.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(projectTaskNoteVersions)
      .where(eq(projectTaskNoteVersions.id, versionId))
      .limit(1)
    if (!version) throw new Error(PROJECT_ERRORS.noteVersionNotFound)
    const { task } = await requireTaskAccess(actor.id, version.taskId, tx).catch((error: unknown) => {
      if (error instanceof Error && error.message === PROJECT_ERRORS.taskNotFound) {
        throw new Error(PROJECT_ERRORS.noteVersionNotFound)
      }
      throw error
    })
    if (version.notes === task.notes) return
    await tx
      .update(projectTasks)
      .set({ notes: version.notes, updatedAt: now() })
      .where(eq(projectTasks.id, task.id))
    await keepNotesVersion(tx, task, version.notes, actor, uuid())
  })
}
