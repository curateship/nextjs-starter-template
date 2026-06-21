export type WorkspaceInfo = {
  id: string
  name: string
  appName: string
  hidden: boolean
  isTauri: boolean
}

export type WorkspaceList = {
  activeWorkspaceId: string | null
  workspaces: WorkspaceInfo[]
}

export type FileEntry = {
  name: string
  path: string
  isDir: boolean
}

export type DirectoryState = {
  open: boolean
  loading: boolean
  entries?: FileEntry[]
  error?: string
}

export type EditorTab = {
  path: string
  name: string
  contents: string
  savedContents: string
  kind?: "settings"
  originalContents?: string
  changedLines?: number[]
  diffHunks?: DiffHunk[]
  error?: string
}

export type DiffHunk = {
  originalStart: number
  originalCount: number
  currentStart: number
  currentCount: number
}

export type WorkspaceEditorState = {
  activePath: string
  directories: Record<string, DirectoryState>
  docs: DocItem[]
  gitStatus: GitStatus
  skills: SkillItem[]
  tabs: EditorTab[]
  tasks: TaskItem[]
}

export type TaskStatus = string

export type TaskItem = {
  title: string
  path: string
  status: TaskStatus
  skill?: string | null
  error?: string | null
}

export type SkillItem = {
  name: string
  slug: string
  path: string
  tags: string[]
}

export type DocItem = {
  name: string
  path: string
}

export type GitFile = {
  status: string
  path: string
  appPath?: string | null
}

export type GitCommit = {
  hash: string
  subject: string
}

export type GitStatus = {
  branch: string
  files: GitFile[]
  unpushedCommitCount: number
  unmergedCommitCount: number
  developCommitCount: number
  mergeCommits: GitCommit[]
  mergeFiles: GitFile[]
  developCommits: GitCommit[]
  developFiles: GitFile[]
}

export type GitRefreshMode = "basic" | "full"

export type TerminalItem = {
  id: string
  name: string
  startupCommand?: string
}

export type WorkspaceTerminalState = {
  terminals: TerminalItem[]
  activeTerminalId: string
}

export type WorkspaceStatus = "running" | "waiting"

export type TerminalOutput = {
  workspaceId: string
  terminalId: string
  data: number[]
}

export type EditorSettings = {
  defaultTaskTemplate: string
}

export type SettingsSaveStatus = "idle" | "saving" | "saved"
