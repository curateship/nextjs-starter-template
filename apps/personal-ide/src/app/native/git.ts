import { invoke } from "@tauri-apps/api/core"

import type { DiffHunk, GitStatus } from "@/app/types"

export function getGitStatus(workspaceId: string) {
  return invoke<GitStatus>("git_status", { workspaceId })
}

export function commitGitChanges(workspaceId: string, message: string) {
  return invoke<GitStatus>("git_commit", { workspaceId, message })
}

export function syncGitChanges(workspaceId: string) {
  return invoke<GitStatus>("git_sync", { workspaceId })
}

export function mergeGitToDevelop(workspaceId: string) {
  return invoke<GitStatus>("git_merge_to_develop", { workspaceId })
}

export function updateGitFromDevelop(workspaceId: string) {
  return invoke<GitStatus>("git_update_from_develop", { workspaceId })
}

export function discardGitFile(workspaceId: string, path: string) {
  return invoke<GitStatus>("git_discard_file", { workspaceId, path })
}

export function discardGitChanges(workspaceId: string) {
  return invoke<GitStatus>("git_discard_changes", { workspaceId })
}

export function readOriginalTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_original_text_file", { workspaceId, path })
}

export function readDevelopTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_develop_text_file", { workspaceId, path })
}

export function diffHunks(workspaceId: string, path: string, status: string) {
  return invoke<DiffHunk[]>("diff_hunks", { workspaceId, path, status })
}

export function mergeDiffHunks(workspaceId: string, path: string) {
  return invoke<DiffHunk[]>("merge_diff_hunks", { workspaceId, path })
}
