import { createServerFn } from "@tanstack/react-start"

import { requireAppOrigin } from "@/server/origin"
import {
  createPublicReadToken,
  hashPublicReadToken,
  replaceCurrentWorkspacePublicReadToken,
} from "@/server/public-read-token"
import { findCurrentUser } from "@/server/security"
import {
  getOrCreateCurrentWorkspace,
  parseWorkspaceSettings,
} from "@/server/workspaces"

export function publicReadTokenError(error: unknown) {
  return error instanceof Error ? error.message : "Hub read token request failed."
}

const loadPublicReadTokenStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireAdminUser()
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const settings = parseWorkspaceSettings(workspace.settings)

    return {
      workspace_id: workspace.id,
      has_token: Boolean(settings.publicReadTokenHash),
    }
  }
)

const generatePublicReadTokenFn = createServerFn({ method: "POST" }).handler(
  async () => {
    requireAppOrigin()
    const user = await requireAdminUser()
    const token = createPublicReadToken()
    const workspace = await replaceCurrentWorkspacePublicReadToken(
      user.id,
      hashPublicReadToken(token)
    )

    return {
      workspace_id: workspace.id,
      token,
    }
  }
)

export function loadPublicReadTokenStatus() {
  return loadPublicReadTokenStatusFn()
}

export function generatePublicReadToken() {
  return generatePublicReadTokenFn()
}

async function requireAdminUser() {
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Core session.")
  if (user.role !== "admin") throw new Error("Not authorized.")
  return user
}
