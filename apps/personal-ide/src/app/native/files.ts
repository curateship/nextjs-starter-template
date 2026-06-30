import { invoke } from "@tauri-apps/api/core"

import type { FileEntry } from "@/app/types"

export function listDirectory(workspaceId: string, path: string) {
  return invoke<FileEntry[]>("list_dir", {
    workspaceId,
    path: path || null,
  })
}

export function readTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_text_file", { workspaceId, path })
}

export function readRepoTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_repo_text_file", { workspaceId, path })
}

export function writeTextFile(workspaceId: string, path: string, contents: string) {
  return invoke("write_text_file", { workspaceId, path, contents })
}

export function writeRepoTextFile(workspaceId: string, path: string, contents: string) {
  return invoke("write_repo_text_file", { workspaceId, path, contents })
}

export function createTextFile(workspaceId: string, path: string) {
  return invoke<FileEntry>("create_text_file", { workspaceId, path })
}

export function createFolder(workspaceId: string, path: string) {
  return invoke<FileEntry>("create_folder", { workspaceId, path })
}

export function renamePath(workspaceId: string, oldPath: string, newName: string) {
  return invoke<FileEntry>("rename_path", { workspaceId, oldPath, newName })
}

export function trashPath(workspaceId: string, path: string) {
  return invoke("trash_path", { workspaceId, path })
}

export function duplicatePath(workspaceId: string, path: string) {
  return invoke<FileEntry>("duplicate_path", { workspaceId, path })
}

export function revealPath(workspaceId: string, path: string) {
  return invoke("reveal_path", { workspaceId, path })
}

export function createPastedImage(workspaceId: string, extension: string, bytes: number[]) {
  return invoke<FileEntry>("create_pasted_image", {
    workspaceId,
    extension,
    bytes,
  })
}
