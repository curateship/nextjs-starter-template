import { createHmac } from "node:crypto"

import { and, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import { keepTaskFiles, noteFileIds } from "@/lib/project/note-blocks"
import { readTaskNotes } from "@/lib/project/notes"
import type { LinkedApp } from "@/lib/project/linked-records"
import type { TaskStatus } from "@/lib/project/rules"
import { db } from "@/server/db"
import { requireMembership, requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { connectedApp, taskLinkFor } from "@/server/project/linked-records"
import { projectTaskFiles, projectTasks } from "@/server/project/schema"
import { resolveTaskLinks } from "@/server/project/task-links"
import { customShellUsers } from "@/server/schema"

/**
 * The server's half of the "/" blocks in notes (Project note blocks task,
 * `workspace/docs/notes-and-blocks.md`): what a Task card shows, which files a
 * saved note may point at, and the Video or Promo card's name and picture.
 */

const assignee = alias(customShellUsers, "assignee")

/** What one reader sees of a Task card's task, read fresh each time the note opens. */
export type NoteTaskCard =
  | {
      taskId: string
      state: "open"
      title: string
      projectId: string
      status: TaskStatus
      assigneeName: string | null
      dueDate: string | null
    }
  | { taskId: string; state: "hidden" }
  | { taskId: string; state: "deleted" }

/**
 * The Task cards in one note, in one call. Who may see each task is decided
 * by the same check # links use (`resolveTaskLinks`), so a card never shows
 * more of a task than a # link to it would.
 */
export async function loadNoteTaskCards(userId: string, taskIds: readonly string[], database: ProjectDb = db): Promise<NoteTaskCard[]> {
  const membership = await requireMembership(userId, database)
  const targets = await resolveTaskLinks(membership, taskIds, database)
  const open = [...targets].flatMap(([id, target]) => (target.state === "open" ? [id] : []))
  const rows = open.length
    ? await database
        .select({
          id: projectTasks.id,
          status: projectTasks.status,
          dueDate: projectTasks.dueDate,
          assigneeName: assignee.name,
        })
        .from(projectTasks)
        .leftJoin(assignee, eq(assignee.id, projectTasks.assigneeUserId))
        .where(and(inArray(projectTasks.id, open), isNull(projectTasks.deletedAt)))
    : []
  const byId = new Map(rows.map((row) => [row.id, row]))
  return [...targets].map(([taskId, target]): NoteTaskCard => {
    const row = byId.get(taskId)
    if (target.state !== "open" || !row) return { taskId, state: target.state === "hidden" ? "hidden" : "deleted" }
    return {
      taskId,
      state: "open",
      title: target.title,
      projectId: target.projectId,
      status: row.status,
      assigneeName: row.assigneeName ?? null,
      dueDate: row.dueDate,
    }
  })
}

/**
 * The notes about to be saved on a task, keeping only File blocks and
 * uploaded pictures whose file is on that task. A file from another task, or
 * from another team, never stays in the note, so a note can't be made to show
 * someone else's file. With no task yet (New task), every one goes.
 */
export async function withOwnFiles(notes: string, taskId: string | null, database: ProjectDb): Promise<string> {
  const read = readTaskNotes(notes)
  if (read.kind === "text") return notes
  const wanted = noteFileIds(read.body)
  if (!wanted.length) return notes
  const rows = taskId
    ? await database
        .select({ id: projectTaskFiles.id })
        .from(projectTaskFiles)
        .where(and(eq(projectTaskFiles.taskId, taskId), inArray(projectTaskFiles.id, wanted)))
    : []
  if (rows.length === wanted.length) return notes
  return JSON.stringify(keepTaskFiles(read.body, new Set(rows.map((row) => row.id))))
}

/** Where Video and Promo answer with one record's name and picture. */
export const RECORD_CARD_PATH = "/api/connect/project/record-card"

/** How long a card request is good for, in seconds. */
const CARD_REQUEST_SECONDS = 60
const CARD_TIMEOUT_MS = 3_000

/**
 * The stamp on a card request: an HMAC of `record-card.v1.<record>.<exp>`
 * with the key Project shares with the app. The words in front keep it from
 * ever passing as a sign-in note, whose stamp covers the note's own text.
 */
export function stampCardRequest(record: string, exp: number, key: string) {
  return createHmac("sha256", key).update(`record-card.v1.${record}.${exp}`).digest("base64url")
}

/** What the Video or Promo card shows. */
export type NoteRecordCard = {
  app: LinkedApp
  /** This person may press the button: the person assigned or the site admin. */
  canOpen: boolean
  connected: boolean
  /** The record's name and picture, asked of the app as the card opens. Null when it didn't answer. */
  name: string | null
  pictureUrl: string | null
}

const cardAnswer = z.object({
  name: z.string().trim().min(1).max(200),
  pictureUrl: z
    .string()
    .max(2048)
    .nullable()
    .transform((value) => (value?.startsWith("https://") ? value : null)),
})

/**
 * The task's Video or Promo record as its card shows it. Only someone who may
 * press the button gets the name and picture; everyone else on the task reads
 * the line the task panel already shows. Project keeps no copy: it asks the
 * app each time, and an app that is down or slow leaves the card nameless.
 */
export async function loadNoteRecordCard(
  user: { id: string },
  taskId: string,
  {
    database = db,
    env = process.env,
    fetcher = fetch,
    now = Date.now(),
  }: { database?: ProjectDb; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: number } = {}
): Promise<NoteRecordCard | null> {
  const { membership, task } = await requireTaskAccess(user.id, taskId, database, { allowArchived: true })
  const link = taskLinkFor(task, { userId: user.id, siteAdmin: membership.siteAdmin }, env)
  if (!link || !task.linkedRecordId) return null
  const card: NoteRecordCard = { app: link.app, canOpen: link.canOpen, connected: link.connected, name: null, pictureUrl: null }
  const settings = connectedApp(link.app, env)
  if (!link.canOpen || !settings) return card
  const exp = Math.floor(now / 1000) + CARD_REQUEST_SECONDS
  const address = new URL(RECORD_CARD_PATH, settings.origin)
  address.searchParams.set("record", task.linkedRecordId)
  address.searchParams.set("exp", String(exp))
  address.searchParams.set("sig", stampCardRequest(task.linkedRecordId, exp, settings.key))
  try {
    const response = await fetcher(address, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(CARD_TIMEOUT_MS),
    })
    if (!response.ok) return card
    const answer = cardAnswer.safeParse(await response.json())
    return answer.success ? { ...card, ...answer.data } : card
  } catch {
    return card
  }
}
