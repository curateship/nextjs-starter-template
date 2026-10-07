import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

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
function isDuplicateName(error: unknown) {
  for (let step: unknown = error, depth = 0; step && depth < 5; depth += 1) {
    if (typeof step !== "object") return false
    if ((step as { code?: string }).code === DUPLICATE_NAME_CODE) return true
    step = (step as { cause?: unknown }).cause
  }
  return false
}

/** Every project the person owns, live ones first, each group by name. */
export function listProjects(userId: string) {
  return db
    .select()
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
    return created
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
 * Each live project with a target, and the finished focus it has had in its
 * current period: this week (Monday to Sunday) or this calendar month, in the
 * profile's timezone. A session reaches a project through its task, the same
 * way History's project split reaches one.
 *
 * One read covers both kinds of period. It spans from the earlier of the two
 * starts to the later of the two ends, and splits the sum with a filter.
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

  const bounds = (period: TargetPeriod) => ({
    startsAt: localDateStartInstant(timezone, targetPeriodStart(period, today)),
    endsBefore: localDateStartInstant(timezone, targetPeriodEnd(period, today)),
  })
  const week = bounds("week")
  const month = bounds("month")
  const startsAt = week.startsAt < month.startsAt ? week.startsAt : month.startsAt
  const endsBefore =
    week.endsBefore > month.endsBefore ? week.endsBefore : month.endsBefore

  const sums = await db
    .select({
      projectId: tasks.projectId,
      weekSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}) filter (where ${focusSessions.completedAt} >= ${week.startsAt.toISOString()} and ${focusSessions.completedAt} < ${week.endsBefore.toISOString()}), 0)::int`,
      monthSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}) filter (where ${focusSessions.completedAt} >= ${month.startsAt.toISOString()} and ${focusSessions.completedAt} < ${month.endsBefore.toISOString()}), 0)::int`,
    })
    .from(focusSessions)
    .innerJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .where(
      and(
        completedFocusWithin(userId, startsAt, endsBefore),
        inArray(
          tasks.projectId,
          targeted.map((project) => project.projectId)
        )
      )
    )
    .groupBy(tasks.projectId)
  const byProject = new Map(sums.map((row) => [row.projectId, row]))

  return targeted.map((project) => {
    const period = project.targetPeriod as TargetPeriod
    const sum = byProject.get(project.projectId)
    return {
      projectId: project.projectId,
      targetHours: project.targetHours as number,
      targetPeriod: period,
      focusSeconds:
        (period === "week" ? sum?.weekSeconds : sum?.monthSeconds) ?? 0,
    }
  })
}
