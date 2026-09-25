import { and, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { pomodoroProjects } from "@/server/pomodoro/schema"

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

export async function renameProject(
  userId: string,
  projectId: string,
  name: string
) {
  try {
    const [updated] = await db
      .update(pomodoroProjects)
      .set({ name, updatedAt: new Date() })
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
