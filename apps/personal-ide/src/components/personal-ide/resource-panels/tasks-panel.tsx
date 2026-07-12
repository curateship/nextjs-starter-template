import { Play } from "lucide-react"
import { useState } from "react"

import { DONE_TASK_STATUS, TASKS_PATH } from "@/app/constants"
import { joinRelativePath, parentPath } from "@/app/path"
import {
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
import { ResourceTree } from "./resource-tree"
import type { FileCreateRequest, FileMenuState } from "./types"

export function TasksPanel({
  error,
  filter,
  filterOptions,
  folders,
  tasks,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onFilterChange,
  onMove,
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
  folders: string[]
  tasks: TaskItem[]
  onCreate: (value: string, folder?: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onFilterChange: (value: TaskStatus) => void
  onMove: (sourcePath: string, targetDir: string) => void
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

  function cancelRename() {
    setRenamePath("")
    setRenameValue("")
  }

  function createInRequest(value: string) {
    if (!createRequest) return

    if (createRequest.kind === "file") {
      onCreate(
        resourceNameFromPath(value),
        createRequest.basePath === TASKS_PATH ? undefined : createRequest.basePath
      )
    } else {
      onCreateFolder(joinRelativePath(createRequest.basePath, value))
    }
    setCreateRequest(null)
  }

  function renderTask(task: TaskItem) {
    const entry = taskFileEntry(task)
    const renaming = renamePath === entry.path

    return (
      <div
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
              onCancel={cancelRename}
              onChange={setRenameValue}
              onSubmit={(value) => {
                cancelRename()
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
        {tasks.length || folders.length || createRequest ? (
          <ResourceTree
            createRequest={createRequest}
            folders={folders}
            items={tasks}
            itemKey={(task) => task.path}
            itemParent={(task) => parentPath(task.path)}
            itemPath={(task) => task.path}
            renamePath={renamePath}
            renameValue={renameValue}
            renderCreate={() =>
              createRequest ? (
                <InlineCreate
                  key={createRequest.nonce}
                  buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
                  placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
                  onCancel={() => setCreateRequest(null)}
                  onCreate={createInRequest}
                />
              ) : null
            }
            renderItem={renderTask}
            rootPath={TASKS_PATH}
            onFolderContextMenu={(entry, event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenu({ x: event.clientX, y: event.clientY, entry, basePath: entry.path })
            }}
            onMove={onMove}
            onRenameCancel={cancelRename}
            onRenameChange={setRenameValue}
            onRenameSubmit={(entry, value) => {
              cancelRename()
              onRename(entry, value)
            }}
          />
        ) : (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            No tasks yet.
          </div>
        )}
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
