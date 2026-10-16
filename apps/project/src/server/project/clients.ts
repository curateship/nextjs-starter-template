import { and, isNotNull, isNull, ne } from "drizzle-orm"

import { clientChoices } from "@/lib/project/clients"
import { visibleProjectsWhere, type Membership, type ProjectDb } from "@/server/project/access"
import { projectProjects } from "@/server/project/schema"

/**
 * Client names on shared projects this person can see, one per client, so a
 * hidden project's client never leaks. Archived projects count: their
 * client is still a client the team has.
 */
export async function visibleClients(membership: Membership, database: ProjectDb) {
  const rows = await database
    .selectDistinct({ client: projectProjects.client })
    .from(projectProjects)
    .where(
      and(
        visibleProjectsWhere(membership),
        isNull(projectProjects.personalUserId),
        isNotNull(projectProjects.client),
        ne(projectProjects.client, "")
      )
    )
  return clientChoices(rows.map((row) => row.client))
}
