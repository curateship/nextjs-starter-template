import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { python } from "@codemirror/lang-python"
import { rust } from "@codemirror/lang-rust"
import { sql } from "@codemirror/lang-sql"
import { EditorState, StateField } from "@codemirror/state"
import type { Extension } from "@codemirror/state"
import { Decoration, EditorView } from "@codemirror/view"
import type { DecorationSet } from "@codemirror/view"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import CodeMirror, { type BasicSetupOptions } from "@uiw/react-codemirror"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Files,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitCommitHorizontal,
  GitMerge,
  GripVertical,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import localAppPorts from "../../../local-apps.json"

type WorkspaceInfo = {
  id: string
  name: string
  appName: string
  hidden: boolean
  isTauri: boolean
}

type WorkspaceList = {
  activeWorkspaceId: string | null
  workspaces: WorkspaceInfo[]
}

type FileEntry = {
  name: string
  path: string
  isDir: boolean
}

type DirectoryState = {
  open: boolean
  loading: boolean
  entries?: FileEntry[]
  error?: string
}

type EditorTab = {
  path: string
  name: string
  contents: string
  savedContents: string
  kind?: "settings"
  originalContents?: string
  changedLines?: number[]
  error?: string
}

type WorkspaceEditorState = {
  activePath: string
  directories: Record<string, DirectoryState>
  docs: DocItem[]
  gitStatus: GitStatus
  skills: SkillItem[]
  tabs: EditorTab[]
  tasks: TaskItem[]
}

type TaskStatus = string

type TaskItem = {
  title: string
  path: string
  status: TaskStatus
  skill?: string | null
  error?: string | null
}

type SkillItem = {
  name: string
  slug: string
  path: string
  tags: string[]
}

type DocItem = {
  name: string
  path: string
}

type GitFile = {
  status: string
  path: string
  appPath?: string | null
  changedLines: number[]
}

type GitCommit = {
  hash: string
  subject: string
}

type GitStatus = {
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

type TerminalItem = {
  id: string
  name: string
  startupCommand?: string
}

type WorkspaceTerminalState = {
  terminals: TerminalItem[]
  activeTerminalId: string
}

type WorkspaceStatus = "running" | "waiting"

type TerminalOutput = {
  workspaceId: string
  terminalId: string
  data: number[]
}

type EditorSettings = {
  defaultTaskTemplate: string
}

type SettingsSaveStatus = "idle" | "saving" | "saved"

const EMPTY_WORKSPACES: WorkspaceList = {
  activeWorkspaceId: null,
  workspaces: [],
}

const EMPTY_GIT_STATUS: GitStatus = {
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

const EMPTY_TERMINAL_STATE: WorkspaceTerminalState = {
  terminals: [],
  activeTerminalId: "",
}

const PINNED_SKILLS_STORAGE_KEY = "personal-ide:pinned-skills"
const SHARED_SKILLS_PATH = ".agents/skills"
const SETTINGS_TAB_PATH = "__personal_ide_settings__"
const DEFAULT_TASK_TEMPLATE = "---\nstatus: active\n---\n\n"
const DEFAULT_TASK_FILTER = "active"
const DONE_TASK_STATUS = "done"
const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  defaultTaskTemplate: DEFAULT_TASK_TEMPLATE,
}
const SKILL_TAG_FILTERS = [
  { value: "all", label: "All" },
  { value: "define", label: "Define" },
  { value: "plan", label: "Plan" },
  { value: "build", label: "Build" },
  { value: "verify", label: "Verify" },
  { value: "review", label: "Review" },
  { value: "ship", label: "Ship" },
]

const editorTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-content": { padding: "16px" },
  ".cm-gutters": { backgroundColor: "#f8f8f8", borderRight: "1px solid #d4d4d4" },
  ".cm-activeLine": { backgroundColor: "#f4f4f4" },
  ".cm-activeLineGutter": { backgroundColor: "#ececec" },
  ".cm-changed-line": { backgroundColor: "#fff8d6" },
})

const SIDE_HANDLE_CLASS =
  "h-full w-px cursor-col-resize bg-border hover:bg-border"
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g")
const TERMINAL_OUTPUT_DECODER = new TextDecoder()

