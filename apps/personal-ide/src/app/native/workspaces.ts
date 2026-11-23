import { invoke } from "@tauri-apps/api/core"

import type { WorkspaceList } from "@/app/types"

export function listWorkspaces() {
  return invoke<WorkspaceList>("list_workspaces")
}

export function createWorkspace() {
  return invoke<WorkspaceList | null>("create_workspace")
}

export function createAppFromCustomShell(appName: string, appPort: number) {
  return invoke<WorkspaceList | null>("create_app_from_custom_shell", { appName, appPort })
}

export function setActiveWorkspace(workspaceId: string) {
  return invoke<WorkspaceList>("set_active_workspace", { workspaceId })
}

export function setWorkspaceVisibility(workspaceId: string, hidden: boolean) {
  return invoke<WorkspaceList>("set_workspace_hidden", { workspaceId, hidden })
}

export function reorderWorkspaces(workspaceIds: string[]) {
  return invoke<WorkspaceList>("reorder_workspaces", { workspaceIds })
}

export function deleteWorkspace(workspaceId: string) {
  return invoke<WorkspaceList>("delete_workspace", { workspaceId })
}
