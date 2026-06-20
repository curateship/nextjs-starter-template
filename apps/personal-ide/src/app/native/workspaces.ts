import { invoke } from "@tauri-apps/api/core"

import type { WorkspaceList } from "@/app/types"

export function listWorkspaces() {
  return invoke<WorkspaceList>("list_workspaces")
}

export function createWorkspace() {
  return invoke<WorkspaceList | null>("create_workspace")
}

export function setActiveWorkspace(workspaceId: string) {
  return invoke<WorkspaceList>("set_active_workspace", { workspaceId })
}

export function setWorkspaceVisibility(workspaceId: string, hidden: boolean) {
  return invoke<WorkspaceList>("set_workspace_hidden", { workspaceId, hidden })
}

export function deleteWorkspace(workspaceId: string) {
  return invoke<WorkspaceList>("delete_workspace", { workspaceId })
}
