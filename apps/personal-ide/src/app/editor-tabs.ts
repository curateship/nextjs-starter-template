import type { EditorTab } from "@/app/types"
import { REPO_TAB_PATH_PREFIX } from "@/app/constants"

export function isSettingsTab(tab?: EditorTab) {
  return tab?.kind === "settings"
}

export function repoTabPath(repoPath: string) {
  return `${REPO_TAB_PATH_PREFIX}${repoPath.replace(/^\/+/, "")}`
}

export function tabFilePath(tab?: EditorTab) {
  if (!tab) return ""
  return tab.source === "repo" ? tab.repoPath ?? tab.path : tab.path
}
