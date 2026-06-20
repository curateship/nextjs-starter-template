import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

import { EMPTY_GIT_STATUS } from "@/app/constants"
import { changedLinesFromHunks } from "@/app/editor"
import {
  commitGitChanges,
  diffHunks,
  discardGitChanges,
  discardGitFile,
  getGitStatus,
  mergeDiffHunks,
  mergeGitToDevelop,
  readDevelopTextFile,
  readOriginalTextFile,
  syncGitChanges,
  updateGitFromDevelop,
} from "@/app/native/git"
import { fileName, parentPath, readableError } from "@/app/path"
import type { DiffHunk, EditorTab, GitFile, GitStatus } from "@/app/types"

type OpenPath = (
  path: string,
  name?: string,
  changedLines?: number[],
  originalContents?: string,
  diffHunks?: DiffHunk[]
) => Promise<void>

type UseGitChangesOptions = {
  activeWorkspaceId: string
  activeWorkspaceIdRef: { current: string }
  onRefreshFileTree: (paths?: string[]) => Promise<void>
  onRefreshOpenTabsFromDisk: () => Promise<void>
  onRefreshResources: () => Promise<void>
  openPath: OpenPath
  setActivePath: (path: string) => void
  setTabs: Dispatch<SetStateAction<EditorTab[]>>
}

export function useGitChanges({
  activeWorkspaceId,
  activeWorkspaceIdRef,
  onRefreshFileTree,
  onRefreshOpenTabsFromDisk,
  onRefreshResources,
  openPath,
  setActivePath,
  setTabs,
}: UseGitChangesOptions) {
  const [gitStatus, setGitStatus] = useState<GitStatus>(EMPTY_GIT_STATUS)
  const [commitMessage, setCommitMessage] = useState("")
  const [gitError, setGitError] = useState("")
  const [busyAction, setBusyAction] = useState("")
  const gitStatusRef = useRef<GitStatus>(EMPTY_GIT_STATUS)

  useEffect(() => {
    gitStatusRef.current = gitStatus
  }, [gitStatus])

  const resetGitStatus = useCallback(() => {
    setGitStatus(EMPTY_GIT_STATUS)
  }, [])

  const refreshGit = useCallback(async function refreshGit(workspaceId?: string) {
    const targetWorkspaceId = typeof workspaceId === "string" ? workspaceId : activeWorkspaceId
    if (!targetWorkspaceId) return

    try {
      const next = await getGitStatus(targetWorkspaceId)
      if (activeWorkspaceIdRef.current !== targetWorkspaceId) return

      setGitStatus(next)
      setGitError("")
    } catch (error) {
      if (activeWorkspaceIdRef.current !== targetWorkspaceId) return

      setGitError(readableError(error))
    }
  }, [activeWorkspaceId, activeWorkspaceIdRef])

  async function commitChanges() {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("commit")

    try {
      const next = await commitGitChanges(activeWorkspaceId, commitMessage)
      setGitStatus(next)
      setCommitMessage("")
      await onRefreshResources()
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function syncChanges() {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("sync")

    try {
      const next = await syncGitChanges(activeWorkspaceId)
      setGitStatus(next)
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function mergeToDevelop() {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("merge")

    try {
      const next = await mergeGitToDevelop(activeWorkspaceId)
      setGitStatus(next)
      await onRefreshResources()
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function updateFromDevelop() {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("update")

    try {
      const next = await updateGitFromDevelop(activeWorkspaceId)
      setGitStatus(next)
      await onRefreshOpenTabsFromDisk()
      await onRefreshResources()
      await onRefreshFileTree()
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function discardChangedFile(file: GitFile) {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("discard")

    try {
      const next = await discardGitFile(activeWorkspaceId, file.path)
      setGitStatus(next)
      await onRefreshOpenTabsFromDisk()
      await onRefreshResources()
      await onRefreshFileTree(file.appPath ? [parentPath(file.appPath)] : [])
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function discardChanges() {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("discard")

    try {
      const next = await discardGitChanges(activeWorkspaceId)
      setGitStatus(next)
      await onRefreshOpenTabsFromDisk()
      await onRefreshResources()
      await onRefreshFileTree()
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function openChangedFile(file: GitFile) {
    if (!file.appPath) {
      setGitError("That changed file is outside the selected app folder.")
      return
    }
    const appPath = file.appPath

    try {
      if (file.status === "D") {
        const [originalContents, hunks] = await Promise.all([
          readOriginalTextFile(activeWorkspaceId, appPath),
          diffHunks(activeWorkspaceId, appPath, file.status),
        ])

        setGitError("")
        setTabs((current) => [
          ...current.filter((tab) => tab.path !== appPath),
          {
            path: appPath,
            name: fileName(appPath),
            contents: "",
            savedContents: "",
            originalContents,
            changedLines: changedLinesFromHunks(hunks),
            diffHunks: hunks,
          },
        ])
        setActivePath(appPath)
        return
      }

      const [originalContents, hunks] = await Promise.all([
        readOriginalTextFile(activeWorkspaceId, file.appPath),
        diffHunks(activeWorkspaceId, file.appPath, file.status),
      ])

      setGitError("")
      await openPath(
        file.appPath,
        fileName(file.appPath),
        changedLinesFromHunks(hunks),
        originalContents,
        hunks
      )
    } catch (error) {
      setGitError(readableError(error))
    }
  }

  async function openMergeFile(file: GitFile) {
    if (!activeWorkspaceId) return

    if (!file.appPath) {
      setGitError("That merge file is outside the selected app folder.")
      return
    }

    try {
      const [originalContents, hunks] = await Promise.all([
        readDevelopTextFile(activeWorkspaceId, file.appPath),
        mergeDiffHunks(activeWorkspaceId, file.appPath),
      ])

      setGitError("")
      await openPath(
        file.appPath,
        fileName(file.appPath),
        changedLinesFromHunks(hunks),
        originalContents,
        hunks
      )
    } catch (error) {
      setGitError(readableError(error))
    }
  }

  return {
    busyAction,
    commitChanges,
    commitMessage,
    discardChangedFile,
    discardChanges,
    gitError,
    gitStatus,
    gitStatusRef,
    mergeToDevelop,
    openChangedFile,
    openMergeFile,
    refreshGit,
    resetGitStatus,
    setCommitMessage,
    setGitError,
    setGitStatus,
    syncChanges,
    updateFromDevelop,
  }
}
