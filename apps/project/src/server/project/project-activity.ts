import { and, desc, eq, lt, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { TaskEventKind } from "@/lib/project/rules"
import { db } from "@/server/db"
import { requireProjectAccess, visibleProjectIds } from "@/server/project/access"
import { projectProjects, projectTaskEvents, projectTasks } from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * A project's Activity tab: who changed what, newest first, 50 at a time.
 * It reads the same rows as each task's History card (`project_task_events`),
 * so the card stays the task's own story and this is the project's. Moments
 * are written as they happen; anything from before a kind was written down
 * isn't here.
 */

export type ActivityEntry = {
  id: string
  kind: TaskEventKind
  at: string
  actorName: string
  targetName: string | null
  /** A reason, a new status or a step's words. */
  reason: string | null
  /** For a move: the project it came from, named only when the reader can see it. */
  fromProjectName: string | null
  task: { id: string; title: string; inBin: boolean }
}

export type ProjectActivity = { entries: ActivityEntry[]; more: boolean }

const PAGE = 50
const FORMER_MEMBER = "A former member"

/**
 * `before` is the last line already shown, as its time and id, so two moments
 * saved in the same millisecond are never split or repeated across pages.
 */
export async function loadProjectActivity(
  userId: string,
  input: { projectId: string; before?: { at: string; id: string } },
  database = db
): Promise<ProjectActivity> {
  const { membership } = await requireProjectAccess(userId, input.projectId, database)
  const visible = await visibleProjectIds(membership, database)
  const actor = alias(customShellUsers, "actor")
  const target = alias(customShellUsers, "target")
  const movedFrom = alias(projectProjects, "moved_from")
  const rows = await database
    .select({
      id: projectTaskEvents.id,
      kind: projectTaskEvents.kind,
      at: projectTaskEvents.createdAt,
      reason: projectTaskEvents.reason,
      actorName: actor.name,
      targetName: target.name,
      taskId: projectTasks.id,
      title: projectTasks.title,
      deletedAt: projectTasks.deletedAt,
      movedFromId: movedFrom.id,
      movedFromName: movedFrom.name,
    })
    .from(projectTaskEvents)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskEvents.taskId))
    .leftJoin(actor, eq(actor.id, projectTaskEvents.actorUserId))
    .leftJoin(target, eq(target.id, projectTaskEvents.targetUserId))
    // A move keeps the old project's id in its reason.
    .leftJoin(
      movedFrom,
      and(eq(projectTaskEvents.kind, "moved"), eq(movedFrom.id, projectTaskEvents.reason))
    )
    .where(
      and(
        eq(projectTasks.projectId, input.projectId),
        input.before
          ? or(
              lt(projectTaskEvents.createdAt, new Date(input.before.at)),
              and(
                eq(projectTaskEvents.createdAt, new Date(input.before.at)),
                lt(projectTaskEvents.id, input.before.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(projectTaskEvents.createdAt), desc(projectTaskEvents.id))
    .limit(PAGE + 1)
  return {
    entries: rows.slice(0, PAGE).map((row) => ({
      id: row.id,
      kind: row.kind,
      at: row.at.toISOString(),
      actorName: row.actorName ?? FORMER_MEMBER,
      targetName: row.targetName,
      reason: row.kind === "moved" ? null : row.reason,
      fromProjectName: row.movedFromId && visible.has(row.movedFromId) ? row.movedFromName : null,
      task: { id: row.taskId, title: row.title, inBin: Boolean(row.deletedAt) },
    })),
    more: rows.length > PAGE,
  }
}
