import { createServerFn } from "@tanstack/react-start"

import type { AuthUser } from "@/lib/api/auth"
import type { WorkspaceItem, WorkspaceListResponse } from "@/lib/api/workspaces"
import type { ShellConfig } from "@/lib/custom-shell"

export type AuthenticatedShellResponse = {
  user: AuthUser
  settings: ShellConfig
  workspaces: WorkspaceListResponse
}

export function createWorkspaceListResponse(
  workspaces: WorkspaceItem[]
): WorkspaceListResponse {
  return { workspaces }
}

const loadAuthenticatedShellFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthenticatedShellResponse | null> => {
    const { eq } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { findCurrentUser } = await import("@/server/security")
    const {
      getOrCreateCurrentWorkspace,
      listUserWorkspaces,
      parseWorkspaceSettings,
      serializeWorkspace,
    } = await import("@/server/workspaces")
    const { customShellSettings } = await import("@/server/schema")
    const { parseShellGlobals } = await import("@/lib/api/shell-settings")

    const user = await findCurrentUser()
    if (!user) return null

    const [[globalRow], initialWorkspaceList] = await Promise.all([
      db
        .select({ settings: customShellSettings.settings })
        .from(customShellSettings)
        .where(eq(customShellSettings.key, "default"))
        .limit(1),
      listUserWorkspaces(user.id),
    ])

    let workspaceList = initialWorkspaceList
    if (workspaceList.workspaces.length === 0) {
      await getOrCreateCurrentWorkspace(user.id)
      workspaceList = await listUserWorkspaces(user.id)
    }

    const currentWorkspace =
      workspaceList.workspaces.find(
        (workspace) => workspace.id === workspaceList.currentWorkspaceId
      ) ?? workspaceList.workspaces[0]
    if (!currentWorkspace) throw new Error("Workspace not found")

    const workspaceSettings = parseWorkspaceSettings(currentWorkspace.settings)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      settings: {
        ...parseShellGlobals(globalRow?.settings),
        workspaceName: currentWorkspace.name,
        sidebarWidth: workspaceSettings.sidebarWidth,
        favicon: workspaceSettings.favicon,
        topNavigation: workspaceSettings.topNavigation,
        topRightNavigation: workspaceSettings.topRightNavigation,
        sections: workspaceSettings.sections,
      },
      workspaces: createWorkspaceListResponse(
        workspaceList.workspaces.map((workspace) =>
          serializeWorkspace(workspace, workspaceList.currentWorkspaceId)
        )
      ),
    }
  }
)

export function loadAuthenticatedShell() {
  return loadAuthenticatedShellFn()
}
