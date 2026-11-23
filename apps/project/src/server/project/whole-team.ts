import { and, eq } from "drizzle-orm"

import { now } from "@/server/auth/security"
import type { ProjectDb } from "@/server/project/access"
import { projectProjectMembers, projectProjects } from "@/server/project/schema"

/**
 * Someone just joined the team, by invite or by the join link: they go on
 * every project set to "Everyone on the team", archived ones included, so
 * bringing one back finds them already on it.
 */
export async function joinWholeTeamProjects(teamId: string, userId: string, tx: ProjectDb) {
  const projects = await tx
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(and(eq(projectProjects.teamId, teamId), eq(projectProjects.wholeTeam, true)))
  if (projects.length === 0) return
  const at = now()
  await tx
    .insert(projectProjectMembers)
    .values(projects.map((project) => ({ projectId: project.id, userId, addedAt: at })))
    .onConflictDoNothing()
}
