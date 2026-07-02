import { useEffect, useMemo, useState } from "react"

import { EMPTY_WORKSPACES } from "@/app/constants"
import {
  createAppFromCustomShell,
  createWorkspace,
  deleteWorkspace as deleteWorkspaceRecord,
  listWorkspaces,
  setActiveWorkspace,
  setWorkspaceVisibility,
} from "@/app/native/workspaces"
import { readableError } from "@/app/path"
import type { WorkspaceList } from "@/app/types"

export function useWorkspaces() {
  const [workspaceList, setWorkspaceList] = useState<WorkspaceList>(EMPTY_WORKSPACES)
  const [workspaceError, setWorkspaceError] = useState("")
  const [workspaceBusy, setWorkspaceBusy] = useState(false)

  const activeWorkspaceId = workspaceList.activeWorkspaceId ?? ""
  const activeWorkspace = useMemo(
    () => workspaceList.workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaceList.workspaces]
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const next = await listWorkspaces()
        if (!cancelled) setWorkspaceList(next)
      } catch (error) {
        if (!cancelled) setWorkspaceError(readableError(error))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  async function addWorkspace() {
    setWorkspaceError("")
    setWorkspaceBusy(true)

    try {
      const next = await createWorkspace()
      if (!next) return

      setWorkspaceList(next)
    } catch (error) {
      setWorkspaceError(readableError(error))
    } finally {
      setWorkspaceBusy(false)
    }
  }

  async function createApp(appName: string) {
    setWorkspaceError("")
    setWorkspaceBusy(true)

    try {
      const next = await createAppFromCustomShell(appName)
      if (!next) return false

      setWorkspaceList(next)
      return true
    } catch (error) {
      setWorkspaceError(readableError(error))
      return false
    } finally {
      setWorkspaceBusy(false)
    }
  }

  async function selectWorkspace(workspaceId: string) {
    setWorkspaceError("")
    try {
      const next = await setActiveWorkspace(workspaceId)
      setWorkspaceList(next)
    } catch (error) {
      setWorkspaceError(readableError(error))
    }
  }

  async function setWorkspaceHidden(workspaceId: string, hidden: boolean) {
    setWorkspaceError("")
    try {
      const next = await setWorkspaceVisibility(workspaceId, hidden)
      setWorkspaceList(next)
      return true
    } catch (error) {
      setWorkspaceError(readableError(error))
      return false
    }
  }

  async function deleteWorkspace(workspaceId: string) {
    if (!window.confirm("Delete this clean workspace worktree? The branch remains.")) {
      return false
    }

    setWorkspaceError("")
    try {
      const next = await deleteWorkspaceRecord(workspaceId)
      setWorkspaceList(next)
      return true
    } catch (error) {
      setWorkspaceError(readableError(error))
      return false
    }
  }

  return {
    activeWorkspace,
    activeWorkspaceId,
    addWorkspace,
    createApp,
    deleteWorkspace,
    selectWorkspace,
    setWorkspaceHidden,
    workspaceBusy,
    workspaceError,
    workspaceList,
  }
}
