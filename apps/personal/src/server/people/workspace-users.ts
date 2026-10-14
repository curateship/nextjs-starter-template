import { and, asc, eq, ilike, isNull, or, type SQL } from "drizzle-orm"

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

export type WorkspaceMember = {
  id: string
  name: string
  email: string
}

/** Active members visible to a workspace's one-member test picker. */
export async function listActiveWorkspaceMembers(
  workspaceId: string,
  search: string,
  database: CustomShellDb = db
): Promise<WorkspaceMember[]> {
  const term = search.trim()
  const match = term
    ? or(
        ilike(customShellUsers.name, `%${term}%`),
        ilike(customShellUsers.email, `%${term}%`)
      )
    : undefined

  return database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
    })
    .from(customShellUsers)
    .where(
      and(
        await userBelongsToWorkspaceCondition(workspaceId, database),
        eq(customShellUsers.role, "member"),
        eq(customShellUsers.status, "active"),
        match
      )
    )
    .orderBy(asc(customShellUsers.name), asc(customShellUsers.email))
    .limit(25)
}

/** One active member, but only when they belong to this workspace. */
export async function findActiveWorkspaceMember(
  workspaceId: string,
  userId: string,
  database: CustomShellDb = db
): Promise<WorkspaceMember | null> {
  const [member] = await database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
    })
    .from(customShellUsers)
    .where(
      and(
        await userBelongsToWorkspaceCondition(workspaceId, database),
        eq(customShellUsers.id, userId),
        eq(customShellUsers.role, "member"),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)

  return member ?? null
}
