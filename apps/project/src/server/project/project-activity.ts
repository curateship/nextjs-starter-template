import { and, desc, eq, isNull, lt, or, type Column, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { ProjectColor, ProjectHealth, TaskEventKind } from "@/lib/project/rules"
import { db } from "@/server/db"
import {
  requireMembership,
  requireProjectAccess,
  visibleProjectIds,
  visibleProjectsWhere,
  type ProjectDb,
} from "@/server/project/access"
import {
  projectProjectEvents,
  projectProjects,
  projectTaskEvents,
  projectTasks,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * A project's Activity tab: who changed what, newest first, 50 at a time.
 * It reads the same rows as each task's History card (`project_task_events`),
 * so the card stays the task's own story and this is the project's. Moments
 * are written as they happen; anything from before a kind was written down
 * isn't here. The Team dashboard's Activity tab reads the same rows across
 * every project the viewer can see. A project's own moments, such as its
 * status changing, come from `project_project_events` and are merged in by
 * time; they carry no task.
 */

export type ActivityEntry = TaskActivityEntry | ProjectActivityEntry

type ActivityBase = {
  id: string
  at: string
  actorName: string
  project: { id: string; name: string; color: ProjectColor }
}

/** "Priya set the status to At risk: Client hasn't sent the photos". Null health took it off. */
export type ProjectActivityEntry = ActivityBase & {
  kind: "health_set"
  health: ProjectHealth | null
  note: string | null
}

export type TaskActivityEntry = {
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
  return activityWhere(
    eq(projectTasks.projectId, input.projectId),
    eq(projectProjectEvents.projectId, input.projectId),
    visible,
    input.before,
    database
  )
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
    and(visibleProjectsWhere(membership), isNull(projectProjects.personalUserId)),
    visible,
    input.before,
    database
  )
}

/**
 * Both kinds of row are read a page at a time from the same point and merged
 * newest first, so the merged page is exactly the newest 50 of the two.
 */
async function activityWhere(
  where: SQL | undefined,
  projectWhere: SQL | undefined,
  visible: Set<string>,
  before: Before | undefined,
  database: ProjectDb
): Promise<ProjectActivity> {
  const tasks = await taskActivity(where, visible, before, database)
  const projects = await projectActivity(projectWhere, before, database)
  const merged = [...tasks, ...projects].sort(
    (a, b) => b.at.localeCompare(a.at) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)
  )
  return { entries: merged.slice(0, PAGE), more: merged.length > PAGE }
}

function olderThan(
  before: Before | undefined,
  columns: { at: Column; id: Column }
) {
  if (!before) return undefined
  return or(
    lt(columns.at, new Date(before.at)),
    and(eq(columns.at, new Date(before.at)), lt(columns.id, before.id))
  )
}

async function projectActivity(
  where: SQL | undefined,
  before: Before | undefined,
  database: ProjectDb
): Promise<ProjectActivityEntry[]> {
  const actor = alias(customShellUsers, "actor")
  const rows = await database
    .select({
      id: projectProjectEvents.id,
      kind: projectProjectEvents.kind,
      at: projectProjectEvents.createdAt,
      health: projectProjectEvents.health,
      note: projectProjectEvents.note,
      actorName: actor.name,
      projectId: projectProjects.id,
      projectName: projectProjects.name,
      projectColor: projectProjects.color,
    })
    .from(projectProjectEvents)
    .innerJoin(projectProjects, eq(projectProjects.id, projectProjectEvents.projectId))
    .leftJoin(actor, eq(actor.id, projectProjectEvents.actorUserId))
    .where(and(where, olderThan(before, { at: projectProjectEvents.createdAt, id: projectProjectEvents.id })))
    .orderBy(desc(projectProjectEvents.createdAt), desc(projectProjectEvents.id))
    .limit(PAGE + 1)
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    at: row.at.toISOString(),
    actorName: row.actorName ?? FORMER_MEMBER,
    health: row.health,
    note: row.note,
    project: { id: row.projectId, name: row.projectName, color: row.projectColor },
  }))
}

async function taskActivity(
  where: SQL | undefined,
  visible: Set<string>,
  before: Before | undefined,
  database: ProjectDb
): Promise<TaskActivityEntry[]> {
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
    .where(and(where, olderThan(before, { at: projectTaskEvents.createdAt, id: projectTaskEvents.id })))
    .orderBy(desc(projectTaskEvents.createdAt), desc(projectTaskEvents.id))
    .limit(PAGE + 1)
  return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      at: row.at.toISOString(),
      actorName: row.actorName ?? FORMER_MEMBER,
      targetName: row.targetName,
      reason: row.kind === "moved" ? null : row.reason,
      fromProjectName: row.movedFromId && visible.has(row.movedFromId) ? row.movedFromName : null,
      task: { id: row.taskId, title: row.title, inBin: Boolean(row.deletedAt) },
      project: { id: row.projectId, name: row.projectName, color: row.projectColor },
    }))
}
