import { useEffect, useRef, useState } from "react"

import { SETTINGS_TAB_PATH } from "@/app/constants"
import { isSettingsTab, tabFilePath } from "@/app/editor-tabs"
import {
  readRepoTextFile,
  readTextFile,
  writeRepoTextFile,
  writeTextFile,
} from "@/app/native/files"
import {
  fileName,
  isSameOrChildPath,
  readableError,
  replacePathPrefix,
} from "@/app/path"
import type { DiffHunk, EditorTab, FileEntry } from "@/app/types"

type OpenPathOptions = {
  source?: "app" | "repo"
  repoPath?: string
}

type UseEditorTabsOptions = {
  activeWorkspaceId: string
  onFileError: (message: string) => void
  onRefreshResources: () => Promise<void>
  saveEditorSettings: () => Promise<void>
  settingsDirty: boolean
}

export function useEditorTabs({
  activeWorkspaceId,
  onFileError,
  onRefreshResources,
  saveEditorSettings,
  settingsDirty,
}: UseEditorTabsOptions) {
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState("")
  const [savingPath, setSavingPath] = useState("")
  const activePathRef = useRef("")
  const saveActiveFileRef = useRef<() => void>(() => {})
  const tabsRef = useRef<EditorTab[]>([])

  const activeTab = tabs.find((tab) => tab.path === activePath)

  useEffect(() => {
    activePathRef.current = activePath
    tabsRef.current = tabs
  }, [activePath, tabs])

  async function openPath(
    path: string,
    name = fileName(path),
    changedLines: number[] = [],
    originalContents?: string,
    diffHunks?: DiffHunk[],
    options: OpenPathOptions = {}
  ) {
    if (!activeWorkspaceId) return

    onFileError("")
    const existing = tabs.find((tab) => tab.path === path)
    const source = options.source ?? "app"
    const repoPath = options.repoPath ?? path

    if (existing) {
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path ? { ...tab, changedLines, diffHunks, originalContents } : tab
        )
      )
      setActivePath(existing.path)
      return
    }

    try {
      const contents =
        source === "repo"
          ? await readRepoTextFile(activeWorkspaceId, repoPath)
          : await readTextFile(activeWorkspaceId, path)
      setTabs((current) => [
        ...current,
        {
          path,
          name,
          contents,
          savedContents: contents,
          source: source === "repo" ? "repo" : undefined,
          repoPath: source === "repo" ? repoPath : undefined,
          originalContents,
          changedLines,
          diffHunks,
        },
      ])
      setActivePath(path)
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function openFile(entry: FileEntry) {
    await openPath(entry.path, entry.name)
  }

  function openSettingsTab() {
    setTabs((current) => {
      if (current.some((tab) => tab.path === SETTINGS_TAB_PATH)) return current

      return [
        ...current,
        {
          kind: "settings",
          path: SETTINGS_TAB_PATH,
          name: "Settings",
          contents: "",
          savedContents: "",
        },
      ]
    })
    setActivePath(SETTINGS_TAB_PATH)
  }

  function updateActiveContents(contents: string) {
    if (!activePath || isSettingsTab(activeTab)) return

    setTabs((current) =>
      current.map((tab) =>
        tab.path === activePath ? { ...tab, contents, error: undefined } : tab
      )
    )
  }

  async function saveActiveFile() {
    const tab = tabs.find((item) => item.path === activePath)
    if (!tab) return
    if (isSettingsTab(tab)) {
      await saveEditorSettings()
      return
    }
    if (!activeWorkspaceId) return

    setSavingPath(tab.path)
    try {
      const path = tabFilePath(tab)
      if (tab.source === "repo") {
        await writeRepoTextFile(activeWorkspaceId, path, tab.contents)
      } else {
        await writeTextFile(activeWorkspaceId, path, tab.contents)
      }
      setTabs((current) =>
        current.map((item) =>
          item.path === tab.path
            ? { ...item, savedContents: item.contents, error: undefined }
            : item
        )
      )
      await onRefreshResources()
    } catch (error) {
      const message = readableError(error)
      setTabs((current) =>
        current.map((item) =>
          item.path === tab.path ? { ...item, error: message } : item
        )
      )
    } finally {
      setSavingPath("")
    }
  }

  useEffect(() => {
    saveActiveFileRef.current = saveActiveFile
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || (!event.metaKey && !event.ctrlKey)) return

      event.preventDefault()
      void saveActiveFileRef.current()
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [])

  async function refreshOpenTabsFromDisk() {
    if (!activeWorkspaceId || !tabs.length) return

    const nextTabs: EditorTab[] = []
    let nextActivePath = activePath

    for (const tab of tabs) {
      if (isSettingsTab(tab)) {
        nextTabs.push(tab)
        continue
      }

      try {
        const path = tabFilePath(tab)
        const contents =
          tab.source === "repo"
            ? await readRepoTextFile(activeWorkspaceId, path)
            : await readTextFile(activeWorkspaceId, path)

        nextTabs.push({
          ...tab,
          contents,
          savedContents: contents,
          originalContents: undefined,
          changedLines: [],
          error: undefined,
        })
      } catch {
        // The file may have been removed by discarding Git changes.
      }
    }

    setTabs(nextTabs)

    if (!nextTabs.some((tab) => tab.path === nextActivePath)) {
      nextActivePath = nextTabs[nextTabs.length - 1]?.path ?? ""
    }
    setActivePath(nextActivePath)
    onFileError("")
  }

  function closeTab(path: string) {
    const tab = tabs.find((item) => item.path === path)
    if (!tab) return

    if (
      isSettingsTab(tab) &&
      settingsDirty &&
      !window.confirm("Close settings with unsaved changes?")
    ) {
      return
    }

    if (
      !isSettingsTab(tab) &&
      tab.contents !== tab.savedContents &&
      !window.confirm("Close unsaved file?")
    ) {
      return
    }

    const nextTabs = tabs.filter((item) => item.path !== path)
    setTabs(nextTabs)

    if (activePath === path) {
      setActivePath(nextTabs[nextTabs.length - 1]?.path ?? "")
    }
  }

  function updateTabsForRename(oldPath: string, newPath: string) {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.source === "repo") return tab
        if (!isSameOrChildPath(tab.path, oldPath)) return tab
        const path = replacePathPrefix(tab.path, oldPath, newPath)
        return { ...tab, path, name: fileName(path) }
      })
    )
    setActivePath((current) =>
      isSameOrChildPath(current, oldPath)
        ? replacePathPrefix(current, oldPath, newPath)
        : current
    )
  }

  function closeTabsUnderPath(path: string) {
    setTabs((current) => {
      const nextTabs = current.filter(
        (tab) => tab.source === "repo" || !isSameOrChildPath(tab.path, path)
      )
      setActivePath((currentPath) => {
        if (!isSameOrChildPath(currentPath, path)) return currentPath
        return nextTabs[nextTabs.length - 1]?.path ?? ""
      })
      return nextTabs
    })
  }

  return {
    activePath,
    activePathRef,
    activeTab,
    closeTab,
    closeTabsUnderPath,
    openFile,
    openPath,
    openSettingsTab,
    refreshOpenTabsFromDisk,
    saveActiveFile,
    savingPath,
    setActivePath,
    setTabs,
    tabs,
    tabsRef,
    updateActiveContents,
    updateTabsForRename,
  }
}
