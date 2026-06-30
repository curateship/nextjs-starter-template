import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

import { EMPTY_GIT_STATUS } from "@/app/constants"
import { changedLinesFromHunks } from "@/app/editor"
import { repoTabPath } from "@/app/editor-tabs"
import {
  commitGitChanges,
  diffHunks,
  discardGitChanges,
  discardGitFile,
  getGitStatus,
  mergeDiffHunks,
  mergeGitToDevelop,
  readDevelopTextFile,
  readDevelopRepoTextFile,
  readOriginalTextFile,
  readOriginalRepoTextFile,
  repoDiffHunks,
  repoMergeDiffHunks,
  syncGitChanges,
  updateGitFromDevelop,
} from "@/app/native/git"
import { fileName, parentPath, readableError } from "@/app/path"
import type { DiffHunk, EditorTab, GitFile, GitRefreshMode, GitStatus } from "@/app/types"

type OpenPath = (
  path: string,
  name?: string,
  changedLines?: number[],
  originalContents?: string,
  diffHunks?: DiffHunk[],
  options?: {
    source?: "app" | "repo"
    repoPath?: string
  }
) => Promise<void>

type GitFileTarget = {
  editorPath: string
  filePath: string
  source: "app" | "repo"
}

function gitFileTarget(file: GitFile): GitFileTarget {
  if (file.appPath) {
    return {
      editorPath: file.appPath,
      filePath: file.appPath,
      source: "app",
    }
  }

  return {
    editorPath: repoTabPath(file.path),
    filePath: file.path,
    source: "repo",
  }
}

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

  const refreshGit = useCallback(async function refreshGit(
    workspaceId?: string,
    mode: GitRefreshMode = "basic"
  ) {
    const targetWorkspaceId = typeof workspaceId === "string" ? workspaceId : activeWorkspaceId
    if (!targetWorkspaceId) return

    try {
      const next = await getGitStatus(targetWorkspaceId, mode)
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
    if (!activeWorkspaceId) return
    const target = gitFileTarget(file)

    try {
      if (file.status === "D") {
        const [originalContents, hunks] = await Promise.all([
          target.source === "repo"
            ? readOriginalRepoTextFile(activeWorkspaceId, target.filePath)
            : readOriginalTextFile(activeWorkspaceId, target.filePath),
          target.source === "repo"
            ? repoDiffHunks(activeWorkspaceId, target.filePath, file.status)
            : diffHunks(activeWorkspaceId, target.filePath, file.status),
        ])

        setGitError("")
        setTabs((current) => [
          ...current.filter((tab) => tab.path !== target.editorPath),
          {
            path: target.editorPath,
            name: fileName(target.filePath),
            contents: "",
            savedContents: "",
            source: target.source === "repo" ? "repo" : undefined,
            repoPath: target.source === "repo" ? target.filePath : undefined,
            originalContents,
            changedLines: changedLinesFromHunks(hunks),
            diffHunks: hunks,
          },
        ])
        setActivePath(target.editorPath)
        return
      }

      const [originalContents, hunks] = await Promise.all([
        target.source === "repo"
          ? readOriginalRepoTextFile(activeWorkspaceId, target.filePath)
          : readOriginalTextFile(activeWorkspaceId, target.filePath),
        target.source === "repo"
          ? repoDiffHunks(activeWorkspaceId, target.filePath, file.status)
          : diffHunks(activeWorkspaceId, target.filePath, file.status),
      ])

      setGitError("")
      await openPath(
        target.editorPath,
        fileName(target.filePath),
        changedLinesFromHunks(hunks),
        originalContents,
        hunks,
        target.source === "repo"
          ? { source: "repo", repoPath: target.filePath }
          : undefined
      )
    } catch (error) {
      setGitError(readableError(error))
    }
  }

  async function openMergeFile(file: GitFile) {
    if (!activeWorkspaceId) return
    const target = gitFileTarget(file)

    try {
      const [originalContents, hunks] = await Promise.all([
        target.source === "repo"
          ? readDevelopRepoTextFile(activeWorkspaceId, target.filePath)
          : readDevelopTextFile(activeWorkspaceId, target.filePath),
        target.source === "repo"
          ? repoMergeDiffHunks(activeWorkspaceId, target.filePath)
          : mergeDiffHunks(activeWorkspaceId, target.filePath),
      ])

      setGitError("")
      await openPath(
        target.editorPath,
        fileName(target.filePath),
        changedLinesFromHunks(hunks),
        originalContents,
        hunks,
        target.source === "repo"
          ? { source: "repo", repoPath: target.filePath }
          : undefined
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
