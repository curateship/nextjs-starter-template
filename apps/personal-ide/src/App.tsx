import { invoke } from "@tauri-apps/api/core"
import CodeMirror from "@uiw/react-codemirror"
import type { Extension } from "@codemirror/state"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { python } from "@codemirror/lang-python"
import { rust } from "@codemirror/lang-rust"
import { sql } from "@codemirror/lang-sql"
import { EditorView } from "@codemirror/view"
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Code2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  MoreVertical,
  PanelBottom,
  Plus,
  Save,
  Sparkles,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"

type WorkspaceInfo = {
  name: string
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
  error?: string
}

type TaskStatus = "ready" | "in-progress" | "done"

const editorTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-content": { padding: "16px" },
  ".cm-gutters": { backgroundColor: "#f8f8f8", borderRight: "1px solid #d4d4d4" },
  ".cm-activeLine": { backgroundColor: "#f4f4f4" },
  ".cm-activeLineGutter": { backgroundColor: "#ececec" },
})

const tasks: { id: number; title: string; initialStatus: TaskStatus }[] = [
  { id: 1, title: "Task #1", initialStatus: "ready" },
  { id: 2, title: "Task #2", initialStatus: "in-progress" },
  { id: 3, title: "Task #3", initialStatus: "ready" },
  { id: 4, title: "Task #4", initialStatus: "ready" },
]

