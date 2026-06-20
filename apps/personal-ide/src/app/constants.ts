import type { EditorSettings, GitStatus, WorkspaceList, WorkspaceTerminalState } from "@/app/types"

export const EMPTY_WORKSPACES: WorkspaceList = {
  activeWorkspaceId: null,
  workspaces: [],
}

export const EMPTY_GIT_STATUS: GitStatus = {
  branch: "",
  files: [],
  unpushedCommitCount: 0,
  unmergedCommitCount: 0,
  developCommitCount: 0,
  mergeCommits: [],
  mergeFiles: [],
  developCommits: [],
  developFiles: [],
}

export const EMPTY_TERMINAL_STATE: WorkspaceTerminalState = {
  terminals: [],
  activeTerminalId: "",
}

export const PINNED_SKILLS_STORAGE_KEY = "personal-ide:pinned-skills"
export const APP_THEME_STORAGE_KEY = "personal-ide:theme"
export const SHARED_SKILLS_PATH = ".agents/skills"
export const SETTINGS_TAB_PATH = "__personal_ide_settings__"
export const DEFAULT_TASK_TEMPLATE = "---\nstatus: active\n---\n\n"
export const DEFAULT_TASK_FILTER = "active"
export const DONE_TASK_STATUS = "done"
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  defaultTaskTemplate: DEFAULT_TASK_TEMPLATE,
}
export const SKILL_TAG_FILTERS = [
  { value: "all", label: "All" },
  { value: "define", label: "Define" },
  { value: "plan", label: "Plan" },
  { value: "build", label: "Build" },
  { value: "verify", label: "Verify" },
  { value: "review", label: "Review" },
  { value: "ship", label: "Ship" },
]

export const SIDE_HANDLE_CLASS =
  "h-full w-px cursor-col-resize bg-border hover:bg-border"