function changedLineExtension(lines: number[]): Extension {
  const changedLines = new Set(lines)
  const lineMark = Decoration.line({ class: "cm-changed-line" })

  function buildDecorations(state: EditorState) {
    const decorations = Array.from(changedLines)
      .filter((line) => line >= 1 && line <= state.doc.lines)
      .map((line) => lineMark.range(state.doc.line(line).from))

    return Decoration.set(decorations)
  }

  return StateField.define<DecorationSet>({
    create: buildDecorations,
    update(value, transaction) {
      return transaction.docChanged ? buildDecorations(transaction.state) : value
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

function clipboardImage(event: ReactClipboardEvent | ClipboardEvent) {
  const clipboardData = event.clipboardData
  if (!clipboardData) return null

  return (
    Array.from(clipboardData.files).find((item) => item.type.startsWith("image/")) ??
    Array.from(clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile() ??
    null
  )
}

function pastedImageExtension(image: File) {
  return (
    {
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[image.type.toLowerCase()] ?? image.name.split(".").pop()?.toLowerCase()
  )
}

function App() {
  const [workspaceList, setWorkspaceList] = useState<WorkspaceList>(EMPTY_WORKSPACES)
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  const [fileError, setFileError] = useState("")
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState("")
  const [savingPath, setSavingPath] = useState("")
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [taskFilter, setTaskFilter] = useState<TaskStatus>(DEFAULT_TASK_FILTER)
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [skillFilter, setSkillFilter] = useState("all")
  const [docs, setDocs] = useState<DocItem[]>([])
  const [gitStatus, setGitStatus] = useState<GitStatus>(EMPTY_GIT_STATUS)
  const [commitMessage, setCommitMessage] = useState("")
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS)
  const [draftTaskTemplate, setDraftTaskTemplate] = useState(DEFAULT_TASK_TEMPLATE)
  const [settingsSaveStatus, setSettingsSaveStatus] =
    useState<SettingsSaveStatus>("idle")
  const [settingsError, setSettingsError] = useState("")
  const [pinnedSkillSlugs, setPinnedSkillSlugs] = useState<string[]>(loadPinnedSkillSettings)
  const [terminalTab, setTerminalTab] = useState("terminal")
  const [terminalFocusNonce, setTerminalFocusNonce] = useState(0)
  const [terminalsByWorkspace, setTerminalsByWorkspace] = useState<
    Record<string, WorkspaceTerminalState>
  >({})
  const [workspaceStatuses, setWorkspaceStatuses] = useState<Record<string, WorkspaceStatus>>({})
  const [workspaceError, setWorkspaceError] = useState("")
  const [gitError, setGitError] = useState("")
  const [busyAction, setBusyAction] = useState("")
  const activePathRef = useRef("")
  const activeWorkspaceIdRef = useRef("")
  const directoriesRef = useRef<Record<string, DirectoryState>>({})
  const docsRef = useRef<DocItem[]>([])
  const gitStatusRef = useRef<GitStatus>(EMPTY_GIT_STATUS)
  const skillsRef = useRef<SkillItem[]>([])
  const saveActiveFileRef = useRef<() => void>(() => {})
  const tabsRef = useRef<EditorTab[]>([])
  const tasksRef = useRef<TaskItem[]>([])
  const terminalSizeRef = useRef({ cols: 80, rows: 24 })
  const workspaceStatusTimersRef = useRef<Record<string, number>>({})
  const previousWorkspaceIdRef = useRef("")
  const workspaceEditorsRef = useRef<Record<string, WorkspaceEditorState>>({})

  const activeWorkspaceId = workspaceList.activeWorkspaceId ?? ""
  activeWorkspaceIdRef.current = activeWorkspaceId
  const activeWorkspace = workspaceList.workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId
  )
  const activeTab = tabs.find((tab) => tab.path === activePath)
  const taskStatusOptions = useMemo(
    () => taskStatusFilterOptions(tasks, taskFilter),
    [tasks, taskFilter]
  )
  const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, taskFilter))
  const visibleSkills = skills.filter((skill) => {
    if (skillFilter === "all") return true
    return skill.tags?.includes(skillFilter)
  })
  const pinnedSkills = pinnedSkillSlugs
    .map((slug) => skills.find((skill) => skill.slug === slug))
    .filter((skill): skill is SkillItem => Boolean(skill))
  const activeTerminalState = terminalStateFor(activeWorkspaceId, terminalsByWorkspace)
  const settingsDirty = draftTaskTemplate !== editorSettings.defaultTaskTemplate

  const codeExtensions = useMemo(
    () => [
      editorTheme,
      changedLineExtension(activeTab?.changedLines ?? []),
      ...languageForPath(activeTab?.path ?? ""),
    ],
    [activeTab?.changedLines, activeTab?.path]
  )
  const handleTerminalSizeChange = useCallback((cols: number, rows: number) => {
    terminalSizeRef.current = { cols, rows }
  }, [])
  const handleTerminalOutput = useCallback(
    (workspaceId: string, terminalId: string, data: number[]) => {
      if (terminalId.endsWith("-server")) return
      if (!looksLikeAgentOutput(data)) return
      setWorkspaceStatuses((current) => ({ ...current, [workspaceId]: "running" }))
      const currentTimer = workspaceStatusTimersRef.current[workspaceId]
      if (currentTimer) window.clearTimeout(currentTimer)
      workspaceStatusTimersRef.current[workspaceId] = window.setTimeout(() => {
        setWorkspaceStatuses((current) => ({ ...current, [workspaceId]: "waiting" }))
        delete workspaceStatusTimersRef.current[workspaceId]
      }, 2500)
    },
    []
  )
  const handleTerminalInput = useCallback(
    (workspaceId: string, terminalId: string) => {
      if (terminalId.endsWith("-server")) return
      const runningTimer = workspaceStatusTimersRef.current[workspaceId]
      if (runningTimer) window.clearTimeout(runningTimer)
      delete workspaceStatusTimersRef.current[workspaceId]
      setWorkspaceStatuses((current) => {
        const next = { ...current }
        delete next[workspaceId]
        return next
      })
    },
    []
  )

  useEffect(() => {
    localStorage.setItem(PINNED_SKILLS_STORAGE_KEY, JSON.stringify(pinnedSkillSlugs))
  }, [pinnedSkillSlugs])

  useEffect(() => {
    let cancelled = false

    async function loadEditorSettings() {
      try {
        const settings = await invoke<EditorSettings>("get_editor_settings")
        if (cancelled) return
        setEditorSettings(settings)
        setDraftTaskTemplate(settings.defaultTaskTemplate)
      } catch (error) {
        if (!cancelled) setSettingsError(readableError(error))
      }
    }

    void loadEditorSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (settingsSaveStatus !== "saved") return

    const timeout = window.setTimeout(() => setSettingsSaveStatus("idle"), 1800)
    return () => window.clearTimeout(timeout)
  }, [settingsSaveStatus])

  useEffect(() => {
    if (!fileError) return

    const timeout = window.setTimeout(() => setFileError(""), 4000)
    return () => window.clearTimeout(timeout)
  }, [fileError])

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault()

    document.addEventListener("contextmenu", preventContextMenu)
    return () => document.removeEventListener("contextmenu", preventContextMenu)
  }, [])

  useEffect(() => {
    const timers = workspaceStatusTimersRef.current
    return () => Object.values(timers).forEach(window.clearTimeout)
  }, [])

  useEffect(() => {
    activePathRef.current = activePath
    directoriesRef.current = directories
    docsRef.current = docs
    gitStatusRef.current = gitStatus
    skillsRef.current = skills
    tabsRef.current = tabs
    tasksRef.current = tasks
  }, [activePath, directories, docs, gitStatus, skills, tabs, tasks])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const next = await invoke<WorkspaceList>("list_workspaces")
        if (!cancelled) setWorkspaceList(next)
      } catch (error) {
        if (!cancelled) setWorkspaceError(readableError(error))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current
    if (previousWorkspaceId && previousWorkspaceId !== activeWorkspaceId) {
      workspaceEditorsRef.current[previousWorkspaceId] = {
        activePath: activePathRef.current,
        directories: directoriesRef.current,
        docs: docsRef.current,
        gitStatus: gitStatusRef.current,
        skills: skillsRef.current,
        tabs: tabsRef.current,
        tasks: tasksRef.current,
      }
    }
    previousWorkspaceIdRef.current = activeWorkspaceId

    if (!activeWorkspaceId) {
      setDirectories({})
      setTabs([])
      setActivePath("")
      setTasks([])
      setSkills([])
      setDocs([])
      setGitStatus(EMPTY_GIT_STATUS)
      return
    }

    let cancelled = false
    const savedEditor = workspaceEditorsRef.current[activeWorkspaceId]
    setTabs(savedEditor?.tabs ?? [])
    setActivePath(savedEditor?.activePath ?? "")
    setDirectories(savedEditor?.directories ?? { "": { open: true, loading: true } })
    setTasks(savedEditor?.tasks ?? [])
    setSkills(savedEditor?.skills ?? [])
    setDocs(savedEditor?.docs ?? [])
    setGitStatus(savedEditor?.gitStatus ?? EMPTY_GIT_STATUS)

    async function loadRootDirectory() {
      setFileError("")

      try {
        const rootEntries = await invoke<FileEntry[]>("list_dir", {
          workspaceId: activeWorkspaceId,
          path: null,
        })

        if (cancelled) return

        setDirectories((current) => ({
          ...current,
          "": { open: current[""]?.open ?? true, loading: false, entries: rootEntries },
        }))
      } catch (error) {
        if (!cancelled) {
          setDirectories((current) => ({
            ...current,
            "": {
              ...current[""],
              open: true,
              loading: false,
              error: readableError(error),
            },
          }))
        }
      }
    }

    async function loadResources() {
      try {
        const [nextTasks, nextSkills, nextDocs] = await Promise.all([
          invoke<TaskItem[]>("list_tasks", { workspaceId: activeWorkspaceId }),
          invoke<SkillItem[]>("list_skills", { workspaceId: activeWorkspaceId }),
          invoke<DocItem[]>("list_docs", { workspaceId: activeWorkspaceId }),
        ])

        if (cancelled) return

        setTasks(nextTasks)
        setSkills(nextSkills)
        setDocs(nextDocs)
      } catch (error) {
        if (!cancelled) setFileError(readableError(error))
      }
    }

    async function loadGit() {
      setGitError("")

      try {
        const nextGitStatus = await invoke<GitStatus>("git_status", {
          workspaceId: activeWorkspaceId,
        })

        if (!cancelled) setGitStatus(nextGitStatus)
      } catch (error) {
        if (!cancelled) setGitError(readableError(error))
      }
    }

    void loadRootDirectory()
    void loadResources()
    void loadGit()

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId])

  async function refreshResources() {
    if (!activeWorkspaceId) return

    const workspaceId = activeWorkspaceId
    const [nextTasks, nextSkills, nextDocs] = await Promise.all([
      invoke<TaskItem[]>("list_tasks", { workspaceId }),
      invoke<SkillItem[]>("list_skills", { workspaceId }),
      invoke<DocItem[]>("list_docs", { workspaceId }),
    ])

    if (activeWorkspaceIdRef.current !== workspaceId) return

    setTasks(nextTasks)
    setSkills(nextSkills)
    setDocs(nextDocs)
    void refreshGit(workspaceId)
  }

  async function addWorkspace() {
    setWorkspaceError("")
    setBusyAction("workspace")

    try {
      const next = await invoke<WorkspaceList | null>("create_workspace")
      if (!next) return

      setWorkspaceList(next)
    } catch (error) {
      setWorkspaceError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function selectWorkspace(workspaceId: string) {
    setWorkspaceError("")
    try {
      const next = await invoke<WorkspaceList>("set_active_workspace", { workspaceId })
      setWorkspaceList(next)
    } catch (error) {
      setWorkspaceError(readableError(error))
    }
  }

  async function setWorkspaceHidden(workspaceId: string, hidden: boolean) {
    setWorkspaceError("")
    try {
      const next = await invoke<WorkspaceList>("set_workspace_hidden", { workspaceId, hidden })
      setWorkspaceList(next)
      if (hidden) removeWorkspaceTerminals(workspaceId)
    } catch (error) {
      setWorkspaceError(readableError(error))
    }
  }

  async function deleteWorkspace(workspaceId: string) {
    if (!window.confirm("Delete this clean workspace worktree? The branch remains.")) return

    setWorkspaceError("")
    try {
      const next = await invoke<WorkspaceList>("delete_workspace", { workspaceId })
      setWorkspaceList(next)
      removeWorkspaceTerminals(workspaceId)
    } catch (error) {
      setWorkspaceError(readableError(error))
    }
  }

  function addTerminal(
    workspaceId = activeWorkspaceId,
    options: { id?: string; name?: string; startupCommand?: string } = {}
  ) {
    if (!workspaceId) return null

    const state = terminalStateFor(workspaceId, terminalsByWorkspace)
    const existing = options.id
      ? state.terminals.find((terminal) => terminal.id === options.id)
      : undefined

    if (existing) {
      selectTerminal(workspaceId, existing.id)
      return existing
    }

    const name = nextTerminalName(state.terminals)
    const terminal = {
      id: options.id ?? `${workspaceId}-terminal-${Date.now()}`,
      name: options.name ?? name,
      startupCommand: options.startupCommand,
    }

    setTerminalsByWorkspace((current) => {
      const currentState = terminalStateFor(workspaceId, current)
      return {
        ...current,
        [workspaceId]: {
          terminals: [...currentState.terminals, terminal],
          activeTerminalId: terminal.id,
        },
      }
    })
    setTerminalTab("terminal")
    setTerminalFocusNonce((current) => current + 1)
    return terminal
  }

  function startWorkspaceServer(workspace: WorkspaceInfo) {
    if (workspace.isTauri) {
      setFileError("Personal IDE is a desktop app. Run it with tauri:dev, not the web server button.")
      return
    }
    if (workspace.id !== activeWorkspaceId) void selectWorkspace(workspace.id)

    const port = serverPortForWorkspace(workspace)
    const terminalId = `${workspace.id}-server`
    const command = serverStartCommand(port)
    const existingServer = terminalStateFor(workspace.id, terminalsByWorkspace).terminals.find(
      (terminal) => terminal.id === terminalId
    )

    if (existingServer) {
      selectTerminal(workspace.id, terminalId)
      void invoke("write_terminal", {
        terminalId,
        data: `\u0003${command}`,
      }).catch((error) => setFileError(readableError(error)))
      return
    }

    addTerminal(workspace.id, {
      id: terminalId,
      name: "Server",
      startupCommand: command,
    })
  }

  function stopWorkspaceServer(workspace: WorkspaceInfo) {
    closeTerminal(workspace.id, `${workspace.id}-server`)
  }

  async function openWorkspaceServer(workspace: WorkspaceInfo) {
    if (workspace.isTauri) {
      setFileError("Personal IDE is a desktop app. It cannot run as a normal browser page.")
      return
    }

    try {
      await invoke("open_server_url", { port: serverPortForWorkspace(workspace) })
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  function selectTerminal(workspaceId: string, terminalId: string) {
    setTerminalsByWorkspace((current) => {
      const state = terminalStateFor(workspaceId, current)
      return {
        ...current,
        [workspaceId]: {
          terminals: state.terminals,
          activeTerminalId: terminalId,
        },
      }
    })
    setTerminalTab("terminal")
    setTerminalFocusNonce((current) => current + 1)
  }

  function closeTerminal(workspaceId: string, terminalId: string) {
    const state = terminalStateFor(workspaceId, terminalsByWorkspace)
    const closingIndex = state.terminals.findIndex((terminal) => terminal.id === terminalId)
    const nextTerminals = state.terminals.filter((terminal) => terminal.id !== terminalId)
    const nextActiveTerminalId =
      state.activeTerminalId === terminalId
        ? nextTerminals[Math.min(closingIndex, nextTerminals.length - 1)]?.id ?? ""
        : state.activeTerminalId

    setTerminalsByWorkspace((current) => ({
      ...current,
      [workspaceId]: {
        terminals: nextTerminals,
        activeTerminalId: nextActiveTerminalId,
      },
    }))
    void invoke("kill_terminal", { terminalId }).catch((error) =>
      setFileError(readableError(error))
    )
  }

  function removeWorkspaceTerminals(workspaceId: string) {
    setTerminalsByWorkspace((current) => {
      const next = { ...current }
      delete next[workspaceId]
      return next
    })
  }

  async function loadDirectory(path: string, workspaceId = activeWorkspaceId) {
    if (!workspaceId) return

    setDirectories((current) => ({
      ...current,
      [path]: { ...current[path], open: true, loading: true, error: undefined },
    }))

    try {
      const entries = await invoke<FileEntry[]>("list_dir", {
        workspaceId,
        path: path || null,
      })

      if (activeWorkspaceIdRef.current !== workspaceId) return

      setDirectories((current) => ({
        ...current,
        [path]: { open: true, loading: false, entries },
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
  }

  async function refreshFileTree(paths: string[] = []) {
    const loadedPaths = Object.entries(directoriesRef.current)
      .filter(([, directory]) => directory.entries)
      .map(([path]) => path)
    const uniquePaths = Array.from(new Set(["", ...loadedPaths, ...paths]))

    for (const path of uniquePaths) {
      await loadDirectory(path)
    }
  }

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

  async function openPath(
    path: string,
    name = fileName(path),
    changedLines: number[] = [],
    originalContents?: string
  ) {
    if (!activeWorkspaceId) return

    setFileError("")
    const existing = tabs.find((tab) => tab.path === path)

    if (existing) {
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path ? { ...tab, changedLines, originalContents } : tab
        )
      )
      setActivePath(existing.path)
      return
    }

    try {
      const contents = await invoke<string>("read_text_file", {
        workspaceId: activeWorkspaceId,
        path,
      })
      setTabs((current) => [
        ...current,
        {
          path,
          name,
          contents,
          savedContents: contents,
          originalContents,
          changedLines,
        },
      ])
      setActivePath(path)
    } catch (error) {
      setFileError(readableError(error))
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

  function updateDraftTaskTemplate(value: string) {
    setDraftTaskTemplate(value)
    setSettingsSaveStatus("idle")
    setSettingsError("")
  }

  function resetTaskTemplate() {
    updateDraftTaskTemplate(DEFAULT_TASK_TEMPLATE)
  }

  async function saveEditorSettings() {
    setSettingsError("")
    setSettingsSaveStatus("saving")

    try {
      const settings = await invoke<EditorSettings>("save_editor_settings", {
        settings: { defaultTaskTemplate: draftTaskTemplate },
      })
      setEditorSettings(settings)
      setDraftTaskTemplate(settings.defaultTaskTemplate)
      setSettingsSaveStatus("saved")
    } catch (error) {
      setSettingsError(readableError(error))
      setSettingsSaveStatus("idle")
    }
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
      await invoke("write_text_file", {
        workspaceId: activeWorkspaceId,
        path: tab.path,
        contents: tab.contents,
      })
      setTabs((current) =>
        current.map((item) =>
          item.path === tab.path
            ? { ...item, savedContents: item.contents, error: undefined }
            : item
        )
      )
      await refreshResources()
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
        const contents = await invoke<string>("read_text_file", {
          workspaceId: activeWorkspaceId,
          path: tab.path,
        })

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
    setFileError("")
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

  async function createTask(title: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const task = await invoke<TaskItem>("create_task", {
        workspaceId: activeWorkspaceId,
        title,
      })
      await refreshResources()
      await openPath(task.path, fileName(task.path))
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function startTask(task: TaskItem) {
    const taskSkill = task.skill ? skills.find((skill) => skill.slug === task.skill) : undefined
    const skill = taskSkill ? ` Use the ${taskSkill.name} skill from ${taskSkill.path}.` : ""
    await pasteTerminalPrompt(
      `Work on task "${task.title}" from ${task.path}.${skill} Update the task status frontmatter as progress changes.`
    )
  }

  function pinSkill(slug: string) {
    if (!slug) return
    setPinnedSkillSlugs((current) => (current.includes(slug) ? current : [...current, slug]))
  }

  function unpinSkill(slug: string) {
    setPinnedSkillSlugs((current) => current.filter((item) => item !== slug))
  }

  function movePinnedSkill(slug: string, overSlug: string) {
    if (!slug || slug === overSlug) return

    setPinnedSkillSlugs((current) => {
      const oldIndex = current.indexOf(slug)
      const newIndex = current.indexOf(overSlug)
      if (oldIndex < 0 || newIndex < 0) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  function executeSkill(skill: SkillItem) {
    void pasteTerminalPrompt(`Use the ${skill.name} skill from ${skill.path}.`)
  }

  async function createSkill(name: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const skill = await invoke<SkillItem>("create_skill", {
        workspaceId: activeWorkspaceId,
        name,
      })
      await refreshResources()
      await openPath(skill.path, "SKILL.md")
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function createFile(path: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const file = await invoke<FileEntry>("create_text_file", {
        workspaceId: activeWorkspaceId,
        path,
      })
      setFileError("")
      await loadDirectory("")
      await loadDirectory(parentPath(file.path))
      await openFile(file)
      await refreshResources()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function createFolder(path: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const folder = await invoke<FileEntry>("create_folder", {
        workspaceId: activeWorkspaceId,
        path,
      })
      setFileError("")
      await loadDirectory("")
      await loadDirectory(parentPath(folder.path))
      await refreshResources()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function renameEntry(entry: FileEntry, newName: string) {
    if (!activeWorkspaceId) return

    try {
      const renamed = await invoke<FileEntry>("rename_path", {
        workspaceId: activeWorkspaceId,
        oldPath: entry.path,
        newName,
      })
      setFileError("")
      updateTabsForRename(entry.path, renamed.path)
      const oldSkillSlug = skillSlugFromPath(entry.path)
      const newSkillSlug = skillSlugFromPath(renamed.path)
      if (oldSkillSlug && newSkillSlug && oldSkillSlug !== newSkillSlug) {
        setPinnedSkillSlugs((current) =>
          current.map((slug) => (slug === oldSkillSlug ? newSkillSlug : slug))
        )
      }
      setDirectories((current) => removeDirectoryPrefix(current, entry.path))
      await loadDirectory("")
      await loadDirectory(parentPath(entry.path))
      if (parentPath(renamed.path) !== parentPath(entry.path)) {
        await loadDirectory(parentPath(renamed.path))
      }
      await refreshResources()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function trashEntry(entry: FileEntry) {
    if (!activeWorkspaceId) return
    const message = entry.isDir
      ? `Move folder "${entry.name}" and its contents to Trash?`
      : `Move "${entry.name}" to Trash?`
    if (!window.confirm(message)) return

    try {
      await invoke("trash_path", {
        workspaceId: activeWorkspaceId,
        path: entry.path,
      })
      setFileError("")
      const skillSlug = skillSlugFromPath(entry.path)
      if (skillSlug) unpinSkill(skillSlug)
      closeTabsUnderPath(entry.path)
      setDirectories((current) => removeDirectoryPrefix(current, entry.path))
      await loadDirectory("")
      await loadDirectory(parentPath(entry.path))
      await refreshResources()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function duplicateEntry(entry: FileEntry) {
    if (!activeWorkspaceId) return

    try {
      const duplicate = await invoke<FileEntry>("duplicate_path", {
        workspaceId: activeWorkspaceId,
        path: entry.path,
      })
      setFileError("")
      await loadDirectory("")
      await loadDirectory(parentPath(duplicate.path))
      await refreshResources()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function revealEntry(entry: FileEntry) {
    if (!activeWorkspaceId) return

    try {
      await invoke("reveal_path", {
        workspaceId: activeWorkspaceId,
        path: entry.path,
      })
      setFileError("")
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function copyEntryPath(entry: FileEntry) {
    try {
      await navigator.clipboard.writeText(entry.path)
      setFileError("")
    } catch {
      setFileError("Could not copy path")
    }
  }

  async function refreshFiles(path = "") {
    await loadDirectory(path)
    await refreshResources()
  }

  function updateTabsForRename(oldPath: string, newPath: string) {
    setTabs((current) =>
      current.map((tab) => {
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
      const nextTabs = current.filter((tab) => !isSameOrChildPath(tab.path, path))
      setActivePath((currentPath) => {
        if (!isSameOrChildPath(currentPath, path)) return currentPath
        return nextTabs[nextTabs.length - 1]?.path ?? ""
      })
      return nextTabs
    })
  }

  async function createDoc(title: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const doc = await invoke<DocItem>("create_doc", {
        workspaceId: activeWorkspaceId,
        title,
      })
      await refreshResources()
      await openPath(doc.path, fileName(doc.path))
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function pasteTerminalPrompt(prompt: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    const existingTerminal = activeTerminalState.terminals.find(
      (terminal) => terminal.id === activeTerminalState.activeTerminalId
    )
    const terminal = existingTerminal ?? addTerminal(activeWorkspaceId)
    if (!terminal) return

    try {
      setTerminalTab("terminal")
      setTerminalFocusNonce((current) => current + 1)
      await nextFrame()
      await nextFrame()
      const { cols, rows } = terminalSizeRef.current
      await invoke("start_terminal", {
        workspaceId: activeWorkspaceId,
        terminalId: terminal.id,
        cols,
        rows,
      })
      await invoke("resize_terminal", {
        terminalId: terminal.id,
        cols,
        rows,
      }).catch(() => undefined)
      await invoke("write_terminal", {
        terminalId: terminal.id,
        data: prompt,
      })
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function createPastedImageFile(image: File) {
    if (!activeWorkspaceId) throw new Error("Create or select a workspace first")

    const extension = pastedImageExtension(image)
    if (!extension || !["gif", "jpeg", "jpg", "png", "webp"].includes(extension)) {
      throw new Error("Only PNG, JPEG, WebP, or GIF images can be pasted")
    }

    const bytes = Array.from(new Uint8Array(await image.arrayBuffer()))
    const file = await invoke<FileEntry>("create_pasted_image", {
      workspaceId: activeWorkspaceId,
      extension,
      bytes,
    })
    setFileError("")
    await loadDirectory("")
    await loadDirectory(parentPath(file.path))
    await refreshResources()
    void refreshGit(activeWorkspaceId)
    return file
  }

  async function pasteTerminalImage(event: ReactClipboardEvent | ClipboardEvent) {
    const image = clipboardImage(event)
    if (!image) return

    event.preventDefault()
    try {
      const file = await createPastedImageFile(image)
      await pasteTerminalPrompt(` ${file.path} `)
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function pasteEditorImage(event: ClipboardEvent, view: EditorView) {
    const image = clipboardImage(event)
    if (!image) return

    event.preventDefault()
    try {
      const file = await createPastedImageFile(image)
      view.dispatch(view.state.replaceSelection(`![image](${file.path})`))
      view.focus()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function clearTerminalInput() {
    if (!activeWorkspaceId) return
    const terminal = activeTerminalState.terminals.find(
      (item) => item.id === activeTerminalState.activeTerminalId
    )
    if (!terminal) return

    try {
      setTerminalTab("terminal")
      const { cols, rows } = terminalSizeRef.current
      await invoke("start_terminal", {
        workspaceId: activeWorkspaceId,
        terminalId: terminal.id,
        cols,
        rows,
      })
      await invoke("write_terminal", {
        terminalId: terminal.id,
        data: "\u007f".repeat(1024),
      })
      setTerminalFocusNonce((current) => current + 1)
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function commitChanges() {
    if (!activeWorkspaceId) return
    setGitError("")
    setBusyAction("commit")

    try {
      const next = await invoke<GitStatus>("git_commit", {
        workspaceId: activeWorkspaceId,
        message: commitMessage,
      })
      setGitStatus(next)
      setCommitMessage("")
      await refreshResources()
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
      const next = await invoke<GitStatus>("git_sync", {
        workspaceId: activeWorkspaceId,
      })
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
      const next = await invoke<GitStatus>("git_merge_to_develop", {
        workspaceId: activeWorkspaceId,
      })
      setGitStatus(next)
      await refreshResources()
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
      const next = await invoke<GitStatus>("git_update_from_develop", {
        workspaceId: activeWorkspaceId,
      })
      setGitStatus(next)
      await refreshOpenTabsFromDisk()
      await refreshResources()
      await refreshFileTree()
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
      const next = await invoke<GitStatus>("git_discard_file", {
        workspaceId: activeWorkspaceId,
        path: file.path,
      })
      setGitStatus(next)
      await refreshOpenTabsFromDisk()
      await refreshResources()
      await refreshFileTree(file.appPath ? [parentPath(file.appPath)] : [])
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
      const next = await invoke<GitStatus>("git_discard_changes", {
        workspaceId: activeWorkspaceId,
      })
      setGitStatus(next)
      await refreshOpenTabsFromDisk()
      await refreshResources()
      await refreshFileTree()
    } catch (error) {
      setGitError(readableError(error))
    } finally {
      setBusyAction("")
    }
  }

  async function refreshGit(workspaceId?: string) {
    const targetWorkspaceId = typeof workspaceId === "string" ? workspaceId : activeWorkspaceId
    if (!targetWorkspaceId) return

    try {
      const next = await invoke<GitStatus>("git_status", {
        workspaceId: targetWorkspaceId,
      })
      if (activeWorkspaceIdRef.current !== targetWorkspaceId) return

      setGitStatus(next)
      setGitError("")
    } catch (error) {
      if (activeWorkspaceIdRef.current !== targetWorkspaceId) return

      setGitError(readableError(error))
    }
  }

  async function openChangedFile(file: GitFile) {
    if (!file.appPath) {
      setGitError("That changed file is outside the selected app folder.")
      return
    }
    const appPath = file.appPath

    try {
      if (file.status === "D") {
        const originalContents = await invoke<string>("read_original_text_file", {
          workspaceId: activeWorkspaceId,
          path: appPath,
        })

        setGitError("")
        setTabs((current) => [
          ...current.filter((tab) => tab.path !== appPath),
          {
            path: appPath,
            name: fileName(appPath),
            contents: "",
            savedContents: "",
            originalContents,
            changedLines: [],
          },
        ])
        setActivePath(appPath)
        return
      }

      const [originalContents, changedLines] = await Promise.all([
        invoke<string>("read_original_text_file", {
          workspaceId: activeWorkspaceId,
          path: file.appPath,
        }),
        invoke<number[]>("changed_lines", {
          workspaceId: activeWorkspaceId,
          path: file.appPath,
          status: file.status,
        }),
      ])

      setGitError("")
      await openPath(file.appPath, fileName(file.appPath), changedLines, originalContents)
    } catch (error) {
      setGitError(readableError(error))
    }
  }

  async function openMergeFile(file: GitFile) {
    if (!activeWorkspaceId) return

    if (!file.appPath) {
      setGitError("That merge file is outside the selected app folder.")
      return
    }

    try {
      const [originalContents, changedLines] = await Promise.all([
        invoke<string>("read_develop_text_file", {
          workspaceId: activeWorkspaceId,
          path: file.appPath,
        }),
        invoke<number[]>("merge_changed_lines", {
          workspaceId: activeWorkspaceId,
          path: file.appPath,
        }),
      ])

      setGitError("")
      await openPath(file.appPath, fileName(file.appPath), changedLines, originalContents)
    } catch (error) {
      setGitError(readableError(error))
    }
  }

  return (
    <TooltipProvider>
      <div className="grid h-full min-h-0 grid-rows-[46px_minmax(0,1fr)] bg-background text-sm">
        <AppTitleBar onOpenSettings={openSettingsTab} />
        <main className="min-h-0 overflow-hidden border-t bg-background">
        <ResizablePanelGroup orientation="horizontal" className="min-h-0">
          <ResizablePanel
            id="left-sidebar"
            defaultSize="320px"
            minSize="240px"
          >
            <aside className="h-full min-h-0 bg-muted/35">
              <ResizablePanelGroup orientation="vertical" className="min-h-0">
                <ResizablePanel
                  id="navigator"
                  defaultSize={72}
                  minSize="220px"
                >
                  <section className="h-full min-h-0 overflow-hidden">
                    <Tabs defaultValue="tasks" className="h-full min-h-0 gap-0">
                      <div className="flex items-center justify-between gap-2 p-3 pb-2">
                        <span className="text-sm font-semibold">Navigator</span>
                        <TabsList>
                          <TabsTrigger value="tasks">Tasks</TabsTrigger>
                          <TabsTrigger value="files">Files</TabsTrigger>
                          <TabsTrigger value="skills">Skills</TabsTrigger>
                          <TabsTrigger value="docs">Docs</TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="tasks" className="min-h-0">
                        <TasksPanel
                          error={fileError}
                          filter={taskFilter}
                          filterOptions={taskStatusOptions}
                          tasks={visibleTasks}
                          onCreate={createTask}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onFilterChange={setTaskFilter}
                          onOpenTask={(task) => openPath(task.path, fileName(task.path))}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onStartTask={startTask}
                          onTrash={trashEntry}
                        />
                      </TabsContent>

                      <TabsContent value="files" className="min-h-0">
                        <FilesPanel
                          directories={directories}
                          error={fileError}
                          workspace={activeWorkspace}
                          onCreateFile={createFile}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onOpenWorkspace={addWorkspace}
                          onOpenFile={openFile}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onTrash={trashEntry}
                          onToggleDirectory={toggleDirectory}
                        />
                      </TabsContent>

                      <TabsContent value="skills" className="min-h-0">
                        <SkillsPanel
                          error={fileError}
                          filter={skillFilter}
                          hasSkills={skills.length > 0}
                          pinnedSkillSlugs={pinnedSkillSlugs}
                          skills={visibleSkills}
                          onCreate={createSkill}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onExecuteSkill={executeSkill}
                          onFilterChange={setSkillFilter}
                          onOpenSkill={(skill) => openPath(skill.path, "SKILL.md")}
                          onPinSkill={pinSkill}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onUnpinSkill={unpinSkill}
                          onTrash={trashEntry}
                        />
                      </TabsContent>

                      <TabsContent value="docs" className="min-h-0">
                        <DocsPanel
                          error={fileError}
                          docs={docs}
                          onCreate={createDoc}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onOpenDoc={(doc) => openPath(doc.path, fileName(doc.path))}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onTrash={trashEntry}
                        />
                      </TabsContent>
                    </Tabs>
                  </section>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel
                  id="changes"
                  defaultSize="220px"
                  minSize="150px"
                >
                  <ChangesPanel
                    activePath={activePath}
                    busyAction={busyAction}
                    commitMessage={commitMessage}
                    error={gitError}
                    gitStatus={gitStatus}
                    onCommit={commitChanges}
                    onCommitMessageChange={setCommitMessage}
                    onDiscardAll={discardChanges}
                    onDiscardFile={discardChangedFile}
                    onMerge={mergeToDevelop}
                    onOpenFile={openChangedFile}
                    onOpenMergeFile={openMergeFile}
                    onRefresh={refreshGit}
                    onSync={syncChanges}
                    onUpdateFromDevelop={updateFromDevelop}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </aside>
          </ResizablePanel>

          <ResizableHandle className={SIDE_HANDLE_CLASS} />

          <ResizablePanel id="editor-shell" minSize="520px">
            <section className="h-full min-h-0 overflow-hidden bg-background">
              <ResizablePanelGroup orientation="vertical" className="min-h-0">
                <ResizablePanel id="editor" defaultSize={74} minSize="240px">
                  <EditorPanel
                    activePath={activePath}
                    extensions={codeExtensions}
                    saving={
                      isSettingsTab(activeTab)
                        ? settingsSaveStatus === "saving"
                        : savingPath === activePath
                    }
                    settingsDirty={settingsDirty}
                    settingsPanel={
                      <SettingsPage
                        draftTaskTemplate={draftTaskTemplate}
                        error={settingsError}
                        saveStatus={settingsSaveStatus}
                        onDraftTaskTemplateChange={updateDraftTaskTemplate}
                        onResetTaskTemplate={resetTaskTemplate}
                        onSave={saveEditorSettings}
                      />
                    }
                    tab={activeTab}
                    tabs={tabs}
                    onChange={updateActiveContents}
                    onCloseTab={closeTab}
                    onPasteImage={pasteEditorImage}
                    onSave={saveActiveFile}
                    onSelectTab={setActivePath}
                  />
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel
                  id="terminal"
                  defaultSize="220px"
                  minSize="120px"
                >
                  <div className="grid h-full min-h-0 grid-rows-[1fr_46px]">
                    <BottomPanel
                      activeWorkspaceId={activeWorkspaceId}
                      activeTab={terminalTab}
                      focusNonce={terminalFocusNonce}
                      terminalStates={terminalsByWorkspace}
                      onAddTerminal={() => addTerminal()}
                      onCloseTerminal={closeTerminal}
                      onSelectTerminal={selectTerminal}
                      onSizeChange={handleTerminalSizeChange}
                      onError={setFileError}
                      onPasteImage={pasteTerminalImage}
                      onTerminalInput={handleTerminalInput}
                      onTerminalOutput={handleTerminalOutput}
                      onTabChange={setTerminalTab}
                    />

                    <ActionBar
                      canClear={
                        Boolean(activeWorkspaceId) &&
                        terminalTab === "terminal" &&
                        Boolean(activeTerminalState.activeTerminalId)
                      }
                      skills={pinnedSkills}
                      onClearInput={clearTerminalInput}
                      onMoveSkill={movePinnedSkill}
                      onUseSkill={executeSkill}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </section>
          </ResizablePanel>

          <ResizableHandle className={SIDE_HANDLE_CLASS} />

          <ResizablePanel
            id="right-sidebar"
            defaultSize="340px"
            minSize="260px"
          >
            <aside className="h-full min-h-0 overflow-hidden bg-muted/35">
              <WorkspacesPanel
                activeWorkspaceId={activeWorkspaceId}
                busy={busyAction === "workspace"}
                error={workspaceError}
                workspaces={workspaceList.workspaces}
                onCreate={addWorkspace}
                onDelete={deleteWorkspace}
                onOpenServer={openWorkspaceServer}
                onSelect={selectWorkspace}
                onSetHidden={setWorkspaceHidden}
                onStartServer={startWorkspaceServer}
                onStopServer={stopWorkspaceServer}
                serverRunning={
                  Boolean(activeWorkspace) &&
                  activeTerminalState.terminals.some(
                    (terminal) => terminal.id === `${activeWorkspaceId}-server`
                  )
                }
                workspaceStatuses={workspaceStatuses}
              />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
        </main>
      </div>
    </TooltipProvider>
  )
}

function isSettingsTab(tab?: EditorTab) {
  return tab?.kind === "settings"
}

function AppTitleBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="flex h-[46px] min-h-0 items-center bg-background">
      <div className="titlebar-drag h-full flex-1" data-tauri-drag-region="" />
      <div className="flex h-full items-center px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

function SettingsPage({
  draftTaskTemplate,
  error,
  saveStatus,
  onDraftTaskTemplateChange,
  onResetTaskTemplate,
  onSave,
}: {
  draftTaskTemplate: string
  error: string
  saveStatus: SettingsSaveStatus
  onDraftTaskTemplateChange: (value: string) => void
  onResetTaskTemplate: () => void
  onSave: () => void | Promise<void>
}) {
  const isSaving = saveStatus === "saving"

  return (
    <div className="h-full min-h-0 overflow-auto bg-background p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Personal IDE defaults.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" />
              Saved
            </span>
          ) : null}
          <Button type="submit" form="editor-settings-form" disabled={isSaving}>
            <Save />
            {isSaving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {error}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-col">
          <button
            type="button"
            className="rounded-md bg-muted px-4 py-2.5 text-left text-sm font-medium text-foreground"
          >
            Task Templates
          </button>
        </nav>

        <form
          id="editor-settings-form"
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave()
          }}
        >
          <section className="rounded-lg border bg-background">
            <div className="border-b px-6 py-5">
              <h2 className="text-lg font-semibold">Task Templates</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set the Markdown used when adding a task.
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid gap-2">
                <label htmlFor="default-task-template" className="text-sm font-medium">
                  Default add-task template
                </label>
                <Textarea
                  id="default-task-template"
                  value={draftTaskTemplate}
                  disabled={isSaving}
                  onChange={(event) => onDraftTaskTemplateChange(event.target.value)}
                  className="min-h-[320px] resize-y font-mono text-xs leading-5"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{title}}"} to insert the new task title.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={onResetTaskTemplate} disabled={isSaving}>
                  <RefreshCw />
                  Reset to default
                </Button>
              </div>
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}

function InlineCreate({
  buttonLabel,
  onCancel,
  placeholder,
  onCreate,
}: {
  buttonLabel: string
  onCancel?: () => void
  placeholder: string
  onCreate: (value: string) => void | Promise<void>
}) {
  const [value, setValue] = useState("")
  const inputIcon = buttonLabel.toLowerCase().includes("folder") ? (
    <Folder className="size-4 shrink-0 text-neutral-600" />
  ) : buttonLabel.toLowerCase().includes("file") ? (
    <FileText className="size-4 shrink-0 text-neutral-500" />
  ) : (
    <Plus className="size-4 shrink-0 text-muted-foreground" />
  )

  return (
    <form
      className="flex h-8 min-w-0 items-center gap-1 rounded-md border bg-background px-1.5"
      onDoubleClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next) return
        setValue("")
        void onCreate(next)
      }}
    >
      {inputIcon}
      <Input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setValue("")
            onCancel?.()
          }
        }}
        placeholder={placeholder}
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon-sm"
        variant="ghost"
        className="size-6"
        aria-label={buttonLabel}
      >
        <Check />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6"
        aria-label="Cancel"
        onClick={() => {
          setValue("")
          onCancel?.()
        }}
      >
        <X />
      </Button>
    </form>
  )
}

function RenameInput({
  value,
  onCancel,
  onChange,
  onSubmit,
}: {
  value: string
  onCancel: () => void
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}) {
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next) {
          onCancel()
          return
        }
        onSubmit(next)
      }}
    >
      <Input
        autoFocus
        value={value}
        className="h-7 bg-background px-2 text-sm"
        onBlur={onCancel}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
      />
    </form>
  )
}

function PanelError({ error }: { error: string }) {
  if (!error) return null

  return (
    <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {error}
    </div>
  )
}

function useDismissibleMenu<T>(menu: T | null, setMenu: (value: T | null) => void) {
  useEffect(() => {
    if (!menu) return

    const closeMenu = () => setMenu(null)

    document.addEventListener("click", closeMenu)
    document.addEventListener("keydown", closeMenu)
    return () => {
      document.removeEventListener("click", closeMenu)
      document.removeEventListener("keydown", closeMenu)
    }
  }, [menu, setMenu])
}

function TasksPanel({
  error,
  filter,
  filterOptions,
  tasks,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onFilterChange,
  onOpenTask,
  onRefresh,
  onRename,
  onReveal,
  onStartTask,
  onTrash,
}: {
  error: string
  filter: TaskStatus
  filterOptions: TaskStatus[]
  tasks: TaskItem[]
  onCreate: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onFilterChange: (value: TaskStatus) => void
  onOpenTask: (task: TaskItem) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onStartTask: (task: TaskItem) => void
  onTrash: (entry: FileEntry) => void
}) {
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const operations = {
    onCopyPath,
    onDuplicate,
    onRefresh,
    onRename,
    onReveal,
    onTrash,
  }

  useDismissibleMenu(menu, setMenu)

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(
      createRequest.basePath,
      createRequest.kind === "file" ? ensureMarkdownPath(value) : value
    )
    if (createRequest.kind === "file") {
      onCreate(resourceNameFromPath(path))
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col px-3 pb-3"
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: "workspace/tasks", nonce: Date.now() })
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="text-xs text-muted-foreground">workspace/tasks</p>
        </div>
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger className="h-7 w-32 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {taskStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PanelError error={error} />

      <ScrollArea
        className="min-h-0 flex-1"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: "workspace/tasks" })
        }}
      >
        <div className="space-y-1 pr-1">
          {createRequest ? (
            <InlineCreate
              key={createRequest.nonce}
              buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
              placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
              onCancel={() => setCreateRequest(null)}
              onCreate={createInRequest}
            />
          ) : null}
          {tasks.length ? (
            tasks.map((task) => {
              const entry = taskFileEntry(task)
              const renaming = renamePath === entry.path

              return (
              <div
                key={task.path}
                className="rounded-lg bg-background px-2 py-1"
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenu({
                    x: event.clientX,
                    y: event.clientY,
                    entry,
                    basePath: parentPath(entry.path),
                  })
                }}
              >
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  {renaming ? (
                    <RenameInput
                      value={renameValue}
                      onCancel={() => {
                        setRenamePath("")
                        setRenameValue("")
                      }}
                      onChange={setRenameValue}
                      onSubmit={(value) => {
                        setRenamePath("")
                        setRenameValue("")
                        onRename(entry, value)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-sm font-medium"
                      onClick={() => onOpenTask(task)}
                    >
                      {task.title}
                    </button>
                  )}
                  {task.status !== DONE_TASK_STATUS ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs hover:bg-transparent"
                      onClick={() => onStartTask(task)}
                    >
                      <Play />
                      Start
                    </Button>
                  ) : null}
                </div>
                {task.error ? (
                  <div className="mt-2 text-xs text-amber-700">{task.error}</div>
                ) : null}
              </div>
              )
            })
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              No tasks yet.
            </div>
          )}
        </div>
      </ScrollArea>

      <ResourceContextMenu
        basePath="workspace/tasks"
        menu={menu}
        operations={operations}
        onClose={() => setMenu(null)}
        onStartCreate={(kind, basePath) => {
          setCreateRequest({ kind, basePath, nonce: Date.now() })
        }}
        onRenameEntry={(entry) => {
          setRenamePath(entry.path)
          setRenameValue(entry.name)
        }}
      />
    </div>
  )
}

type FileCreateRequest = {
  basePath: string
  kind: "file" | "folder"
  nonce: number
}

type FileMenuState = {
  basePath: string
  entry?: FileEntry
  x: number
  y: number
}

type FileOperationProps = {
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
}

function FilesPanel({
  directories,
  error,
  workspace,
  onCreateFile,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onOpenFile,
  onOpenWorkspace,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
  onToggleDirectory,
}: {
  directories: Record<string, DirectoryState>
  error: string
  workspace?: WorkspaceInfo
  onCreateFile: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onOpenFile: (entry: FileEntry) => void
  onOpenWorkspace: () => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
  onToggleDirectory: (path: string) => void
}) {
  const root = directories[""]
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")

  useDismissibleMenu(menu, setMenu)

  function startCreate(kind: "file" | "folder", basePath: string) {
    if (basePath) void onRefresh(basePath)
    setCreateRequest({ kind, basePath, nonce: Date.now() })
    setMenu(null)
  }

  function startRename(entry: FileEntry) {
    setRenamePath(entry.path)
    setRenameValue(entry.name)
    setMenu(null)
  }

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(createRequest.basePath, value)
    if (createRequest.kind === "file") {
      onCreateFile(path)
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDoubleClick={(event) => {
        if (!workspace) return
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: "", nonce: Date.now() })
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Files</h2>
          {workspace ? (
            <p className="truncate text-xs text-muted-foreground">{workspace.appName}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No workspace</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onOpenWorkspace} aria-label="Add workspace">
            <FolderOpen />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <ScrollArea
        className="min-h-0 flex-1 px-2 pb-3"
        onContextMenu={(event) => {
          if (!workspace) return
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: "" })
        }}
      >
        {!workspace ? (
          <div className="rounded-lg border bg-background p-3">
            <div className="mb-3">
              <div className="text-sm font-medium">No workspace open</div>
              <p className="text-xs text-muted-foreground">
                Add a workspace to browse an isolated app copy.
              </p>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={onOpenWorkspace}>
              <FolderOpen />
              Add workspace
            </Button>
          </div>
        ) : root?.loading ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Loading...</div>
        ) : root?.error ? (
          <div className="px-2 py-2 text-sm text-amber-700">{root.error}</div>
        ) : (
          <FileEntries
            basePath=""
            createRequest={createRequest}
            directories={directories}
            entries={root?.entries ?? []}
            level={0}
            renamePath={renamePath}
            renameValue={renameValue}
            onCreate={createInRequest}
            onCreateCancel={() => setCreateRequest(null)}
            onContextMenu={(entry, event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenu({
                x: event.clientX,
                y: event.clientY,
                entry,
                basePath: entry.isDir ? entry.path : parentPath(entry.path),
              })
            }}
            onOpenFile={onOpenFile}
            onRename={(entry, newName) => {
              setRenamePath("")
              setRenameValue("")
              onRename(entry, newName)
            }}
            onRenameCancel={() => {
              setRenamePath("")
              setRenameValue("")
            }}
            onRenameValueChange={setRenameValue}
            onToggleDirectory={onToggleDirectory}
          />
        )}
      </ScrollArea>
      {menu ? (
        <FileContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onCopyPath={onCopyPath}
          onCreateFile={() => startCreate("file", menu.basePath)}
          onCreateFolder={() => startCreate("folder", menu.basePath)}
          onDuplicate={onDuplicate}
          onRefresh={() => {
            setMenu(null)
            onRefresh(menu.entry?.isDir ? menu.entry.path : menu.basePath)
          }}
          onRename={startRename}
          onReveal={onReveal}
          onTrash={onTrash}
        />
      ) : null}
    </div>
  )
}

function FileEntries({
  basePath,
  createRequest,
  directories,
  entries,
  level,
  renamePath,
  renameValue,
  onCreate,
  onCreateCancel,
  onContextMenu,
  onOpenFile,
  onRename,
  onRenameCancel,
  onRenameValueChange,
  onToggleDirectory,
}: {
  basePath: string
  createRequest: FileCreateRequest | null
  directories: Record<string, DirectoryState>
  entries: FileEntry[]
  level: number
  renamePath: string
  renameValue: string
  onCreate: (value: string) => void
  onCreateCancel: () => void
  onContextMenu: (entry: FileEntry, event: ReactMouseEvent) => void
  onOpenFile: (entry: FileEntry) => void
  onRename: (entry: FileEntry, value: string) => void
  onRenameCancel: () => void
  onRenameValueChange: (value: string) => void
  onToggleDirectory: (path: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {createRequest?.basePath === basePath ? (
        <div style={{ paddingLeft: 8 + level * 16 }}>
          <InlineCreate
            key={createRequest.nonce}
            buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
            placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
            onCancel={onCreateCancel}
            onCreate={onCreate}
          />
        </div>
      ) : null}
      {entries.map((entry) => {
        const directory = directories[entry.path]
        const open = Boolean(directory?.open)
        const renaming = renamePath === entry.path

        return (
          <div key={entry.path}>
            <div
              className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-background"
              style={{ paddingLeft: 8 + level * 16 }}
              onClick={(event) => {
                if (renaming || event.detail > 1) return
                if (entry.isDir) {
                  onToggleDirectory(entry.path)
                } else {
                  onOpenFile(entry)
                }
              }}
              onContextMenu={(event) => onContextMenu(entry, event)}
            >
              {entry.isDir ? (
                open ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="w-4 shrink-0" />
              )}
              {entry.isDir ? (
                <Folder className="size-4 shrink-0 text-neutral-600" />
              ) : (
                <FileText className="size-4 shrink-0 text-neutral-500" />
              )}
              {renaming ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const value = renameValue.trim()
                    if (!value || value === entry.name) {
                      onRenameCancel()
                      return
                    }
                    onRename(entry, value)
                  }}
                >
                  <Input
                    autoFocus
                    value={renameValue}
                    className="h-6 bg-background px-1 text-sm"
                    onBlur={onRenameCancel}
                    onChange={(event) => onRenameValueChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault()
                        onRenameCancel()
                      }
                    }}
                  />
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  {entry.name}
                </span>
              )}
            </div>

            {entry.isDir && open ? (
              directory?.loading ? (
                <div
                  className="h-7 px-2 text-sm text-muted-foreground"
                  style={{ paddingLeft: 28 + (level + 1) * 16 }}
                >
                  Loading...
                </div>
              ) : directory?.error ? (
                <div
                  className="h-7 px-2 text-sm text-amber-700"
                  style={{ paddingLeft: 28 + (level + 1) * 16 }}
                >
                  {directory.error}
                </div>
              ) : (
                <FileEntries
                  basePath={entry.path}
                  createRequest={createRequest}
                  directories={directories}
                  entries={directory?.entries ?? []}
                  level={level + 1}
                  renamePath={renamePath}
                  renameValue={renameValue}
                  onCreate={onCreate}
                  onCreateCancel={onCreateCancel}
                  onContextMenu={onContextMenu}
                  onOpenFile={onOpenFile}
                  onRename={onRename}
                  onRenameCancel={onRenameCancel}
                  onRenameValueChange={onRenameValueChange}
                  onToggleDirectory={onToggleDirectory}
                />
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function FileContextMenu({
  entryAction,
  isEntryPinned,
  menu,
  onClose,
  onCopyPath,
  onCreateFile,
  onCreateFolder,
  onDuplicate,
  onPinEntry,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
  onUnpinEntry,
  showCreateFolder = true,
}: {
  entryAction?: {
    icon: ReactNode
    label: string
    onClick: (entry: FileEntry) => void
  }
  isEntryPinned?: (entry: FileEntry) => boolean
  menu: FileMenuState
  onClose: () => void
  onCopyPath: (entry: FileEntry) => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onDuplicate: (entry: FileEntry) => void
  onPinEntry?: (entry: FileEntry) => void
  onRefresh: () => void
  onRename: (entry: FileEntry) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
  onUnpinEntry?: (entry: FileEntry) => void
  showCreateFolder?: boolean
}) {
  const entry = menu.entry
  const pinned = entry ? isEntryPinned?.(entry) : false

  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      className="fixed z-50 w-48 rounded-lg border bg-popover p-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      <FileMenuButton icon={<FileText />} label="New File" onClick={() => run(onCreateFile)} />
      {showCreateFolder ? (
        <FileMenuButton icon={<FolderPlus />} label="New Folder" onClick={() => run(onCreateFolder)} />
      ) : null}
      <FileMenuButton icon={<RefreshCw />} label="Refresh" onClick={() => run(onRefresh)} />

      {entry ? (
        <>
          <div className="my-1 h-px bg-border" />
          {entryAction ? (
            <FileMenuButton
              icon={entryAction.icon}
              label={entryAction.label}
              onClick={() => run(() => entryAction.onClick(entry))}
            />
          ) : null}
          {onPinEntry && onUnpinEntry ? (
            <FileMenuButton
              icon={pinned ? <PinOff /> : <Pin />}
              label={pinned ? "Unpin from bottom bar" : "Pin to bottom bar"}
              onClick={() => run(() => (pinned ? onUnpinEntry(entry) : onPinEntry(entry)))}
            />
          ) : null}
          <FileMenuButton icon={<Pencil />} label="Rename" onClick={() => run(() => onRename(entry))} />
          <FileMenuButton icon={<Files />} label="Duplicate" onClick={() => run(() => onDuplicate(entry))} />
          <FileMenuButton icon={<Copy />} label="Copy Relative Path" onClick={() => run(() => onCopyPath(entry))} />
          <FileMenuButton icon={<ExternalLink />} label="Reveal in Finder" onClick={() => run(() => onReveal(entry))} />
          <FileMenuButton
            danger
            icon={<Trash2 />}
            label="Delete"
            onClick={() => run(() => onTrash(entry))}
          />
        </>
      ) : null}
    </div>
  )
}

function FileMenuButton({
  danger,
  icon,
  label,
  onClick,
}: {
  danger?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted [&_svg]:size-3.5",
        danger && "text-red-600"
      )}
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function ResourceContextMenu({
  basePath,
  entryAction,
  isEntryPinned,
  menu,
  operations,
  onClose,
  onPinEntry,
  onStartCreate,
  onUnpinEntry,
  onRenameEntry,
}: {
  basePath: string
  entryAction?: {
    icon: ReactNode
    label: string
    onClick: (entry: FileEntry) => void
  }
  isEntryPinned?: (entry: FileEntry) => boolean
  menu: FileMenuState | null
  operations: FileOperationProps
  onClose: () => void
  onPinEntry?: (entry: FileEntry) => void
  onStartCreate: (kind: "file" | "folder", basePath: string) => void
  onUnpinEntry?: (entry: FileEntry) => void
  onRenameEntry: (entry: FileEntry) => void
}) {
  if (!menu) return null

  return (
    <FileContextMenu
      entryAction={entryAction}
      isEntryPinned={isEntryPinned}
      menu={menu}
      onClose={onClose}
      onCopyPath={operations.onCopyPath}
      showCreateFolder={false}
      onCreateFile={() => {
        onStartCreate("file", menu.basePath || basePath)
      }}
      onCreateFolder={() => {
        onStartCreate("folder", menu.basePath || basePath)
      }}
      onDuplicate={operations.onDuplicate}
      onPinEntry={onPinEntry}
      onRefresh={() => {
        operations.onRefresh(menu.entry?.isDir ? menu.entry.path : menu.basePath || basePath)
      }}
      onRename={(entry) => {
        onRenameEntry(entry)
      }}
      onReveal={operations.onReveal}
      onTrash={operations.onTrash}
      onUnpinEntry={onUnpinEntry}
    />
  )
}

function SkillsPanel({
  error,
  filter,
  hasSkills,
  pinnedSkillSlugs,
  skills,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onExecuteSkill,
  onFilterChange,
  onOpenSkill,
  onPinSkill,
  onRefresh,
  onRename,
  onReveal,
  onUnpinSkill,
  onTrash,
}: {
  error: string
  filter: string
  hasSkills: boolean
  pinnedSkillSlugs: string[]
  skills: SkillItem[]
  onCreate: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onExecuteSkill: (skill: SkillItem) => void
  onFilterChange: (value: string) => void
  onOpenSkill: (skill: SkillItem) => void
  onPinSkill: (slug: string) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onUnpinSkill: (slug: string) => void
  onTrash: (entry: FileEntry) => void
}) {
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const operations = {
    onCopyPath,
    onDuplicate,
    onRefresh,
    onRename,
    onReveal,
    onTrash,
  }

  useDismissibleMenu(menu, setMenu)

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(createRequest.basePath, value)
    if (createRequest.kind === "file") {
      onCreate(resourceNameFromPath(path))
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col px-3 pb-3"
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: SHARED_SKILLS_PATH, nonce: Date.now() })
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Skills</h2>
          <p className="text-xs text-muted-foreground">{SHARED_SKILLS_PATH}</p>
        </div>
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger className="h-7 w-28 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SKILL_TAG_FILTERS.map((tag) => (
              <SelectItem key={tag.value} value={tag.value}>
                {tag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PanelError error={error} />
      <ScrollArea
        className="min-h-0 flex-1"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: SHARED_SKILLS_PATH })
        }}
      >
        <div className="space-y-1.5 pr-1">
          {createRequest ? (
            <InlineCreate
              key={createRequest.nonce}
              buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
              placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
              onCancel={() => setCreateRequest(null)}
              onCreate={createInRequest}
            />
          ) : null}
          {skills.length ? (
            skills.map((skill) => {
              const entry = skillFolderEntry(skill)
              const renaming = renamePath === entry.path

              return (
                <div
                  key={skill.slug}
                  className="rounded-md"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setMenu({
                      x: event.clientX,
                      y: event.clientY,
                      entry,
                      basePath: parentPath(entry.path),
                    })
                  }}
                >
                  {renaming ? (
                    <RenameInput
                      value={renameValue}
                      onCancel={() => {
                        setRenamePath("")
                        setRenameValue("")
                      }}
                      onChange={setRenameValue}
                      onSubmit={(value) => {
                        setRenamePath("")
                        setRenameValue("")
                        onRename(entry, value)
                      }}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full justify-start bg-background"
                      onClick={() => onOpenSkill(skill)}
                    >
                      <Bot />
                      {skill.name}
                    </Button>
                  )}
                </div>
              )
            })
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              {hasSkills ? "No matching skills." : "No skills yet."}
            </div>
          )}
        </div>
      </ScrollArea>
      <ResourceContextMenu
        basePath={SHARED_SKILLS_PATH}
        entryAction={{
          icon: <Play />,
          label: "Execute Skill",
          onClick: (entry) => {
            const skill = skills.find((item) => item.slug === entry.name)
            if (skill) onExecuteSkill(skill)
          },
        }}
        isEntryPinned={(entry) => pinnedSkillSlugs.includes(entry.name)}
        menu={menu}
        operations={operations}
        onClose={() => setMenu(null)}
        onPinEntry={(entry) => onPinSkill(entry.name)}
        onStartCreate={(kind, basePath) => {
          setCreateRequest({ kind, basePath, nonce: Date.now() })
        }}
        onUnpinEntry={(entry) => onUnpinSkill(entry.name)}
        onRenameEntry={(entry) => {
          setRenamePath(entry.path)
          setRenameValue(entry.name)
        }}
      />
    </div>
  )
}

function DocsPanel({
  error,
  docs,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onOpenDoc,
  onRefresh,
  onRename,
  onReveal,
  onTrash,
}: {
  error: string
  docs: DocItem[]
  onCreate: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onOpenDoc: (doc: DocItem) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onTrash: (entry: FileEntry) => void
}) {
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const operations = {
    onCopyPath,
    onDuplicate,
    onRefresh,
    onRename,
    onReveal,
    onTrash,
  }

  useDismissibleMenu(menu, setMenu)

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(
      createRequest.basePath,
      createRequest.kind === "file" ? ensureMarkdownPath(value) : value
    )
    if (createRequest.kind === "file") {
      onCreate(resourceNameFromPath(path))
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col px-3 pb-3"
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: "workspace/docs", nonce: Date.now() })
      }}
    >
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Docs</h2>
        <p className="text-xs text-muted-foreground">workspace/docs</p>
      </div>
      <PanelError error={error} />
      <ScrollArea
        className="min-h-0 flex-1"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: "workspace/docs" })
        }}
      >
        <div className="space-y-1.5 pr-1">
          {createRequest ? (
            <InlineCreate
              key={createRequest.nonce}
              buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
              placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
              onCancel={() => setCreateRequest(null)}
              onCreate={createInRequest}
            />
          ) : null}
          {docs.length ? (
            docs.map((doc) => {
              const entry = docFileEntry(doc)
              const renaming = renamePath === entry.path

              return (
                <div
                  key={doc.path}
                  className="rounded-md"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setMenu({
                      x: event.clientX,
                      y: event.clientY,
                      entry,
                      basePath: parentPath(entry.path),
                    })
                  }}
                >
                  {renaming ? (
                    <RenameInput
                      value={renameValue}
                      onCancel={() => {
                        setRenamePath("")
                        setRenameValue("")
                      }}
                      onChange={setRenameValue}
                      onSubmit={(value) => {
                        setRenamePath("")
                        setRenameValue("")
                        onRename(entry, value)
                      }}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full justify-start bg-background"
                      onClick={() => onOpenDoc(doc)}
                    >
                      <FileText />
                      {doc.name}
                    </Button>
                  )}
                </div>
              )
            })
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              No docs yet.
            </div>
          )}
        </div>
      </ScrollArea>
      <ResourceContextMenu
        basePath="workspace/docs"
        menu={menu}
        operations={operations}
        onClose={() => setMenu(null)}
        onStartCreate={(kind, basePath) => {
          setCreateRequest({ kind, basePath, nonce: Date.now() })
        }}
        onRenameEntry={(entry) => {
          setRenamePath(entry.path)
          setRenameValue(entry.name)
        }}
      />
    </div>
  )
}

