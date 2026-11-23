import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { linkedIds } from "@/lib/project/mentions"
import { NOTE_LINK, isNoteLink, linkIdOf, noteHref, readTaskNotes } from "@/lib/project/notes"
import { taskHref } from "@/lib/project/notices"
import type { NoteNode } from "@/lib/project/note-blocks"
import { db } from "@/server/db"
import {
  requireMembership,
  visibleProjectIds,
  visibleProjectsWhere,
  type Membership,
  type ProjectDb,
} from "@/server/project/access"
import { resolveNoteLinks } from "@/server/project/project-notes"
import { projectProjects, projectTasks } from "@/server/project/schema"

/**
 * # task links, in chat messages and in a task's notes. A link is saved with
 * the title as it was written, and that title is never sent on as it is.
 * Each reader gets the task's current title when they can see it, "a task you
 * can't see" when they can't, and "deleted task" once it is in a bin or gone.
 * See `workspace/docs/task-chat.md`, "Linking a task with #".
 *
 * A # link may point at a project's note instead (task "Project notes"). It
 * is kept under `note:` and the note's id (`NOTE_LINK`), and read the same
 * way: the note's first line, "a note you can't see" or "deleted note".
 */

export const HIDDEN_TASK = "a task you can't see"
export const DELETED_TASK = "deleted task"
export const HIDDEN_NOTE = "a note you can't see"
export const DELETED_NOTE = "deleted note"

/** What one reader sees of a linked task or note. */
export type LinkTarget =
  | { state: "open"; title: string; projectId: string }
  | { state: "hidden" }
  | { state: "deleted" }

/** The words a reader sees for a link: `linkId` says whether it is a task's or a note's. */
export function linkName(target: LinkTarget | undefined, linkId: string) {
  const note = isNoteLink(linkId)
  if (!target || target.state === "deleted") return note ? DELETED_NOTE : DELETED_TASK
  if (target.state === "hidden") return note ? HIDDEN_NOTE : HIDDEN_TASK
  return target.title
}

/**
 * Every linked task and note as this reader sees it, under its link id: a
 * task's id, or `note:` and a note's.
 */
export async function resolveLinks(
  membership: Membership,
  linkIds: readonly string[],
  database: ProjectDb
): Promise<Map<string, LinkTarget>> {
  const noteIds = linkIds.filter(isNoteLink).map((id) => id.slice(NOTE_LINK.length))
  const targets = await resolveTaskLinks(
    membership,
    linkIds.filter((id) => !isNoteLink(id)),
    database
  )
  for (const [id, target] of await resolveNoteLinks(membership, noteIds, database)) {
    targets.set(NOTE_LINK + id, target)
  }
  return targets
}

/** Every linked task as this reader sees it. A task in another team reads as deleted. */
export async function resolveTaskLinks(
  membership: Membership,
  taskIds: readonly string[],
  database: ProjectDb
): Promise<Map<string, LinkTarget>> {
  const targets = new Map<string, LinkTarget>()
  const wanted = [...new Set(taskIds)]
  if (wanted.length === 0) return targets
  const rows = await database
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
      deletedAt: projectTasks.deletedAt,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(and(inArray(projectTasks.id, wanted), eq(projectProjects.teamId, membership.teamId)))
  const visible = await visibleProjectIds(membership, database)
  const found = new Map(rows.map((row) => [row.id, row]))
  for (const id of wanted) {
    const row = found.get(id)
    // Whether a task someone can't see is in a bin is no business of theirs either.
    if (row && !visible.has(row.projectId)) targets.set(id, { state: "hidden" })
    else if (!row || row.deletedAt) targets.set(id, { state: "deleted" })
    else targets.set(id, { state: "open", title: row.title, projectId: row.projectId })
  }
  return targets
}

/** The tasks and notes a reader can open, link id to project id, for the screen to draw as links. */
export function openableLinks(targets: Map<string, LinkTarget>): Record<string, string> {
  const open: Record<string, string> = {}
  for (const [id, target] of targets) if (target.state === "open") open[id] = target.projectId
  return open
}

/** The writer may link only tasks and notes they can open right now. */
export async function requireLinkable(membership: Membership, body: string, database: ProjectDb) {
  const ids = linkedIds(body)
  if (ids.length === 0) return
  const targets = await resolveLinks(membership, ids, database)
  const closed = ids.filter((id) => targets.get(id)?.state !== "open")
  if (closed.some((id) => !isNoteLink(id))) throw new Error(PROJECT_ERRORS.linkNotVisible)
  if (closed.length) throw new Error(PROJECT_ERRORS.noteLinkNotVisible)
}

/** Every task and note the notes link to, under their link ids. Plain-text notes have none. */
export function notesLinkIds(stored: string): string[] {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return []
  const ids: string[] = []
  const walk = (node: NoteNode) => {
    for (const mark of node.marks ?? []) {
      const linkId = mark.type === "link" && mark.attrs ? linkIdOf(mark.attrs.href) : null
      if (linkId) ids.push(linkId)
    }
    node.content?.forEach(walk)
  }
  walk(notes.body)
  return [...new Set(ids)]
}

/**
 * The notes as this reader sees them: each task link's words become the
 * task's current title, "a task you can't see" or "deleted task", and an
 * open one points at the task's project as it is now. A note link becomes
 * the note's first line, "a note you can't see" or "deleted note". A link split over
 * several pieces of text (half of it bold) becomes one piece with the name.
 * The link itself stays, so saving notes never loses one.
 */
export function notesForReader(stored: string, targets: Map<string, LinkTarget>): string {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return stored
  const rename = (node: NoteNode): NoteNode => {
    if (!node.content) return node
    const content: NoteNode[] = []
    let lastLinkId: string | null = null
    for (const child of node.content) {
      const link = child.marks?.find((mark) => mark.type === "link")
      const linkId = child.type === "text" && link?.attrs ? linkIdOf(link.attrs.href) : null
      if (!linkId) {
        lastLinkId = null
        content.push(rename(child))
        continue
      }
      if (linkId === lastLinkId) continue
      lastLinkId = linkId
      const target = targets.get(linkId)
      content.push({
        ...child,
        text: linkName(target, linkId),
        marks: child.marks?.map((mark) =>
          mark.type === "link" && target?.state === "open"
            ? { type: "link", attrs: { href: linkHref(target.projectId, linkId) } }
            : mark
        ),
      })
    }
    return { ...node, content }
  }
  return JSON.stringify(rename(notes.body))
}

/** Where an open link goes: the task, or the project page with the note open. */
function linkHref(projectId: string, linkId: string) {
  return isNoteLink(linkId) ? noteHref(projectId, linkId.slice(NOTE_LINK.length)) : taskHref(projectId, linkId)
}

export type LinkChoice = { id: string; title: string; projectId: string; projectName: string }

/** Tasks this person can see whose title holds the words, for the # list. Newest change first. */
export async function findTasksToLink(userId: string, q: string, database = db): Promise<LinkChoice[]> {
  const membership = await requireMembership(userId, database)
  const words = q.trim()
  return database
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
      projectName: projectProjects.name,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        visibleProjectsWhere(membership),
        isNull(projectTasks.deletedAt),
        words ? ilike(projectTasks.title, `%${words.replace(/[\\%_]/g, (character) => `\\${character}`)}%`) : undefined
      )
    )
    .orderBy(desc(projectTasks.updatedAt))
    .limit(8)
}
