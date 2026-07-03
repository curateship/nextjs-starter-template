import type { WorkspaceInfo } from "@/app/types"

export function reorderWorkspaceSubset(
  workspaces: WorkspaceInfo[],
  subsetIds: string[],
  workspaceId: string,
  overWorkspaceId: string
) {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const subsetIdSet = new Set(subsetIds)

  if (subsetIdSet.size !== subsetIds.length) {
    throw new Error("Workspace reorder scope must include each workspace at most once.")
  }

  for (const subsetId of subsetIds) {
    if (!workspacesById.has(subsetId)) {
      throw new Error("Workspace reorder scope contains an unknown workspace.")
    }
  }

  const oldSubsetIndex = subsetIds.indexOf(workspaceId)
  const newSubsetIndex = subsetIds.indexOf(overWorkspaceId)
  if (oldSubsetIndex < 0 || newSubsetIndex < 0) {
    throw new Error("Workspace reorder target is outside the reorder scope.")
  }
  if (oldSubsetIndex === newSubsetIndex) return workspaces

  const reorderedSubsetIds = [...subsetIds]
  const [movedWorkspaceId] = reorderedSubsetIds.splice(oldSubsetIndex, 1)
  reorderedSubsetIds.splice(newSubsetIndex, 0, movedWorkspaceId)

  let nextSubsetIndex = 0

  return workspaces.map((workspace) => {
    if (!subsetIdSet.has(workspace.id)) return workspace

    const nextWorkspaceId = reorderedSubsetIds[nextSubsetIndex]
    nextSubsetIndex += 1
    const nextWorkspace = workspacesById.get(nextWorkspaceId)
    if (!nextWorkspace) {
      throw new Error("Workspace reorder scope contains an unknown workspace.")
    }
    return nextWorkspace
  })
}
