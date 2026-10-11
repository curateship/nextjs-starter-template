import { and, eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID, PERSONAL_PROJECT_NAME } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { requireMembership, type ProjectDb } from "@/server/project/access"
import { projectProjectMembers, projectProjects } from "@/server/project/schema"

/**
 * "Just me" tasks. Each person's own tasks sit in a project of their own,
 * made the first time they need it, which only they can open (`access.ts`)
 * and which never shows on the Projects page. A screen names it by
 * `PERSONAL_PROJECT_ID` until it exists, so nothing is made just by opening a
 * window.
 */

/** The person's own project, made now if they have none. */
async function ensurePersonalProject(userId: string, database: ProjectDb): Promise<string> {
  const membership = await requireMembership(userId, database)
  const [found] = await database
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(
      and(
        eq(projectProjects.teamId, membership.teamId),
        eq(projectProjects.personalUserId, userId)
      )
    )
    .limit(1)
  if (found) return found.id
  const at = now()
  const id = uuid()
  await database
    .insert(projectProjects)
    .values({
      id,
      teamId: membership.teamId,
      name: PERSONAL_PROJECT_NAME,
      color: "slate",
      description: "",
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
      personalUserId: userId,
    })
    .onConflictDoNothing()
  // Two windows making the first one at once: the other one's row wins.
  const [made] = await database
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(
      and(
        eq(projectProjects.teamId, membership.teamId),
        eq(projectProjects.personalUserId, userId)
      )
    )
    .limit(1)
  await database
    .insert(projectProjectMembers)
    .values({ projectId: made.id, userId, addedAt: at })
    .onConflictDoNothing()
  return made.id
}

/** A project id from a screen, with "Just me" turned into the real one. */
export async function resolveProjectId(userId: string, projectId: string, database: ProjectDb) {
  return projectId === PERSONAL_PROJECT_ID ? ensurePersonalProject(userId, database) : projectId
}

/** Refuses a change that only makes sense for a shared project. */
export function requireSharedProject(project: { personalUserId: string | null }) {
  if (project.personalUserId) throw new Error(PROJECT_ERRORS.personalProject)
}
