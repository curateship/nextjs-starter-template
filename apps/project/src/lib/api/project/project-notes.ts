import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { findLinkableTasks } from "@/lib/api/project/chat"
import { teamScope } from "@/lib/api/project/scope"
import { storedTaskNotes } from "@/lib/project/notes"
import { LIMITS } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { inTeam } from "@/server/project/access"
import {
  createProjectNote,
  deleteProjectNote,
  duplicateProjectNote,
  findNotesToLink,
  listProjectNotes,
  moveProjectNote,
  pinProjectNote,
  restoreProjectNote,
  saveProjectNote,
} from "@/server/project/project-notes"

export type { ProjectNote, ProjectNotesList } from "@/server/project/project-notes"

const id = z.string().min(1).max(36)

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) => listProjectNotes(context.user.id, data.projectId))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) => createProjectNote(context.user.id, data.projectId))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      noteId: id,
      // Cleaned to what a note may hold before it is measured, as a task's notes are.
      body: z
        .unknown()
        .transform((value) => storedTaskNotes(value))
        .refine((body) => body.length <= LIMITS.taskNotes, "The note is too long. Split it into two notes."),
    })
  )
  .handler(async ({ data, context }) => saveProjectNote(context.user.id, data))

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => duplicateProjectNote(context.user.id, data.noteId))

const pinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, pinned: z.boolean() }))
  .handler(async ({ data, context }) => pinProjectNote(context.user.id, data))

const moveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, beforeId: id.nullable() }))
  .handler(async ({ data, context }) => moveProjectNote(context.user.id, data))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => deleteProjectNote(context.user.id, data.noteId))

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => restoreProjectNote(context.user.id, data.noteId))

const findNotesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ q: z.string().max(200), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => findNotesToLink(context.user.id, data.q)))

export function loadProjectNotes(projectId: string) {
  return listFn({ data: { projectId } })
}
export function newProjectNote(projectId: string) {
  return createFn({ data: { projectId } })
}
export function saveNote(noteId: string, body: unknown) {
  return saveFn({ data: { noteId, body } })
}
export function duplicateNote(noteId: string) {
  return duplicateFn({ data: { noteId } })
}
export function pinNote(noteId: string, pinned: boolean) {
  return pinFn({ data: { noteId, pinned } })
}
export function moveNote(noteId: string, beforeId: string | null) {
  return moveFn({ data: { noteId, beforeId } })
}
export function deleteNote(noteId: string) {
  return deleteFn({ data: { noteId } })
}
export function restoreNote(noteId: string) {
  return restoreFn({ data: { noteId } })
}

/**
 * What # lists in a task's notes and in chat: tasks first, then project notes,
 * each found by its words. A note's id comes as `note:<id>` (`NOTE_LINK`).
 */
export async function findLinkTargets(q: string, teamId?: string) {
  const [tasks, notes] = await Promise.all([findLinkableTasks(q, teamId), findNotesFn({ data: { q, teamId } })])
  return [...tasks, ...notes]
}
