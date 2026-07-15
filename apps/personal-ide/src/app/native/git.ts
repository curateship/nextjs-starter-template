import { invoke } from "@tauri-apps/api/core"

import type {
  DiffHunk,
  GeneratedGitCommitMessage,
  GitRefreshMode,
  GitStatus,
} from "@/app/types"

export function getGitStatus(workspaceId: string, mode: GitRefreshMode = "full") {
  const command = mode === "basic" ? "git_status_basic" : "git_status"
  return invoke<GitStatus>(command, { workspaceId })
}

export function commitGitChanges(workspaceId: string, message: string) {
  return invoke<GitStatus>("git_commit", { workspaceId, message })
}

export function generateGitCommitMessage(workspaceId: string) {
  return invoke<GeneratedGitCommitMessage>("git_generate_commit_message", { workspaceId })
}

export function syncGitChanges(workspaceId: string) {
  return invoke<GitStatus>("git_sync", { workspaceId })
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

export function readOriginalRepoTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_original_repo_text_file", { workspaceId, path })
}

export function readDevelopTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_develop_text_file", { workspaceId, path })
}

export function readDevelopRepoTextFile(workspaceId: string, path: string) {
  return invoke<string>("read_develop_repo_text_file", { workspaceId, path })
}

export function diffHunks(workspaceId: string, path: string, status: string) {
  return invoke<DiffHunk[]>("diff_hunks", { workspaceId, path, status })
}

export function repoDiffHunks(workspaceId: string, path: string, status: string) {
  return invoke<DiffHunk[]>("repo_diff_hunks", { workspaceId, path, status })
}

export function mergeDiffHunks(workspaceId: string, path: string) {
  return invoke<DiffHunk[]>("merge_diff_hunks", { workspaceId, path })
}

export function repoMergeDiffHunks(workspaceId: string, path: string) {
  return invoke<DiffHunk[]>("repo_merge_diff_hunks", { workspaceId, path })
}
