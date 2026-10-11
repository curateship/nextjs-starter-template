import { and, eq, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { TaskEventKind, TaskStatus } from "@/lib/project/rules"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import type { ProjectDb } from "@/server/project/access"
import {
  projectCheckinItems,
  projectCheckins,
  projectProjects,
  projectTaskEvents,
  projectTasks,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * A task's history, read only from rows saved as things happened: each check-in with
 * its picks and drops, each pick's status when the day ended, and each
 * hand-over. Nothing is worked out again from today's tasks, because a task's
 * status today says nothing about what it was last Tuesday. The one exception
 * is a day still going on, whose picks show their status now.
 */

/** Writes down a hand-over, an accept or a hand-back as it happens. */
export async function recordTaskEvent(
  database: ProjectDb,
  event: {
    taskId: string
    kind: TaskEventKind
    actorUserId: string
    targetUserId?: string | null
    reason?: string | null
    relatedTaskId?: string | null
  }
) {
  await database.insert(projectTaskEvents).values({
    id: uuid(),
    taskId: event.taskId,
    kind: event.kind,
    actorUserId: event.actorUserId,
    targetUserId: event.targetUserId ?? null,
    reason: event.reason ?? null,
    relatedTaskId: event.relatedTaskId ?? null,
    createdAt: new Date(),
  })
}

export type TaskHistoryEntry =
  | {
      kind: "picked"
      at: string
      day: string
      personName: string
      carriedOver: boolean
      /** The status when that person's day ended; null while the day is still going. */
      endStatus: TaskStatus | null
      /** The day is still going, so this is the status now. */
      liveStatus: TaskStatus | null
    }
  | { kind: "dropped"; at: string; day: string; personName: string; reason: string }
  | {
      kind: Exclude<TaskEventKind, "moved">
      at: string
      actorName: string
      targetName: string | null
      reason: string | null
      /** The task a step became or came from, when the reader can see it. */
      relatedTask: { id: string; projectId: string; title: string } | null
    }
  | {
      kind: "moved"
      at: string
      actorName: string
      /** The project it came from, named only when the reader can see it. */
      fromProjectName: string | null
    }

const FORMER_MEMBER = "A former member"

/**
 * Every day the task was picked or dropped, and every hand-over, oldest
 * first. Call it only after checking the reader may see the task.
 */
export async function loadTaskHistory(
  taskId: string,
  database: ProjectDb = db,
  /** Projects the reader can see; a linked task elsewhere loses its link. */
  visibleProjects: ReadonlySet<string> = new Set()
): Promise<TaskHistoryEntry[]> {
  const days = await database
    .select({
      kind: projectCheckinItems.kind,
      at: projectCheckinItems.createdAt,
      day: projectCheckins.day,
      carriedOver: projectCheckinItems.carriedOver,
      reason: projectCheckinItems.reason,
      endStatus: projectCheckinItems.endStatus,
      closedAt: projectCheckins.closedAt,
      personName: customShellUsers.name,
      liveStatus: projectTasks.status,
    })
    .from(projectCheckinItems)
    .innerJoin(projectCheckins, eq(projectCheckins.id, projectCheckinItems.checkinId))
    .innerJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectCheckins.userId))
    .where(eq(projectCheckinItems.taskId, taskId))

  const actor = alias(customShellUsers, "actor")
  const target = alias(customShellUsers, "target")
  const related = alias(projectTasks, "related")
  const movedFrom = alias(projectProjects, "moved_from")
  const events = await database
    .select({
      kind: projectTaskEvents.kind,
      at: projectTaskEvents.createdAt,
      reason: projectTaskEvents.reason,
      actorName: actor.name,
      targetName: target.name,
      relatedId: related.id,
      relatedProjectId: related.projectId,
      relatedTitle: related.title,
      movedFromId: movedFrom.id,
      movedFromName: movedFrom.name,
    })
    .from(projectTaskEvents)
    .leftJoin(actor, eq(actor.id, projectTaskEvents.actorUserId))
    .leftJoin(target, eq(target.id, projectTaskEvents.targetUserId))
    .leftJoin(related, eq(related.id, projectTaskEvents.relatedTaskId))
    // A move keeps the old project's id in its reason.
    .leftJoin(
      movedFrom,
      and(eq(projectTaskEvents.kind, "moved"), eq(movedFrom.id, projectTaskEvents.reason))
    )
    // A message is already in the task's chat, so its history doesn't repeat it.
    .where(and(eq(projectTaskEvents.taskId, taskId), ne(projectTaskEvents.kind, "commented")))

  const entries: TaskHistoryEntry[] = [
    ...days.map((row): TaskHistoryEntry =>
      row.kind === "drop"
        ? {
            kind: "dropped",
            at: row.at.toISOString(),
            day: row.day,
            personName: row.personName ?? FORMER_MEMBER,
            reason: row.reason ?? "",
          }
        : {
            kind: "picked",
            at: row.at.toISOString(),
            day: row.day,
            personName: row.personName ?? FORMER_MEMBER,
            carriedOver: row.carriedOver,
            endStatus: row.closedAt ? row.endStatus : null,
            liveStatus: row.closedAt ? null : row.liveStatus,
          }
    ),
    ...events.map((row): TaskHistoryEntry =>
      row.kind === "moved"
        ? {
            kind: "moved",
            at: row.at.toISOString(),
            actorName: row.actorName ?? FORMER_MEMBER,
            fromProjectName:
              row.movedFromId && visibleProjects.has(row.movedFromId) ? row.movedFromName : null,
          }
        : {
            kind: row.kind,
            at: row.at.toISOString(),
            actorName: row.actorName ?? FORMER_MEMBER,
            targetName: row.targetName,
            reason: row.reason,
            relatedTask:
              row.relatedId && row.relatedProjectId && visibleProjects.has(row.relatedProjectId)
                ? { id: row.relatedId, projectId: row.relatedProjectId, title: row.relatedTitle ?? "" }
                : null,
          }
    ),
  ]
  return entries.sort((a, b) => a.at.localeCompare(b.at))
}
