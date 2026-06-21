import { useCallback, useEffect, useRef, useState } from "react"

import { listDirectory } from "@/app/native/files"
import { readableError } from "@/app/path"
import type { DirectoryState, FileEntry } from "@/app/types"

type UseFileTreeOptions = {
  autoRefreshIntervalMs?: number
  activeWorkspaceId: string
  onRefreshResources: () => Promise<void>
}

export function useFileTree({
  autoRefreshIntervalMs = 15000,
  activeWorkspaceId,
  onRefreshResources,
}: UseFileTreeOptions) {
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  const [fileError, setFileError] = useState("")
  const activeWorkspaceIdRef = useRef("")
  const autoRefreshRunningRef = useRef(false)
  const directoriesRef = useRef<Record<string, DirectoryState>>({})
  const refreshResourcesRef = useRef(onRefreshResources)

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  useEffect(() => {
    if (!fileError) return

    const timeout = window.setTimeout(() => setFileError(""), 4000)
    return () => window.clearTimeout(timeout)
  }, [fileError])

  useEffect(() => {
    directoriesRef.current = directories
  }, [directories])

  useEffect(() => {
    refreshResourcesRef.current = onRefreshResources
  }, [onRefreshResources])

  const loadDirectory = useCallback(async function loadDirectory(
    path: string,
    workspaceId = activeWorkspaceId,
    options: { showLoading?: boolean } = {}
  ) {
    if (!workspaceId) return
    const showLoading = options.showLoading ?? true

    if (showLoading) {
      setDirectories((current) => ({
        ...current,
        [path]: { ...current[path], open: true, loading: true, error: undefined },
      }))
    }

    try {
      const entries = await listDirectory(workspaceId, path)

      if (activeWorkspaceIdRef.current !== workspaceId) return

      setDirectories((current) => ({
        ...current,
        [path]: nextDirectoryState(current[path], entries),
      }))
    } catch (error) {
      if (activeWorkspaceIdRef.current !== workspaceId) return

      setDirectories((current) => ({
        ...current,
        [path]: {
          ...current[path],
          open: true,
          loading: false,
          error: readableError(error),
        },
      }))
    }
  }, [activeWorkspaceId])

  const refreshFileTree = useCallback(async function refreshFileTree(
    paths: string[] = [],
    options: { showLoading?: boolean } = {}
  ) {
    const loadedPaths = Object.entries(directoriesRef.current)
      .filter(([path, directory]) => path && directory.open && directory.entries)
      .map(([path]) => path)
    const uniquePaths = Array.from(new Set(["", ...loadedPaths, ...paths]))

    for (const path of uniquePaths) {
      await loadDirectory(path, activeWorkspaceIdRef.current, options)
    }
  }, [loadDirectory])

  useEffect(() => {
    if (!activeWorkspaceId || autoRefreshIntervalMs <= 0) return

    const interval = window.setInterval(() => {
      if (autoRefreshRunningRef.current) return
      if (document.hidden) return

      autoRefreshRunningRef.current = true
      void refreshFileTree([], { showLoading: false })
        .then(() => refreshResourcesRef.current())
        .finally(() => {
          autoRefreshRunningRef.current = false
        })
    }, autoRefreshIntervalMs)

    return () => window.clearInterval(interval)
  }, [activeWorkspaceId, autoRefreshIntervalMs, refreshFileTree])

  async function toggleDirectory(path: string) {
    const directory = directories[path]

    if (directory?.entries) {
      setDirectories((current) => ({
        ...current,
        [path]: { ...directory, open: !directory.open },
      }))
      return
    }

    await loadDirectory(path)
  }

  async function refreshFiles(path = "") {
    await loadDirectory(path)
    await onRefreshResources()
  }

  return {
    directories,
    directoriesRef,
    fileError,
    loadDirectory,
    refreshFiles,
    refreshFileTree,
    setDirectories,
    setFileError,
    toggleDirectory,
  }
}

function nextDirectoryState(current: DirectoryState | undefined, entries: FileEntry[]) {
  const next = {
    open: current?.open ?? true,
    loading: false,
    entries,
  }

  if (
    current &&
    current.open === next.open &&
    current.loading === false &&
    current.error === undefined &&
    fileEntriesEqual(current.entries, entries)
  ) {
    return current
  }

  return next
}

function fileEntriesEqual(left: FileEntry[] | undefined, right: FileEntry[]) {
  if (!left || left.length !== right.length) return false

  return left.every(
    (entry, index) =>
      entry.name === right[index]?.name &&
      entry.path === right[index]?.path &&
      entry.isDir === right[index]?.isDir
  )
}
