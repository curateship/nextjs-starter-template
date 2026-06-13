import { findCurrentUser } from "@/server/security"
import { getOrCreateCurrentWorkspace } from "@/server/workspaces"

// Resolves the authenticated user and their active workspace in one step.
// Every domain server module goes through this so workspace scoping is
// applied consistently (the schema is multi-tenant-ready from day one).
export async function requireUserWorkspace() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Agents session")
  }
  const workspace = await getOrCreateCurrentWorkspace(user.id)
  return { user, workspace }
}