const SIDE_HANDLE_CLASS =
  "h-full w-px cursor-col-resize bg-border after:absolute after:top-0 after:left-1/2 after:h-full after:w-2 after:-translate-x-1/2 after:content-[''] hover:bg-border"

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  const [fileError, setFileError] = useState("")
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState("")
  const [savingPath, setSavingPath] = useState("")
  const [taskFilter, setTaskFilter] = useState("all")
  const [taskStatuses, setTaskStatuses] = useState<Record<number, TaskStatus>>(
    Object.fromEntries(tasks.map((task) => [task.id, task.initialStatus]))
  )
  const [terminalTab, setTerminalTab] = useState("terminal")
  const [workspaceStatuses, setWorkspaceStatuses] = useState([
    { name: "Workspace #1", status: "Running" },
    { name: "Workspace #2", status: "Waiting your input" },
  ])
  const [commitMessage, setCommitMessage] = useState("")
  const [selectedSkill, setSelectedSkill] = useState("all")
  const [activity, setActivity] = useState("Ready")

  const activeTab = tabs.find((tab) => tab.path === activePath)
  const visibleTasks = tasks.filter((task) => {
    if (taskFilter === "all") return true
    return taskStatuses[task.id] === taskFilter
  })

  const codeExtensions = useMemo(
    () => [editorTheme, ...languageForPath(activeTab?.path ?? "")],
    [activeTab?.path]
  )

  async function openWorkspace() {
    setFileError("")
    const selected = await invoke<WorkspaceInfo | null>("pick_workspace_folder")

    if (!selected) return

    setWorkspace(selected)
    setDirectories({})
    setTabs([])
    setActivePath("")
    setActivity(`Opened ${selected.name}`)
    await loadDirectory("")
  }

  async function loadDirectory(path: string) {
    setDirectories((current) => ({
      ...current,
      [path]: { ...current[path], open: true, loading: true, error: undefined },
    }))

    try {
      const entries = await invoke<FileEntry[]>("list_dir", {
        path: path || null,
      })

      setDirectories((current) => ({
        ...current,
        [path]: { open: true, loading: false, entries },
      }))
    } catch (error) {
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

  async function openFile(entry: FileEntry) {
    setFileError("")
    const existing = tabs.find((tab) => tab.path === entry.path)

    if (existing) {
      setActivePath(existing.path)
      return
    }

    try {
      const contents = await invoke<string>("read_text_file", {
        path: entry.path,
      })
      setTabs((current) => [
        ...current,
        {
          path: entry.path,
          name: entry.name,
          contents,
          savedContents: contents,
        },
      ])
      setActivePath(entry.path)
      setActivity(`Opened ${entry.name}`)
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  function updateActiveContents(contents: string) {
    if (!activePath) return

    setTabs((current) =>
      current.map((tab) =>
        tab.path === activePath ? { ...tab, contents, error: undefined } : tab
      )
    )
  }

  async function saveActiveFile() {
    const tab = tabs.find((item) => item.path === activePath)
    if (!tab) return

    setSavingPath(tab.path)
    try {
      await invoke("write_text_file", {
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
      setActivity(`Saved ${tab.name}`)
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

  function closeTab(path: string) {
    const tab = tabs.find((item) => item.path === path)
    if (!tab) return

    if (tab.contents !== tab.savedContents && !window.confirm("Close unsaved file?")) {
      return
    }

    const nextTabs = tabs.filter((item) => item.path !== path)
    setTabs(nextTabs)

    if (activePath === path) {
      setActivePath(nextTabs[nextTabs.length - 1]?.path ?? "")
    }
  }

  function cycleTaskStatus(id: number) {
    const nextStatus: Record<TaskStatus, TaskStatus> = {
      ready: "in-progress",
      "in-progress": "done",
      done: "ready",
    }

    setTaskStatuses((current) => ({
      ...current,
      [id]: nextStatus[current[id]],
    }))
  }

  function toggleWorkspaceStatus(index: number) {
    setWorkspaceStatuses((current) =>
      current.map((workspace, workspaceIndex) =>
        workspaceIndex === index
          ? {
              ...workspace,
              status:
                workspace.status === "Running"
                  ? "Waiting your input"
                  : "Running",
            }
          : workspace
      )
    )
  }

  return (
    <TooltipProvider>
      <main className="h-full min-h-0 border-t bg-background text-sm">
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
                    <Tabs defaultValue="tasks" className="min-h-0 gap-0">
                      <div className="flex items-center justify-between gap-2 p-3 pb-2">
                        <span className="text-sm font-semibold">Navigator</span>
                        <TabsList>
                          <TabsTrigger value="tasks">Tasks</TabsTrigger>
                          <TabsTrigger value="files">Files</TabsTrigger>
                          <TabsTrigger value="docs">Docs</TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="tasks" className="min-h-0">
                        <TasksPanel
                          filter={taskFilter}
                          statuses={taskStatuses}
                          tasks={visibleTasks}
                          onFilterChange={setTaskFilter}
                          onTaskClick={cycleTaskStatus}
                          onCreate={() => setActivity("Create task")}
                        />
                      </TabsContent>

                      <TabsContent value="files" className="min-h-0">
                        <FilesPanel
                          directories={directories}
                          error={fileError}
                          workspace={workspace}
                          onOpenWorkspace={openWorkspace}
                          onOpenFile={openFile}
                          onToggleDirectory={toggleDirectory}
                        />
                      </TabsContent>

                      <TabsContent value="docs" className="min-h-0">
                        <DocsPanel onClick={setActivity} />
                      </TabsContent>
                    </Tabs>
                  </section>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel
                  id="changes"
                  defaultSize="180px"
                  minSize="140px"
                >
                  <ChangesPanel
                    commitMessage={commitMessage}
                    onCommitMessageChange={setCommitMessage}
                    onMore={() => setActivity("Changes menu")}
                    onSync={() => setActivity(commitMessage || "Sync Changes")}
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
                    saving={savingPath === activePath}
                    tab={activeTab}
                    tabs={tabs}
                    onChange={updateActiveContents}
                    onCloseTab={closeTab}
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
                      activeTab={terminalTab}
                      activity={activity}
                      onTabChange={setTerminalTab}
                    />

                    <ActionBar
                      selectedSkill={selectedSkill}
                      onAction={setActivity}
                      onSkillChange={setSelectedSkill}
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
                statuses={workspaceStatuses}
                onCreate={() => setActivity("Create workspace")}
                onToggleStatus={toggleWorkspaceStatus}
              />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </TooltipProvider>
  )
}

function TasksPanel({
  filter,
  statuses,
  tasks,
  onCreate,
  onFilterChange,
  onTaskClick,
}: {
  filter: string
  statuses: Record<number, TaskStatus>
  tasks: { id: number; title: string }[]
  onCreate: () => void
  onFilterChange: (value: string) => void
  onTaskClick: (id: number) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-3 pb-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="text-xs text-muted-foreground">Mocked agent queue</p>
        </div>
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger className="h-7 w-24 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="in-progress">Active</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/70"
            onClick={() => onTaskClick(task.id)}
          >
            <span className="text-sm font-medium">{task.title}</span>
            <Badge
              variant={
                statuses[task.id] === "in-progress"
                  ? "success"
                  : statuses[task.id] === "done"
                    ? "muted"
                    : "outline"
              }
              className={cn(
                "min-w-20 justify-center",
                statuses[task.id] === "ready" && "bg-background"
              )}
            >
              {taskLabel(statuses[task.id])}
            </Badge>
          </button>
        ))}
      </div>

      <div className="mt-auto pt-3">
        <Button variant="outline" className="w-full justify-start bg-background" onClick={onCreate}>
          <Plus />
          Create task
        </Button>
      </div>
    </div>
  )
}

function FilesPanel({
  directories,
  error,
  workspace,
  onOpenFile,
  onOpenWorkspace,
  onToggleDirectory,
}: {
  directories: Record<string, DirectoryState>
  error: string
  workspace: WorkspaceInfo | null
  onOpenFile: (entry: FileEntry) => void
  onOpenWorkspace: () => void
  onToggleDirectory: (path: string) => void
}) {
  const root = directories[""]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Files</h2>
          {workspace ? (
            <p className="truncate text-xs text-muted-foreground">{workspace.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Local workspace</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onOpenWorkspace} aria-label="Open folder">
          <FolderOpen />
        </Button>
      </div>

      {error ? (
        <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {!workspace ? (
          <div className="rounded-lg border bg-background p-3">
            <div className="mb-3">
              <div className="text-sm font-medium">No folder open</div>
              <p className="text-xs text-muted-foreground">
                Choose a folder to browse files.
              </p>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={onOpenWorkspace}>
              <FolderOpen />
              Open folder
            </Button>
          </div>
        ) : root?.loading ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Loading...</div>
        ) : root?.error ? (
          <div className="px-2 py-2 text-sm text-amber-700">{root.error}</div>
        ) : (
          <FileEntries
            directories={directories}
            entries={root?.entries ?? []}
            level={0}
            onOpenFile={onOpenFile}
            onToggleDirectory={onToggleDirectory}
          />
        )}
      </ScrollArea>
    </div>
  )
}

function FileEntries({
  directories,
  entries,
  level,
  onOpenFile,
  onToggleDirectory,
}: {
  directories: Record<string, DirectoryState>
  entries: FileEntry[]
  level: number
  onOpenFile: (entry: FileEntry) => void
  onToggleDirectory: (path: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((entry) => {
        const directory = directories[entry.path]
        const open = Boolean(directory?.open)

        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() =>
                entry.isDir ? onToggleDirectory(entry.path) : onOpenFile(entry)
              }
              className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-background"
              style={{ paddingLeft: 8 + level * 16 }}
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
              <span className="truncate">{entry.name}</span>
            </button>

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
                  directories={directories}
                  entries={directory?.entries ?? []}
                  level={level + 1}
                  onOpenFile={onOpenFile}
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

function DocsPanel({ onClick }: { onClick: (value: string) => void }) {
  return (
    <div className="space-y-3 px-3 pb-3">
      <div>
        <h2 className="text-sm font-semibold">Docs</h2>
        <p className="text-xs text-muted-foreground">Mocked references</p>
      </div>
      <div className="space-y-2">
        {["Agent notes", "Skill library", "Workspace brief"].map((item) => (
          <Button
            key={item}
            variant="outline"
            className="w-full justify-start bg-background"
            onClick={() => onClick(item)}
          >
            <Bot />
            {item}
          </Button>
        ))}
      </div>
    </div>
  )
}

function ChangesPanel({
  commitMessage,
  onCommitMessageChange,
  onMore,
  onSync,
}: {
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onMore: () => void
  onSync: () => void
}) {
  return (
    <div className="p-3">
      <div className="mb-3 grid grid-cols-[1fr_auto] items-start">
        <div>
          <div className="text-sm font-semibold">Changes</div>
          <p className="text-xs text-muted-foreground">Mocked git controls</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onMore} aria-label="Changes menu">
          <MoreVertical />
        </Button>
      </div>
      <div className="space-y-3">
        <div className="relative">
          <Input
            value={commitMessage}
            onChange={(event) => onCommitMessageChange(event.target.value)}
            placeholder="Message (Commit on Develop)"
            className="bg-background pr-9"
          />
          <Sparkles className="absolute top-2 right-2 size-4 text-muted-foreground" />
        </div>
        <Button variant="outline" className="w-full bg-background" onClick={onSync}>
          <GitBranch />
          Sync Changes
        </Button>
      </div>
    </div>
  )
}

function EditorPanel({
  activePath,
  extensions,
  saving,
  tab,
  tabs,
  onChange,
  onCloseTab,
  onSave,
  onSelectTab,
}: {
  activePath: string
  extensions: Extension[]
  saving: boolean
  tab?: EditorTab
  tabs: EditorTab[]
  onChange: (value: string) => void
  onCloseTab: (path: string) => void
  onSave: () => void
  onSelectTab: (path: string) => void
}) {
  return (
    <div className="grid min-h-0 grid-rows-[42px_1fr]">
      <div className="flex min-w-0 items-center justify-between border-b bg-muted/35">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          {tabs.length ? (
            tabs.map((item) => {
              const dirty = item.contents !== item.savedContents

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
                    <FileText className="size-3.5 shrink-0" />
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

      <div className="min-h-0 bg-background">
        {tab ? (
          <div className="grid h-full min-h-0 grid-rows-[1fr_auto]">
            <CodeMirror
              value={tab.contents}
              height="100%"
              extensions={extensions}
              basicSetup={{ foldGutter: true, highlightActiveLine: true }}
              onChange={onChange}
            />
            {tab.error ? (
              <div className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                {tab.error}
              </div>
            ) : null}
          </div>
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
                Use the Files tab to browse a workspace and edit local text files.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BottomPanel({
  activeTab,
  activity,
  onTabChange,
}: {
  activeTab: string
  activity: string
  onTabChange: (value: string) => void
}) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="min-h-0 border-b bg-muted/35">
      <div className="flex h-10 items-center border-b px-3">
        <TabsList>
          <TabsTrigger value="terminal">
            <PanelBottom />
          Terminal
          </TabsTrigger>
          <TabsTrigger value="problems">Problems</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="terminal" className="bg-background p-4 font-mono text-xs text-muted-foreground">
        <span className="text-foreground">$</span> {activity}
      </TabsContent>
      <TabsContent value="problems" className="bg-background p-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CircleCheck className="size-4 text-emerald-600" />
          No problems
        </div>
      </TabsContent>
    </Tabs>
  )
}

function ActionBar({
  selectedSkill,
  onAction,
  onSkillChange,
}: {
  selectedSkill: string
  onAction: (value: string) => void
  onSkillChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2 bg-muted/35 px-3">
      {["Mark complete", "Audit code", "Feature suggestions"].map((action) => (
        <Button key={action} variant="ghost" size="sm" onClick={() => onAction(action)}>
          {action}
        </Button>
      ))}
      <div className="ml-auto">
        <Select value={selectedSkill} onValueChange={onSkillChange}>
          <SelectTrigger className="h-7 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Skills</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function WorkspacesPanel({
  statuses,
  onCreate,
  onToggleStatus,
}: {
  statuses: { name: string; status: string }[]
  onCreate: () => void
  onToggleStatus: (index: number) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Workspaces</h2>
          <p className="text-xs text-muted-foreground">Mocked run states</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} aria-label="Create workspace">
          <Plus />
        </Button>
      </div>

      <div className="space-y-2">
        {statuses.map((workspace, index) => (
          <button
            key={workspace.name}
            type="button"
            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/70"
            onClick={() => onToggleStatus(index)}
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
              {workspace.status === "Running" ? (
                <CircleCheck className="size-4 text-emerald-600" />
              ) : (
                <Clock3 className="size-4 text-amber-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{workspace.name}</div>
              <div className="text-xs text-muted-foreground">Local mock worker</div>
            </div>
            <Badge variant={workspace.status === "Running" ? "success" : "warning"}>
              {workspace.status}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  )
}

function taskLabel(status: TaskStatus) {
  if (status === "in-progress") return "In progress"
  if (status === "done") return "Done"
  return "Start"
}

function languageForPath(path: string): Extension[] {
  const extension = path.split(".").pop()?.toLowerCase()

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

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default App
