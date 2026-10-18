import { asc, eq, isNull, or, type SQL } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/** The same workspace-membership rule used when accounts become contacts. */
export async function userBelongsToWorkspaceCondition(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<SQL> {
  const [oldest] = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
    .orderBy(asc(customShellWorkspaces.createdAt))
    .limit(1)

  if (oldest?.id === workspaceId) {
    const condition = or(
      eq(customShellUsers.currentWorkspaceId, workspaceId),
      isNull(customShellUsers.currentWorkspaceId)
    )
    if (condition) return condition
  }
  return eq(customShellUsers.currentWorkspaceId, workspaceId)
}
