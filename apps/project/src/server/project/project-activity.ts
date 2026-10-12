import { and, desc, eq, isNull, lt, or, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { ProjectColor, TaskEventKind } from "@/lib/project/rules"
import { db } from "@/server/db"
import {
  requireMembership,
  requireProjectAccess,
  visibleProjectIds,
  visibleProjectsWhere,
  type ProjectDb,
} from "@/server/project/access"
import { projectProjects, projectTaskEvents, projectTasks } from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * A project's Activity tab: who changed what, newest first, 50 at a time.
 * It reads the same rows as each task's History card (`project_task_events`),
 * so the card stays the task's own story and this is the project's. Moments
 * are written as they happen; anything from before a kind was written down
 * isn't here. The Team dashboard's Activity tab reads the same rows across
 * every project the viewer can see.
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
  /** The task's project, which the Team dashboard's feed names on each line. */
  project: { id: string; name: string; color: ProjectColor }
}

export type ProjectActivity = { entries: ActivityEntry[]; more: boolean }

type Before = { at: string; id: string }

const PAGE = 50
const FORMER_MEMBER = "A former member"

/**
 * `before` is the last line already shown, as its time and id, so two moments
 * saved in the same millisecond are never split or repeated across pages.
 */
export async function loadProjectActivity(
  userId: string,
  input: { projectId: string; before?: Before },
  database = db
): Promise<ProjectActivity> {
  const { membership } = await requireProjectAccess(userId, input.projectId, database)
  const visible = await visibleProjectIds(membership, database)
  return activityWhere(eq(projectTasks.projectId, input.projectId), visible, input.before, database)
}

/**
 * The Team dashboard's Activity tab: the same lines across every project the
 * viewer can see, each naming its project. "Just me" lists never show, not
 * even the viewer's own, and neither does a task in the bin.
 */
export async function loadTeamActivity(
  userId: string,
  input: { before?: Before },
  database = db
): Promise<ProjectActivity> {
  const membership = await requireMembership(userId, database)
  const visible = await visibleProjectIds(membership, database)
  return activityWhere(
    and(
      visibleProjectsWhere(membership),
      isNull(projectProjects.personalUserId),
      isNull(projectTasks.deletedAt)
    ),
    visible,
    input.before,
    database
  )
}

async function activityWhere(
  where: SQL | undefined,
  visible: Set<string>,
  before: Before | undefined,
  database: ProjectDb
): Promise<ProjectActivity> {
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
      projectId: projectProjects.id,
      projectName: projectProjects.name,
      projectColor: projectProjects.color,
      movedFromId: movedFrom.id,
      movedFromName: movedFrom.name,
    })
    .from(projectTaskEvents)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskEvents.taskId))
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .leftJoin(actor, eq(actor.id, projectTaskEvents.actorUserId))
    .leftJoin(target, eq(target.id, projectTaskEvents.targetUserId))
    // A move keeps the old project's id in its reason.
    .leftJoin(
      movedFrom,
      and(eq(projectTaskEvents.kind, "moved"), eq(movedFrom.id, projectTaskEvents.reason))
    )
    .where(
      and(
        where,
        before
          ? or(
              lt(projectTaskEvents.createdAt, new Date(before.at)),
              and(
                eq(projectTaskEvents.createdAt, new Date(before.at)),
                lt(projectTaskEvents.id, before.id)
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
      project: { id: row.projectId, name: row.projectName, color: row.projectColor },
    })),
    more: rows.length > PAGE,
  }
}
