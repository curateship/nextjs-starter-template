import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { linkedTaskIds } from "@/lib/project/mentions"
import { linkedTaskOf, readTaskNotes } from "@/lib/project/notes"
import { taskHref } from "@/lib/project/notices"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { db } from "@/server/db"
import {
  requireMembership,
  visibleProjectIds,
  visibleProjectsWhere,
  type Membership,
  type ProjectDb,
} from "@/server/project/access"
import { projectProjects, projectTasks } from "@/server/project/schema"

/**
 * # task links, in chat messages and in a task's notes. A link is saved with
 * the title as it was written, and that title is never sent on as it is.
 * Each reader gets the task's current title when they can see it, "a task you
 * can't see" when they can't, and "deleted task" once it is in a bin or gone.
 * See `workspace/docs/task-chat.md`, "Linking a task with #".
 */

export const HIDDEN_TASK = "a task you can't see"
export const DELETED_TASK = "deleted task"

/** What one reader sees of a linked task. */
export type LinkTarget =
  | { state: "open"; title: string; projectId: string }
  | { state: "hidden" }
  | { state: "deleted" }

export function linkName(target: LinkTarget | undefined) {
  if (!target || target.state === "deleted") return DELETED_TASK
  return target.state === "hidden" ? HIDDEN_TASK : target.title
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

/** The tasks a reader can open, task id to project id, for the screen to draw as links. */
export function openableLinks(targets: Map<string, LinkTarget>): Record<string, string> {
  const open: Record<string, string> = {}
  for (const [id, target] of targets) if (target.state === "open") open[id] = target.projectId
  return open
}

/** The writer may link only tasks they can open right now. */
export async function requireLinkable(membership: Membership, body: string, database: ProjectDb) {
  const ids = linkedTaskIds(body)
  if (ids.length === 0) return
  const targets = await resolveTaskLinks(membership, ids, database)
  if (ids.some((id) => targets.get(id)?.state !== "open")) {
    throw new Error(PROJECT_ERRORS.linkNotVisible)
  }
}

/** Every task the notes link to. Plain-text notes have none. */
export function notesLinkedTaskIds(stored: string): string[] {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return []
  const ids: string[] = []
  const walk = (node: WrittenPageNode) => {
    for (const mark of node.marks ?? []) {
      const taskId = mark.type === "link" && mark.attrs ? linkedTaskOf(mark.attrs.href) : null
      if (taskId) ids.push(taskId)
    }
    node.content?.forEach(walk)
  }
  walk(notes.body)
  return [...new Set(ids)]
}

/**
 * The notes as this reader sees them: each task link's words become the
 * task's current title, "a task you can't see" or "deleted task", and an
 * open one points at the task's project as it is now. A link split over
 * several pieces of text (half of it bold) becomes one piece with the name.
 * The link itself stays, so saving notes never loses one.
 */
export function notesForReader(stored: string, targets: Map<string, LinkTarget>): string {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return stored
  const rename = (node: WrittenPageNode): WrittenPageNode => {
    if (!node.content) return node
    const content: WrittenPageNode[] = []
    let lastTaskId: string | null = null
    for (const child of node.content) {
      const link = child.marks?.find((mark) => mark.type === "link")
      const taskId = child.type === "text" && link?.attrs ? linkedTaskOf(link.attrs.href) : null
      if (!taskId) {
        lastTaskId = null
        content.push(rename(child))
        continue
      }
      if (taskId === lastTaskId) continue
      lastTaskId = taskId
      const target = targets.get(taskId)
      content.push({
        ...child,
        text: linkName(target),
        marks: child.marks?.map((mark) =>
          mark.type === "link" && target?.state === "open"
            ? { type: "link", attrs: { href: taskHref(target.projectId, taskId) } }
            : mark
        ),
      })
    }
    return { ...node, content }
  }
  return JSON.stringify(rename(notes.body))
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