function ChangesPanel({
  activePath,
  busyAction,
  commitMessage,
  error,
  gitStatus,
  onCommit,
  onCommitMessageChange,
  onDiscardAll,
  onDiscardFile,
  onMerge,
  onOpenFile,
  onOpenMergeFile,
  onRefresh,
  onSync,
  onUpdateFromDevelop,
}: {
  activePath: string
  busyAction: string
  commitMessage: string
  error: string
  gitStatus: GitStatus
  onCommit: () => void
  onCommitMessageChange: (value: string) => void
  onDiscardAll: () => void
  onDiscardFile: (file: GitFile) => void
  onMerge: () => void
  onOpenFile: (file: GitFile) => void
  onOpenMergeFile: (file: GitFile) => void
  onRefresh: () => void
  onSync: () => void
  onUpdateFromDevelop: () => void
}) {
  const [discardMenu, setDiscardMenu] = useState<{
    file?: GitFile
    x: number
    y: number
  } | null>(null)

  useDismissibleMenu(discardMenu, setDiscardMenu)
  const developCommits = gitStatus.developCommits.filter(
    (commit) => !commit.subject.startsWith("Merge ")
  )
  const developFiles = developCommits.length ? gitStatus.developFiles : []
  const developUpdateCount = developCommits.length
  const isActiveFile = (file: GitFile) => Boolean(file.appPath && file.appPath === activePath)

  return (
    <div
      className="flex h-full min-h-0 flex-col p-3"
      onContextMenu={(event) => {
        event.preventDefault()
        setDiscardMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="mb-3 grid grid-cols-[1fr_auto] items-start">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Changes</div>
          <p className="truncate text-xs text-muted-foreground">
            {gitStatus.branch || "No workspace"}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh changes">
          <RefreshCw />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 pr-1">
          {developCommits.length ? (
            <div className="space-y-2 border-b pb-3">
              <div>
                <div className="text-xs font-semibold">Develop updates</div>
                <div className="text-xs text-muted-foreground">
                  {developCommits.length} commits not in workspace
                </div>
              </div>
              <div className="space-y-1">
                {developCommits.map((commit) => (
                  <div key={commit.hash} className="flex gap-2 text-xs">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {commit.hash}
                    </span>
                    <span className="min-w-0 truncate">{commit.subject}</span>
                  </div>
                ))}
              </div>
              {developFiles.length ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold">Files changed</div>
                  {developFiles.map((file) => (
                    <div
                      key={`${file.status}-${file.path}`}
                      className="flex gap-2 px-2 py-1 text-xs"
                    >
                      <span className="w-8 shrink-0 font-mono text-muted-foreground">
                        {file.status || "M"}
                      </span>
                      <span className="min-w-0 truncate">{file.path}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {gitStatus.mergeCommits.length ? (
            <div className="space-y-2 border-b pb-3">
              <div>
                <div className="text-xs font-semibold">Pending merge</div>
                <div className="text-xs text-muted-foreground">
                  {gitStatus.mergeCommits.length} commits ahead of develop
                </div>
              </div>
              <div className="space-y-1">
                {gitStatus.mergeCommits.map((commit) => (
                  <div key={commit.hash} className="flex gap-2 text-xs">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {commit.hash}
                    </span>
                    <span className="min-w-0 truncate">{commit.subject}</span>
                  </div>
                ))}
              </div>
              {gitStatus.mergeFiles.length ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold">Files changed</div>
                  {gitStatus.mergeFiles.map((file) => (
                    <button
                      key={`${file.status}-${file.path}`}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                        isActiveFile(file) && "bg-muted text-foreground",
                        !file.appPath && "text-muted-foreground"
                      )}
                      aria-current={isActiveFile(file) ? "true" : undefined}
                      onClick={() => onOpenMergeFile(file)}
                      title={file.appPath ? "Open merge diff" : "Outside selected app folder"}
                    >
                      <span className="w-8 shrink-0 font-mono text-muted-foreground">
                        {file.status || "M"}
                      </span>
                      <span className="min-w-0 truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            {gitStatus.files.length ? (
              gitStatus.files.map((file) => (
                <button
                  key={`${file.status}-${file.path}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                    isActiveFile(file) && "bg-muted text-foreground",
                    !file.appPath && "text-muted-foreground"
                  )}
                  aria-current={isActiveFile(file) ? "true" : undefined}
                  onClick={() => onOpenFile(file)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDiscardMenu({ file, x: event.clientX, y: event.clientY })
                  }}
                  title={file.appPath ? "Open changed file" : "Outside selected app folder"}
                >
                  <span className="w-8 shrink-0 font-mono text-muted-foreground">
                    {file.status || "M"}
                  </span>
                  <span className="min-w-0 truncate">{file.path}</span>
                </button>
              ))
            ) : (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No changes.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {error ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="relative">
          <Input
            value={commitMessage}
            onChange={(event) => onCommitMessageChange(event.target.value)}
            placeholder="Commit message"
            className="bg-background pr-9"
          />
          <Sparkles className="absolute top-2 right-2 size-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="bg-background"
            disabled={busyAction === "commit" || !commitMessage.trim()}
            onClick={onCommit}
          >
            <GitCommitHorizontal />
            Commit
          </Button>
          <Button
            variant="outline"
            className="bg-background"
            disabled={busyAction === "sync" || !gitStatus.unpushedCommitCount}
            onClick={onSync}
          >
            <RefreshCw />
            {busyAction === "sync"
              ? "Syncing..."
              : countLabel("Sync", gitStatus.unpushedCommitCount)}
          </Button>
          <Button
            variant="outline"
            className="bg-background"
            disabled={busyAction === "merge" || !gitStatus.unmergedCommitCount}
            onClick={onMerge}
          >
            <GitMerge />
            {busyAction === "merge"
              ? "Merging..."
              : countLabel("Merge", gitStatus.unmergedCommitCount)}
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full bg-background"
          disabled={busyAction === "update" || !developUpdateCount}
          onClick={onUpdateFromDevelop}
        >
          <ChevronDown />
          {busyAction === "update"
            ? "Updating..."
            : countLabel("Update from develop", developUpdateCount)}
        </Button>
      </div>

      {discardMenu ? (
        <div
          className="fixed z-50 w-44 rounded-lg border bg-popover p-1 shadow-md"
          style={{ left: discardMenu.x, top: discardMenu.y }}
          role="menu"
        >
          {discardMenu.file ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={busyAction === "discard"}
              onClick={() => {
                const { file } = discardMenu
                if (!file) return
                setDiscardMenu(null)
                onDiscardFile(file)
              }}
            >
              <Trash2 className="size-4" />
              Discard File
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            disabled={busyAction === "discard" || !gitStatus.files.length}
            onClick={() => {
              setDiscardMenu(null)
              onDiscardAll()
            }}
          >
            <Trash2 className="size-4" />
            Discard All
          </button>
        </div>
      ) : null}
    </div>
  )
}

function countLabel(label: string, count: number) {
  return count > 0 ? `${label} (${count})` : label
}

type MinimapRow = {
  changed: boolean
  empty: boolean
  height: number
  key: string
  top: number
  width: number
}

function minimapLineWidth(line: string) {
  const length = line.trimEnd().length
  if (!length) return 12
  return Math.min(100, Math.max(22, length * 1.8))
}

function EditorWithMinimap({
  basicSetup,
  changedLines,
  extensions,
  onChange,
  onCreateEditor,
  onScroll,
  value,
}: {
  basicSetup?: boolean | BasicSetupOptions
  changedLines?: number[]
  extensions: Extension[]
  onChange: (value: string) => void
  onCreateEditor?: (view: EditorView) => void
  onScroll?: (view: EditorView) => void
  value: string
}) {
  const viewRef = useRef<EditorView | null>(null)
  const [scrollInfo, setScrollInfo] = useState({
    clientHeight: 1,
    lineCount: 1,
    scrollHeight: 1,
    scrollTop: 0,
    viewportFromLine: 1,
    viewportToLine: 1,
  })
  const changedLineSet = useMemo(() => new Set(changedLines ?? []), [changedLines])
  const rows = useMemo<MinimapRow[]>(() => {
    const lines = value.split("\n")
    const lineCount = Math.max(1, lines.length)
    const maxRows = 320

    if (lines.length <= maxRows) {
      return lines.map((line, index) => ({
        changed: changedLineSet.has(index + 1),
        empty: !line.trim(),
        height: 100 / lineCount,
        key: String(index),
        top: (index / lineCount) * 100,
        width: minimapLineWidth(line),
      }))
    }

    const step = lines.length / maxRows
    return Array.from({ length: maxRows }, (_, index) => {
      const start = Math.floor(index * step)
      const end = Math.max(start + 1, Math.floor((index + 1) * step))
      const chunk = lines.slice(start, end)
      const longest = chunk.reduce((current, line) =>
        line.length > current.length ? line : current
      , "")

      return {
        changed: chunk.some((_, offset) => changedLineSet.has(start + offset + 1)),
        empty: !longest.trim(),
        height: ((end - start) / lineCount) * 100,
        key: `${start}-${end}`,
        top: (start / lineCount) * 100,
        width: minimapLineWidth(longest),
      }
    })
  }, [changedLineSet, value])
  const updateScrollInfo = useCallback((view: EditorView | null) => {
    if (!view) return

    const { clientHeight, scrollHeight, scrollTop } = view.scrollDOM
    const lineCount = view.state.doc.lines
    const firstVisibleRange = view.visibleRanges[0] ?? view.viewport
    const lastVisibleRange = view.visibleRanges[view.visibleRanges.length - 1] ?? view.viewport
    const viewportFromLine = view.state.doc.lineAt(firstVisibleRange.from).number
    const viewportToLine = view.state.doc.lineAt(lastVisibleRange.to).number

    setScrollInfo((current) => {
      if (
        current.clientHeight === clientHeight &&
        current.lineCount === lineCount &&
        current.scrollHeight === scrollHeight &&
        current.scrollTop === scrollTop &&
        current.viewportFromLine === viewportFromLine &&
        current.viewportToLine === viewportToLine
      ) {
        return current
      }

      return {
        clientHeight,
        lineCount,
        scrollHeight,
        scrollTop,
        viewportFromLine,
        viewportToLine,
      }
    })
  }, [])
  const minimapExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.geometryChanged || update.viewportChanged) {
          updateScrollInfo(update.view)
        }
      }),
    [updateScrollInfo]
  )
  const editorExtensions = useMemo(
    () => [...extensions, minimapExtension],
    [extensions, minimapExtension]
  )

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateScrollInfo(viewRef.current))
    return () => cancelAnimationFrame(frame)
  }, [updateScrollInfo, value])

  function scrollToPointer(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()

    const view = viewRef.current
    if (!view) return

    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const line = Math.max(1, Math.min(view.state.doc.lines, Math.round(ratio * view.state.doc.lines)))
    const pos = view.state.doc.line(line).from

    view.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    })
    requestAnimationFrame(() => {
      updateScrollInfo(view)
      onScroll?.(view)
    })
    view.focus()
  }

  const lineCount = Math.max(1, scrollInfo.lineCount)
  const viewportTop = Math.min(100, ((scrollInfo.viewportFromLine - 1) / lineCount) * 100)
  const viewportHeight = Math.min(
    100 - viewportTop,
    Math.max(8, ((scrollInfo.viewportToLine - scrollInfo.viewportFromLine + 1) / lineCount) * 100)
  )

  return (
    <div className="editor-with-minimap">
      <CodeMirror
        value={value}
        height="100%"
        extensions={editorExtensions}
        basicSetup={basicSetup}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view
          updateScrollInfo(view)
          onCreateEditor?.(view)
        }}
      />
      <div
        className="code-minimap"
        role="scrollbar"
        aria-label="Editor minimap"
        aria-orientation="vertical"
        aria-valuemax={Math.max(0, scrollInfo.scrollHeight - scrollInfo.clientHeight)}
        aria-valuemin={0}
        aria-valuenow={scrollInfo.scrollTop}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          scrollToPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) scrollToPointer(event)
        }}
      >
        <div className="code-minimap__lines">
          {rows.map((row) => (
            <span
              key={row.key}
              className={cn(
                "code-minimap__line",
                row.empty && "is-empty",
                row.changed && "is-changed"
              )}
              style={{
                height: `${row.height}%`,
                top: `${row.top}%`,
                width: `${row.width}%`,
              }}
            />
          ))}
        </div>
        <div
          className="code-minimap__viewport"
          style={{ height: `${viewportHeight}%`, top: `${viewportTop}%` }}
        />
      </div>
    </div>
  )
}

function EditorPanel({
  activePath,
  extensions,
  saving,
  settingsDirty,
  settingsPanel,
  tab,
  tabs,
  onChange,
  onCloseTab,
  onPasteImage,
  onSave,
  onSelectTab,
}: {
  activePath: string
  extensions: Extension[]
  saving: boolean
  settingsDirty: boolean
  settingsPanel: ReactNode
  tab?: EditorTab
  tabs: EditorTab[]
  onChange: (value: string) => void
  onCloseTab: (path: string) => void
  onPasteImage: (event: ClipboardEvent, view: EditorView) => void
  onSave: () => void
  onSelectTab: (path: string) => void
}) {
  const pasteImageExtension = useMemo(
    () =>
      EditorView.domEventHandlers({
        paste(event, view) {
          if (!clipboardImage(event)) return false
          onPasteImage(event, view)
          return true
        },
      }),
    [onPasteImage]
  )
  const editableExtensions = useMemo(
    () => [...extensions, pasteImageExtension],
    [extensions, pasteImageExtension]
  )
  const [originalView, setOriginalView] = useState<EditorView | null>(null)
  const [currentView, setCurrentView] = useState<EditorView | null>(null)
  const syncScroll = useCallback((source: EditorView, target: EditorView | null) => {
    if (!target) return

    const { scrollLeft, scrollTop } = source.scrollDOM
    if (target.scrollDOM.scrollTop === scrollTop && target.scrollDOM.scrollLeft === scrollLeft) {
      return
    }

    target.scrollDOM.scrollTop = scrollTop
    target.scrollDOM.scrollLeft = scrollLeft
  }, [])
  const originalSyncExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.viewportChanged) syncScroll(update.view, currentView)
      }),
    [currentView, syncScroll]
  )
  const currentSyncExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.viewportChanged) syncScroll(update.view, originalView)
      }),
    [originalView, syncScroll]
  )
  const originalExtensions = tab
    ? [
        editorTheme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        originalSyncExtension,
        ...languageForPath(tab.path),
      ]
    : []
  const splitEditableExtensions = useMemo(
    () => [...editableExtensions, currentSyncExtension],
    [currentSyncExtension, editableExtensions]
  )

  return (
    <div className="grid h-full min-h-0 grid-rows-[42px_1fr]">
      <div className="flex min-w-0 items-center justify-between bg-muted/35">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          {tabs.length ? (
            tabs.map((item) => {
              const dirty =
                isSettingsTab(item)
                  ? settingsDirty
                  : item.contents !== item.savedContents
              const TabIcon = isSettingsTab(item) ? Settings : FileText

              return (
                <div
                  key={item.path}
                  className={cn(
                    "flex h-10 max-w-56 min-w-28 items-center border-r text-sm text-muted-foreground transition-colors hover:bg-muted/70",
                    activePath === item.path && "bg-background text-foreground"
                  )}
                >
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left"
                    onClick={() => onSelectTab(item.path)}
                  >
                    <TabIcon className="size-3.5 shrink-0" />
                    <span className="truncate font-medium">{item.name}</span>
                    {dirty ? <span className="size-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
                  </button>
                  <button
                    type="button"
                    className="mr-1 rounded p-0.5 hover:bg-muted"
                    onClick={() => onCloseTab(item.path)}
                    aria-label={`Close ${item.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )
            })
          ) : (
            <div className="flex h-10 items-center gap-2 px-3 text-sm font-medium text-muted-foreground">
              <FileText className="size-3.5" />
              Untitled
            </div>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!tab || saving}
              onClick={onSave}
              className="mr-2 size-7"
              aria-label="Save"
            >
              <Save />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-full min-h-0 overflow-hidden bg-background">
        {tab ? (
          isSettingsTab(tab) ? (
            settingsPanel
          ) : (
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            {tab.originalContents !== undefined ? (
              <div className="grid h-full min-h-0 grid-cols-2">
                <div className="grid h-full min-h-0 min-w-0 grid-rows-[28px_minmax(0,1fr)] border-r">
                  <div className="flex items-center border-b bg-muted/35 px-3 text-xs font-medium text-muted-foreground">
                    Original
                  </div>
                  <div className="min-h-0 overflow-hidden">
                    <CodeMirror
                      value={tab.originalContents}
                      height="100%"
                      extensions={originalExtensions}
                      basicSetup={{ foldGutter: true, highlightActiveLine: false }}
                      onCreateEditor={(view) => {
                        setOriginalView(view)
                      }}
                    />
                  </div>
                </div>
                <div className="grid h-full min-h-0 min-w-0 grid-rows-[28px_minmax(0,1fr)]">
                  <div className="flex items-center border-b bg-muted/35 px-3 text-xs font-medium text-muted-foreground">
                    Current
                  </div>
                  <EditorWithMinimap
                    value={tab.contents}
                    extensions={splitEditableExtensions}
                    changedLines={tab.changedLines}
                    basicSetup={{ foldGutter: true, highlightActiveLine: true }}
                    onChange={onChange}
                    onCreateEditor={(view) => {
                      setCurrentView(view)
                    }}
                    onScroll={(view) => syncScroll(view, originalView)}
                  />
                </div>
              </div>
            ) : (
              <EditorWithMinimap
                value={tab.contents}
                extensions={editableExtensions}
                changedLines={tab.changedLines}
                basicSetup={{ foldGutter: true, highlightActiveLine: true }}
                onChange={onChange}
              />
            )}
            {tab.error ? (
              <div className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                {tab.error}
              </div>
            ) : null}
          </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
            <div className="max-w-sm">
              <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
                <Code2 className="size-5" />
              </div>
              <div className="text-base font-semibold text-foreground">
                Open a text file
              </div>
              <p className="mt-1 text-sm">
                Choose a workspace file, task, skill, or doc to edit.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BottomPanel({
  activeWorkspaceId,
  activeTab,
  focusNonce,
  terminalStates,
  onAddTerminal,
  onCloseTerminal,
  onSelectTerminal,
  onSizeChange,
  onError,
  onPasteImage,
  onTerminalInput,
  onTerminalOutput,
  onTabChange,
}: {
  activeWorkspaceId: string
  activeTab: string
  focusNonce: number
  terminalStates: Record<string, WorkspaceTerminalState>
  onAddTerminal: () => void
  onCloseTerminal: (workspaceId: string, terminalId: string) => void
  onSelectTerminal: (workspaceId: string, terminalId: string) => void
  onSizeChange: (cols: number, rows: number) => void
  onError: (value: string) => void
  onPasteImage: (event: ReactClipboardEvent | ClipboardEvent) => void
  onTerminalInput: (workspaceId: string, terminalId: string) => void
  onTerminalOutput: (workspaceId: string, terminalId: string, data: number[]) => void
  onTabChange: (value: string) => void
}) {
  const activeTerminalState = terminalStateFor(activeWorkspaceId, terminalStates)
  const activeTerminalId = activeTerminalState.activeTerminalId
  const terminalEntries = Object.entries(terminalStates).flatMap(([workspaceId, state]) =>
    state.terminals.map((terminal) => ({ workspaceId, terminal }))
  )

  return (
    <div
      className="grid h-full min-h-0 grid-rows-[40px_1fr] border-b bg-muted/35"
      onPaste={onPasteImage}
    >
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {activeTerminalState.terminals.map((terminal) => {
            const selected = activeTab === "terminal" && terminal.id === activeTerminalId

            return (
              <div
                key={terminal.id}
                className={cn(
                  "flex h-7 shrink-0 items-center rounded-md text-xs text-muted-foreground",
                  selected && "bg-muted text-foreground"
                )}
              >
                <button
                  type="button"
                  className="h-full px-2 font-medium hover:text-foreground"
                  onClick={() => onSelectTerminal(activeWorkspaceId, terminal.id)}
                >
                  {terminal.name}
                </button>
                <button
                  type="button"
                  className="flex h-full items-center px-2 text-muted-foreground hover:text-foreground"
                  aria-label={`Close ${terminal.name}`}
                  onClick={() => onCloseTerminal(activeWorkspaceId, terminal.id)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="h-7 shrink-0 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
          disabled={!activeWorkspaceId}
          onClick={onAddTerminal}
        >
          + Add terminal
        </button>
        <button
          type="button"
          className={cn(
            "h-7 shrink-0 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
            activeTab === "problems" && "bg-muted text-foreground"
          )}
          onClick={() => onTabChange("problems")}
        >
          Problems
        </button>
      </div>
      <div className="min-h-0 bg-background">
        <div className={cn("h-full min-h-0", activeTab !== "terminal" && "hidden")}>
          {terminalEntries.map(({ workspaceId, terminal }) => (
            <div
              key={terminal.id}
              className={cn(
                "h-full min-h-0",
                (workspaceId !== activeWorkspaceId || terminal.id !== activeTerminalId) &&
                  "hidden"
              )}
            >
              <TerminalPane
                active={
                  activeTab === "terminal" &&
                  workspaceId === activeWorkspaceId &&
                  terminal.id === activeTerminalId
                }
                focusNonce={terminal.id === activeTerminalId ? focusNonce : 0}
                onSizeChange={onSizeChange}
                onError={onError}
                onPasteImage={onPasteImage}
                onTerminalInput={onTerminalInput}
                onTerminalOutput={onTerminalOutput}
                startupCommand={terminal.startupCommand}
                terminalId={terminal.id}
                workspaceId={workspaceId}
              />
            </div>
          ))}
        </div>
        <div
          className={cn(
            "h-full bg-background p-4 text-xs text-muted-foreground",
            activeTab !== "problems" && "hidden"
          )}
        >
          No problems
        </div>
      </div>
    </div>
  )
}

function TerminalPane({
  active,
  focusNonce,
  onSizeChange,
  onError,
  onPasteImage,
  onTerminalInput,
  onTerminalOutput,
  terminalId,
  startupCommand,
  workspaceId,
}: {
  active: boolean
  focusNonce: number
  onSizeChange: (cols: number, rows: number) => void
  onError: (value: string) => void
  onPasteImage: (event: ClipboardEvent) => void
  onTerminalInput: (workspaceId: string, terminalId: string) => void
  onTerminalOutput: (workspaceId: string, terminalId: string, data: number[]) => void
  startupCommand?: string
  terminalId: string
  workspaceId: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const frameRef = useRef<number | null>(null)
  const startupCommandSentRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePaste = (event: ClipboardEvent) => onPasteImage(event)
    container.addEventListener("paste", handlePaste, true)
    return () => container.removeEventListener("paste", handlePaste, true)
  }, [onPasteImage])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let unlisten: (() => void) | undefined

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      scrollback: 10000,
      theme: {
        background: "#ffffff",
        foreground: "#171717",
        cursor: "#171717",
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    terminalRef.current = terminal
    fitRef.current = fit

    const refreshTerminal = () => {
      if (cancelled || terminal.rows < 1) return

      try {
        terminal.refresh(0, terminal.rows - 1)
      } catch {
        // xterm can throw while the panel is hidden during resize.
      }
    }

    const fitTerminal = () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        if (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) {
          return
        }

        try {
          fit.fit()
          refreshTerminal()
          onSizeChange(terminal.cols || 80, terminal.rows || 24)
          void invoke("resize_terminal", {
            terminalId,
            cols: terminal.cols || 80,
            rows: terminal.rows || 24,
          }).catch(() => undefined)
        } catch {
          // xterm can throw while the panel is hidden during resize.
        }
      })
    }

    const startAfterFit = () => {
      try {
        fit.fit()
        refreshTerminal()
        const cols = terminal.cols || 80
        const rows = terminal.rows || 24
        onSizeChange(cols, rows)
        void invoke("start_terminal", { workspaceId, terminalId, cols, rows })
          .then(() => invoke("resize_terminal", { terminalId, cols, rows }))
          .then(() => {
            if (!startupCommand || startupCommandSentRef.current) return undefined

            startupCommandSentRef.current = true
            return invoke("write_terminal", { terminalId, data: startupCommand })
          })
          .catch((error) => onError(readableError(error)))
      } catch (error) {
        onError(readableError(error))
      }
    }

    const dataDisposable = terminal.onData((data) => {
      void invoke("write_terminal", { terminalId, data }).catch((error) =>
        onError(readableError(error))
      )
    })
    const keyDisposable = terminal.onKey(({ domEvent }) => {
      if (domEvent.key !== "Enter") return
      if (domEvent.metaKey || domEvent.ctrlKey || domEvent.altKey) return
      onTerminalInput(workspaceId, terminalId)
    })
    const observer = new ResizeObserver(fitTerminal)
    observer.observe(container)

    listen<TerminalOutput>("terminal-output", (event) => {
      if (
        event.payload.workspaceId !== workspaceId ||
        event.payload.terminalId !== terminalId
      ) {
        return
      }
      const data = new Uint8Array(event.payload.data)
      onTerminalOutput(workspaceId, terminalId, event.payload.data)
      terminal.write(data, refreshTerminal)
    })
      .then((dispose) => {
        if (cancelled) {
          dispose()
          return
        }

        unlisten = dispose
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(startAfterFit)
        })
      })
      .catch((error) => onError(readableError(error)))

    return () => {
      cancelled = true
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      unlisten?.()
      observer.disconnect()
      dataDisposable.dispose()
      keyDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [
    onError,
    onSizeChange,
    onTerminalInput,
    onTerminalOutput,
    startupCommand,
    terminalId,
    workspaceId,
  ])

  useEffect(() => {
    terminalRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    if (!active) return

    const frame = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current
      const fit = fitRef.current
      if (!terminal || !fit) return

      try {
        fit.fit()
        onSizeChange(terminal.cols || 80, terminal.rows || 24)
        void invoke("resize_terminal", {
          terminalId,
          cols: terminal.cols || 80,
          rows: terminal.rows || 24,
        }).catch(() => undefined)
        window.requestAnimationFrame(() => {
          if (terminal.rows < 1) return
          try {
            terminal.refresh(0, terminal.rows - 1)
          } catch {
            // xterm can throw while the panel is being shown.
          }
        })
        terminal.focus()
      } catch {
        // xterm can throw while the panel is being shown.
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [active, onSizeChange, terminalId])

  return (
    <div className="h-full min-h-0 p-2">
      <div ref={containerRef} className="h-full min-h-0 overflow-hidden" />
    </div>
  )
}

function ActionBar({
  canClear,
  skills,
  onClearInput,
  onMoveSkill,
  onUseSkill,
}: {
  canClear: boolean
  skills: SkillItem[]
  onClearInput: () => void
  onMoveSkill: (slug: string, overSlug: string) => void
  onUseSkill: (skill: SkillItem) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onMoveSkill(String(active.id), String(over.id))
  }

  return (
    <div className="flex h-full items-center gap-2 bg-muted/35 px-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={skills.map((skill) => skill.slug)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex min-w-0 items-center gap-2">
            {skills.map((skill) => (
              <SortableSkillShortcut key={skill.slug} skill={skill} onUseSkill={onUseSkill} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="ml-auto h-7 shrink-0 rounded-md px-2 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
        disabled={!canClear}
        onClick={onClearInput}
      >
        Clear
      </button>
    </div>
  )
}

function SortableSkillShortcut({
  skill,
  onUseSkill,
}: {
  skill: SkillItem
  onUseSkill: (skill: SkillItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: skill.slug })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex h-7 shrink-0 items-center rounded-lg"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing [&_svg]:size-3.5"
        aria-label={`Reorder ${skill.name}`}
      >
        <GripVertical />
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-l-none"
        onClick={() => onUseSkill(skill)}
      >
        {skill.name}
      </Button>
    </div>
  )
}

function WorkspacesPanel({
  activeWorkspaceId,
  busy,
  error,
  workspaces,
  onCreate,
  onDelete,
  onOpenServer,
  onSelect,
  onSetHidden,
  onStartServer,
  onStopServer,
  serverRunning,
  workspaceStatuses,
}: {
  activeWorkspaceId: string
  busy: boolean
  error: string
  workspaces: WorkspaceInfo[]
  onCreate: () => void
  onDelete: (workspaceId: string) => void
  onOpenServer: (workspace: WorkspaceInfo) => void
  onSelect: (workspaceId: string) => void
  onSetHidden: (workspaceId: string, hidden: boolean) => void
  onStartServer: (workspace: WorkspaceInfo) => void
  onStopServer: (workspace: WorkspaceInfo) => void
  serverRunning: boolean
  workspaceStatuses: Record<string, WorkspaceStatus>
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<"active" | "hidden">("active")
  useDismissibleMenu(openMenuId, setOpenMenuId)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const visibleWorkspaces = workspaces.filter((workspace) =>
    workspaceView === "hidden" ? workspace.hidden : !workspace.hidden
  )
  const activeServerUrl = activeWorkspace
    ? `http://localhost:${serverPortForWorkspace(activeWorkspace)}/`
    : ""

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Workspaces</h2>
          <p className="text-xs text-muted-foreground">Isolated worktrees</p>
        </div>
        <div className="flex items-center gap-1">
          <Select
            value={workspaceView}
            onValueChange={(value) => setWorkspaceView(value as "active" | "hidden")}
          >
            <SelectTrigger className="h-8 w-24 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon-sm" onClick={onCreate} disabled={busy} aria-label="Add workspace">
            <Plus />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visibleWorkspaces.length ? (
          visibleWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className={cn(
                  "relative rounded-lg bg-background p-3 transition-colors",
                  activeWorkspaceId === workspace.id && "bg-muted"
                )}
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-lg bg-muted"
                  onClick={() => onSelect(workspace.id)}
                  aria-label={`Select ${workspace.appName}`}
                >
                  <FolderOpen className="size-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => onSelect(workspace.id)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{workspace.appName}</span>
                    {workspaceStatuses[workspace.id] ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          workspaceStatuses[workspace.id] === "running"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {workspaceStatuses[workspace.id] === "running"
                          ? "Running"
                          : "Waiting input"}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {workspace.name}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenMenuId(openMenuId === workspace.id ? null : workspace.id)
                  }}
                  aria-label={`${workspace.appName} menu`}
                >
                  <MoreVertical />
                </Button>
              </div>

              {openMenuId === workspace.id ? (
                <div
                  className="absolute right-3 top-12 z-10 grid w-36 gap-1 rounded-md border bg-popover p-1 shadow-md"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setOpenMenuId(null)
                      onSetHidden(workspace.id, !workspace.hidden)
                    }}
                  >
                    {workspace.hidden ? <Eye /> : <EyeOff />}
                    {workspace.hidden ? "Show" : "Hide"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start text-red-600 hover:text-red-600"
                    onClick={() => {
                      setOpenMenuId(null)
                      onDelete(workspace.id)
                    }}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </div>
              ) : null}
              </div>
          ))
        ) : (
          <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            No {workspaceView} workspaces.
          </div>
        )}
      </div>

      {activeWorkspace ? (
        <div className="mt-3 flex min-w-0 items-center gap-2 pt-3">
          {activeWorkspace.isTauri ? (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              Desktop app
            </span>
          ) : (
            <>
              <button
                type="button"
                className="min-w-0 truncate text-sm font-medium hover:underline"
                onClick={() => onOpenServer(activeWorkspace)}
                title={activeServerUrl}
              >
                {activeServerUrl}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0"
                    onClick={() =>
                      serverRunning
                        ? onStopServer(activeWorkspace)
                        : onStartServer(activeWorkspace)
                    }
                    aria-label={serverRunning ? "Stop server" : "Start server"}
                  >
                    {serverRunning ? <Square className="size-3 fill-current" /> : <Play />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {serverRunning ? "Stop server" : "Start server"}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function looksLikeAgentOutput(data: number[]) {
  const clean = TERMINAL_OUTPUT_DECODER
    .decode(new Uint8Array(data))
    .replace(ANSI_ESCAPE_PATTERN, "")
  return /(^|\n)\s*(\u2022|Ran |Edited |Updated |Thinking|Checking|Applying|Codex\b)/.test(clean)
}

function languageForPath(path: string): Extension[] {
  const extension = path.split(".").pop()?.toLowerCase()

  if (path.startsWith("workspace/tasks/") || path.startsWith(`${SHARED_SKILLS_PATH}/`)) return []

  if (["ts", "tsx"].includes(extension ?? "")) {
    return [javascript({ jsx: extension === "tsx", typescript: true })]
  }

  if (["js", "jsx", "mjs", "cjs"].includes(extension ?? "")) {
    return [javascript({ jsx: extension === "jsx" })]
  }

  if (extension === "json") return [json()]
  if (["css", "scss", "sass"].includes(extension ?? "")) return [css()]
  if (["html", "htm"].includes(extension ?? "")) return [html()]
  if (["md", "mdx"].includes(extension ?? "")) return [markdown()]
  if (extension === "py") return [python()]
  if (extension === "rs") return [rust()]
  if (["sql", "sqlite"].includes(extension ?? "")) return [sql()]

  return []
}

function fileName(path: string) {
  return path.split("/").pop() || "Untitled"
}

function parentPath(path: string) {
  return path.split("/").slice(0, -1).join("/")
}

function serverPortForWorkspace(workspace: WorkspaceInfo) {
  const appPort = localAppPorts[workspace.appName as keyof typeof localAppPorts]
  if (typeof appPort === "number") return appPort

  const fallbackBasePort = Math.max(...Object.values(localAppPorts))
  const workspaceNumber = Number(workspace.name.match(/#(\d+)/)?.[1])
  if (Number.isFinite(workspaceNumber) && workspaceNumber > 0) {
    return fallbackBasePort + workspaceNumber
  }

  const fallbackNumber = Number(workspace.id.match(/(\d+)$/)?.[1])
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0
    ? fallbackBasePort + fallbackNumber
    : fallbackBasePort + 1
}

function serverStartCommand(port: number) {
  const origins = `http://127.0.0.1:${port},http://localhost:${port}`
  return `app_name=$(node -p "require('./package.json').name")\ntest -d ../../node_modules || (cd ../.. && npm install)\ncd ../.. && CORE_APP_ORIGINS="${origins}" npm run dev --workspace="$app_name" -- --port ${port}\n`
}

function taskFileEntry(task: TaskItem): FileEntry {
  return { name: fileName(task.path), path: task.path, isDir: false }
}

function taskMatchesFilter(task: TaskItem, filter: TaskStatus) {
  if (filter === DEFAULT_TASK_FILTER) return task.status !== DONE_TASK_STATUS
  return task.status === filter
}

function taskStatusFilterOptions(tasks: TaskItem[], currentFilter: TaskStatus) {
  const statuses = new Set<TaskStatus>([
    DEFAULT_TASK_FILTER,
    DONE_TASK_STATUS,
    currentFilter,
  ])

  for (const task of tasks) {
    if (task.status) statuses.add(task.status)
  }

  const dynamicStatuses = Array.from(statuses)
    .filter((status) => status !== DEFAULT_TASK_FILTER && status !== DONE_TASK_STATUS)
    .sort((left, right) => taskStatusLabel(left).localeCompare(taskStatusLabel(right)))

  return [DEFAULT_TASK_FILTER, ...dynamicStatuses, DONE_TASK_STATUS]
}

function taskStatusLabel(status: TaskStatus) {
  if (status === DEFAULT_TASK_FILTER) return "Active"
  if (status === DONE_TASK_STATUS) return "Done"

  const words = status.trim().split(/[\s_-]+/).filter(Boolean)
  return words.length
    ? words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
    : "Active"
}

function skillFolderEntry(skill: SkillItem): FileEntry {
  const path = parentPath(skill.path)
  return { name: fileName(path), path, isDir: true }
}

function skillSlugFromPath(path: string) {
  return path.startsWith(`${SHARED_SKILLS_PATH}/`) ? path.split("/")[2] : ""
}

function docFileEntry(doc: DocItem): FileEntry {
  return { name: fileName(doc.path), path: doc.path, isDir: false }
}

function ensureMarkdownPath(path: string) {
  return path.toLowerCase().endsWith(".md") ? path : `${path}.md`
}

function resourceNameFromPath(path: string) {
  return fileName(path).replace(/\.md$/i, "")
}

function terminalStateFor(
  workspaceId: string,
  source: Record<string, WorkspaceTerminalState>
) {
  return workspaceId ? source[workspaceId] ?? EMPTY_TERMINAL_STATE : EMPTY_TERMINAL_STATE
}

function nextTerminalName(terminals: TerminalItem[]) {
  const used = new Set(
    terminals
      .map((terminal) => terminal.name.match(/^Terminal (\d+)$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
  )
  let index = 1
  while (used.has(index)) index += 1
  return `Terminal ${index}`
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function joinRelativePath(basePath: string, childPath: string) {
  if (!basePath) return childPath
  if (!childPath) return basePath
  return `${basePath}/${childPath}`.replace(/\/+/g, "/")
}

function isSameOrChildPath(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`)
}

function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  if (path === oldPrefix) return newPrefix
  return `${newPrefix}${path.slice(oldPrefix.length)}`
}

function removeDirectoryPrefix(
  directories: Record<string, DirectoryState>,
  path: string
) {
  return Object.fromEntries(
    Object.entries(directories).filter(([key]) => !isSameOrChildPath(key, path))
  )
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function loadPinnedSkillSettings(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_SKILLS_STORAGE_KEY) ?? "[]")
    if (Array.isArray(value)) return uniqueStrings(value)
    if (value && typeof value === "object") {
      return uniqueStrings(Object.values(value).flat())
    }
    return []
  } catch {
    return []
  }
}

function uniqueStrings(values: unknown[]) {
  const result: string[] = []
  for (const value of values) {
    if (typeof value === "string" && value && !result.includes(value)) {
      result.push(value)
    }
  }
  return result
}

export default App
