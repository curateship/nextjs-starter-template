import { asc, isNull } from "drizzle-orm"

import { db } from "@/server/db"
import type { ProjectDb } from "@/server/project/access"
import { projectTeams } from "@/server/project/schema"

/**
 * Every team by name, for what the site admin sees across all teams at once.
 * A site admin's own space for their personal list is no team, so it is left out.
 */
export function listTeamNames(database: ProjectDb = db) {
  return database
    .select({ id: projectTeams.id, name: projectTeams.name })
    .from(projectTeams)
    .where(isNull(projectTeams.personalUserId))
    .orderBy(asc(projectTeams.name), asc(projectTeams.id))
}
