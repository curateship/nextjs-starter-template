import { eq } from "drizzle-orm"

import {
  parseAuthLinkExpiry,
  type AuthLinkExpiry,
  type AuthTokenPurpose,
} from "@/lib/email/auth-token-expiry"
import { createAuthToken } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellEmailSettings } from "@/server/schema"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

/** The saved link lifetimes for one workspace, or the established defaults. */
export async function getAuthLinkExpiry(
  workspaceId: string | null,
  database: CustomShellDb = db
) {
  if (!workspaceId) return parseAuthLinkExpiry(null)

  const [row] = await database
    .select({ expiry: customShellEmailSettings.authLinkExpiry })
    .from(customShellEmailSettings)
    .where(eq(customShellEmailSettings.workspaceId, workspaceId))
    .limit(1)

  return parseAuthLinkExpiry(row?.expiry)
}

export type AuthLinkContext = {
  workspaceId: string | null
  expiry: AuthLinkExpiry
}

/** One snapshot shared by a token and the email that carries it. */
export async function getAuthLinkContext(
  database: CustomShellDb = db,
  workspaceId?: string | null
): Promise<AuthLinkContext> {
  const resolvedWorkspaceId =
    workspaceId === undefined ? await visitorWorkspaceId(database) : workspaceId
  return {
    workspaceId: resolvedWorkspaceId,
    expiry: await getAuthLinkExpiry(resolvedWorkspaceId, database),
  }
}

/** Issues a token using the workspace selected by the current request. */
export async function createWorkspaceAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  database: CustomShellDb = db,
  options: { newEmail?: string | null; context?: AuthLinkContext } = {}
) {
  const context = options.context ?? (await getAuthLinkContext(database))
  return createAuthToken(userId, purpose, database, {
    newEmail: options.newEmail,
    expiry: context.expiry,
  })
}
