import {
  and,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm"

import {
  targetPeriodEnd,
  targetPeriodStart,
  type ProjectTarget,
  type TargetPeriod,
} from "@/lib/pomodoro/project-targets"
import { db } from "@/server/db"
import {
  completedFocusWithin,
  localDateStartInstant,
} from "@/server/pomodoro/focus-report"
import {
  focusSessions,
  pomodoroProjects,
  tasks,
} from "@/server/pomodoro/schema"

/**
 * Projects group tasks at the level people bill and think at. A person owns
 * their own list; every query here is keyed on the user id as well as the row
 * id, so one account can never read or change another's.
 *
 * Archiving is a timestamp rather than a delete. An archived project leaves
 * the picker but keeps every hour it earned in History, which is the whole
 * reason a month-end total is worth having.
 */

const DUPLICATE_NAME_CODE = "23505"

/**
 * Drizzle wraps the driver's error in one of its own, so the Postgres code
 * sits on `cause` rather than on the error handed to the catch. The chain is
 * walked instead of reading one fixed depth, because the two drivers this app
 * runs on — node-postgres live, pglite in tests — nest it differently.
 */
export function isDuplicateName(error: unknown) {
  for (let step: unknown = error, depth = 0; step && depth < 5; depth += 1) {
    if (typeof step !== "object") return false
    if ((step as { code?: string }).code === DUPLICATE_NAME_CODE) return true
    step = (step as { cause?: unknown }).cause
  }
  return false
}

/**
 * What a project's card on the Tasks page shows: how many tasks it holds and
 * how much finished focus it has earned, all time. A task carried onto a new
 * day leaves a "carried" copy behind, so those are not counted twice. Both
 * are one correlated count per project, read through the task's project
 * index, and both are shared with the admin's Projects page so the two can
 * never disagree.
 *
 * Written out in full: inside a raw subquery Drizzle prints bare column
 * names, and "id" is then ambiguous between the two tables.
 */
export const projectTaskCount = sql<number>`(select count(*) from tasks t where t.project_id = "pomodoro_projects"."id" and t.status <> 'carried')::int`
export const projectFocusSeconds = sql<number>`(select coalesce(sum(f.accumulated_seconds), 0) from focus_sessions f join tasks t on t.id = f.task_id where t.project_id = "pomodoro_projects"."id" and f.mode = 'focus' and f.status = 'completed')::int`

/** Every project the person owns, live ones first, each group by name. */
export function listProjects(userId: string) {
  return db
    .select({
      ...getTableColumns(pomodoroProjects),
      taskCount: projectTaskCount,
      focusSeconds: projectFocusSeconds,
    })
    .from(pomodoroProjects)
    .where(eq(pomodoroProjects.userId, userId))
    .orderBy(
      sql`${pomodoroProjects.archivedAt} nulls first`,
      sql`lower(${pomodoroProjects.name})`
    )
}

export async function createProject(userId: string, name: string) {
  try {
    const [created] = await db
      .insert(pomodoroProjects)
      .values({ userId, name })
      .returning()
    // The same shape the list reads, so a new card can join it as it is.
    return { ...created, taskCount: 0, focusSeconds: 0 }
  } catch (error) {
    if (isDuplicateName(error)) throw new Error("PROJECT_NAME_TAKEN")
    throw error
  }
}

/**
 * Renames a project and, when `target` is passed, sets or clears its hours
 * target. Null clears it; leaving it out leaves it alone. The two target
 * columns are always written together, and the database refuses one without
 * the other.
 */
export async function renameProject(
  userId: string,
  projectId: string,
  name: string,
  target?: ProjectTarget | null
) {
  try {
    const [updated] = await db
      .update(pomodoroProjects)
      .set({
        name,
        ...(target === undefined
          ? {}
          : {
              targetHours: target?.hours ?? null,
              targetPeriod: target?.period ?? null,
            }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pomodoroProjects.id, projectId),
          eq(pomodoroProjects.userId, userId)
        )
      )
      .returning()
    if (!updated) throw new Error("PROJECT_NOT_FOUND")
    return updated
  } catch (error) {
    if (isDuplicateName(error)) throw new Error("PROJECT_NAME_TAKEN")
    throw error
  }
}

/**
 * Whether a project's name and hours may appear on the owner's public
 * profile. Keyed on the user id as well as the project id, like every other
 * change here, so a project id from a browser can only ever reach that
 * person's own row.
 */
export async function setProjectPublic(
  userId: string,
  projectId: string,
  isPublic: boolean
) {
  const [updated] = await db
    .update(pomodoroProjects)
    .set({ isPublic, updatedAt: new Date() })
    .where(
      and(
        eq(pomodoroProjects.id, projectId),
        eq(pomodoroProjects.userId, userId)
      )
    )
    .returning()
  if (!updated) throw new Error("PROJECT_NOT_FOUND")
  return updated
}

/**
 * Archive or bring back. Bringing back can fail when a new project has taken
 * the name in the meantime, and says so rather than quietly renaming either.
 */
export async function setProjectArchived(
  userId: string,
  projectId: string,
  archived: boolean
) {
  try {
    const [updated] = await db
      .update(pomodoroProjects)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(
        and(
          eq(pomodoroProjects.id, projectId),
          eq(pomodoroProjects.userId, userId)
        )
      )
      .returning()
    if (!updated) throw new Error("PROJECT_NOT_FOUND")
    return updated
  } catch (error) {
    if (isDuplicateName(error)) throw new Error("PROJECT_NAME_TAKEN")
    throw error
  }
}

/**
 * The current week (Monday to Sunday) or calendar month, in the owner's
 * timezone, as the two instants it runs between.
 */
export function targetPeriodBounds(
  period: TargetPeriod,
  today: string,
  timezone: string
) {
  return {
    startsAt: localDateStartInstant(timezone, targetPeriodStart(period, today)),
    endsBefore: localDateStartInstant(timezone, targetPeriodEnd(period, today)),
  }
}

/**
 * The finished focus each project earned between two instants, in one read
 * however many projects are asked about. A session reaches a project through
 * its task, the same way History's project split reaches one, and only the
 * project's owner's sessions count. Projects with nothing come back as 0.
 */
export async function sumProjectFocus(
  windows: {
    projectId: string
    userId: string
    startsAt: Date
    endsBefore: Date
  }[]
) {
  const seconds = new Map(windows.map((window) => [window.projectId, 0]))
  if (!windows.length) return seconds
  const sums = await db
    .select({
      projectId: tasks.projectId,
      focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int`,
    })
    .from(focusSessions)
    .innerJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .where(
      or(
        ...windows.map((window) =>
          and(
            eq(tasks.projectId, window.projectId),
            completedFocusWithin(
              window.userId,
              window.startsAt,
              window.endsBefore
            )
          )
        )
      )
    )
    .groupBy(tasks.projectId)
  for (const row of sums)
    if (row.projectId) seconds.set(row.projectId, row.focusSeconds)
  return seconds
}

/**
 * Each live project with a target, and the finished focus it has had in its
 * current period: this week or this calendar month, in the profile's
 * timezone.
 */
export async function loadProjectTargetProgress(
  userId: string,
  today: string,
  timezone: string
) {
  const targeted = await db
    .select({
      projectId: pomodoroProjects.id,
      targetHours: pomodoroProjects.targetHours,
      targetPeriod: pomodoroProjects.targetPeriod,
    })
    .from(pomodoroProjects)
    .where(
      and(
        eq(pomodoroProjects.userId, userId),
        isNull(pomodoroProjects.archivedAt),
        isNotNull(pomodoroProjects.targetHours)
      )
    )
  if (!targeted.length) return []

  const seconds = await sumProjectFocus(
    targeted.map((project) => ({
      projectId: project.projectId,
      userId,
      ...targetPeriodBounds(
        project.targetPeriod as TargetPeriod,
        today,
        timezone
      ),
    }))
  )
  return targeted.map((project) => ({
    projectId: project.projectId,
    targetHours: project.targetHours as number,
    targetPeriod: project.targetPeriod as TargetPeriod,
    focusSeconds: seconds.get(project.projectId) ?? 0,
  }))
}
