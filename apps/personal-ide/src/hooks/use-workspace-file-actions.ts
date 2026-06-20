import type { Dispatch, SetStateAction } from "react"

import {
  createFolder as createNativeFolder,
  createPastedImage,
  createTextFile,
  duplicatePath,
  renamePath,
  revealPath,
  trashPath,
} from "@/app/native/files"
import {
  parentPath,
  readableError,
  removeDirectoryPrefix,
} from "@/app/path"
import { skillSlugFromPath } from "@/app/resources"
import type { DirectoryState, FileEntry } from "@/app/types"

type UseWorkspaceFileActionsOptions = {
  activeWorkspaceId: string
  loadDirectory: (path: string, workspaceId?: string) => Promise<void>
  onCloseTabsUnderPath: (path: string) => void
  onFileError: (message: string) => void
  onOpenFile: (entry: FileEntry) => Promise<void>
  onRefreshResources: () => Promise<void>
  onRenameSkillSlug: (oldSlug: string, newSlug: string) => void
  onUnpinSkill: (slug: string) => void
  onUpdateTabsForRename: (oldPath: string, newPath: string) => void
  setDirectories: Dispatch<SetStateAction<Record<string, DirectoryState>>>
}

export function useWorkspaceFileActions({
  activeWorkspaceId,
  loadDirectory,
  onCloseTabsUnderPath,
  onFileError,
  onOpenFile,
  onRefreshResources,
  onRenameSkillSlug,
  onUnpinSkill,
  onUpdateTabsForRename,
  setDirectories,
}: UseWorkspaceFileActionsOptions) {
  async function refreshDirectories(...paths: string[]) {
    await loadDirectory("")
    for (const path of paths) {
      await loadDirectory(path)
    }
  }

  async function createFile(path: string) {
    if (!activeWorkspaceId) {
      onFileError("Create or select a workspace first")
      return
    }

    try {
      const file = await createTextFile(activeWorkspaceId, path)
      onFileError("")
      await refreshDirectories(parentPath(file.path))
      await onOpenFile(file)
      await onRefreshResources()
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function createFolder(path: string) {
    if (!activeWorkspaceId) {
      onFileError("Create or select a workspace first")
      return
    }

    try {
      const folder = await createNativeFolder(activeWorkspaceId, path)
      onFileError("")
      await refreshDirectories(parentPath(folder.path))
      await onRefreshResources()
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function renameEntry(entry: FileEntry, newName: string) {
    if (!activeWorkspaceId) return

    try {
      const renamed = await renamePath(activeWorkspaceId, entry.path, newName)
      onFileError("")
      onUpdateTabsForRename(entry.path, renamed.path)
      const oldSkillSlug = skillSlugFromPath(entry.path)
      const newSkillSlug = skillSlugFromPath(renamed.path)
      if (oldSkillSlug && newSkillSlug && oldSkillSlug !== newSkillSlug) {
        onRenameSkillSlug(oldSkillSlug, newSkillSlug)
      }
      setDirectories((current) => removeDirectoryPrefix(current, entry.path))
      const oldParentPath = parentPath(entry.path)
      const newParentPath = parentPath(renamed.path)
      await refreshDirectories(oldParentPath)
      if (newParentPath !== oldParentPath) {
        await loadDirectory(newParentPath)
      }
      await onRefreshResources()
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function trashEntry(entry: FileEntry) {
    if (!activeWorkspaceId) return
    const message = entry.isDir
      ? `Move folder "${entry.name}" and its contents to Trash?`
      : `Move "${entry.name}" to Trash?`
    if (!window.confirm(message)) return

    try {
      await trashPath(activeWorkspaceId, entry.path)
      onFileError("")
      const skillSlug = skillSlugFromPath(entry.path)
      if (skillSlug) onUnpinSkill(skillSlug)
      onCloseTabsUnderPath(entry.path)
      setDirectories((current) => removeDirectoryPrefix(current, entry.path))
      await refreshDirectories(parentPath(entry.path))
      await onRefreshResources()
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function duplicateEntry(entry: FileEntry) {
    if (!activeWorkspaceId) return

    try {
      const duplicate = await duplicatePath(activeWorkspaceId, entry.path)
      onFileError("")
      await refreshDirectories(parentPath(duplicate.path))
      await onRefreshResources()
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function revealEntry(entry: FileEntry) {
    if (!activeWorkspaceId) return

    try {
      await revealPath(activeWorkspaceId, entry.path)
      onFileError("")
    } catch (error) {
      onFileError(readableError(error))
    }
  }

  async function copyEntryPath(entry: FileEntry) {
    try {
      await navigator.clipboard.writeText(entry.path)
      onFileError("")
    } catch {
      onFileError("Could not copy path")
    }
  }

  async function createPastedImageFile(extension: string, bytes: number[]) {
    if (!activeWorkspaceId) throw new Error("Create or select a workspace first")

    const file = await createPastedImage(activeWorkspaceId, extension, bytes)
    onFileError("")
    await refreshDirectories(parentPath(file.path))
    await onRefreshResources()
    return file
  }

  return {
    copyEntryPath,
    createFile,
    createFolder,
    createPastedImageFile,
    duplicateEntry,
    renameEntry,
    revealEntry,
    trashEntry,
  }
}
