import { Play } from "lucide-react"
import { useState } from "react"

import { DONE_TASK_STATUS } from "@/app/constants"
import { joinRelativePath, parentPath } from "@/app/path"
import {
  ensureMarkdownPath,
  resourceNameFromPath,
  taskFileEntry,
  taskStatusLabel,
} from "@/app/resources"
import type { FileEntry, TaskItem, TaskStatus } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineCreate } from "@/components/personal-ide/inline-create"
import { PanelError } from "@/components/personal-ide/panel-error"
import { RenameInput } from "@/components/personal-ide/rename-input"
import { useDismissibleMenu } from "@/hooks/use-dismissible-menu"
import { ResourceContextMenu } from "./resource-context-menu"
import type { FileCreateRequest, FileMenuState } from "./types"

const TASKS_PATH = "workspace/tasks"

export function TasksPanel({
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
        setCreateRequest({ kind: "file", basePath: TASKS_PATH, nonce: Date.now() })
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="text-xs text-muted-foreground">{TASKS_PATH}</p>
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
          setMenu({ x: event.clientX, y: event.clientY, basePath: TASKS_PATH })
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
        basePath={TASKS_PATH}
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
