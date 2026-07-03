import {
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  MoreVertical,
  Play,
  Plus,
  Square,
  Trash2,
} from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"

import { serverPortsForWorkspaces } from "@/app/server"
import type { WorkspaceInfo, WorkspaceStatus } from "@/app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDismissibleMenu } from "@/hooks/use-dismissible-menu"
import { cn } from "@/lib/utils"

export function WorkspacesPanel({
  activeWorkspaceId,
  busy,
  error,
  workspaces,
  onCreate,
  onCreateApp,
  onDelete,
  onMoveWorkspace,
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
  onCreateApp: (appName: string) => Promise<boolean>
  onDelete: (workspaceId: string) => void
  onMoveWorkspace: (
    workspaceId: string,
    overWorkspaceId: string,
    scopedWorkspaceIds: string[]
  ) => void
  onOpenServer: (workspace: WorkspaceInfo) => void
  onSelect: (workspaceId: string) => void
  onSetHidden: (workspaceId: string, hidden: boolean) => void
  onStartServer: (workspace: WorkspaceInfo) => void
  onStopServer: (workspace: WorkspaceInfo) => void
  serverRunning: boolean
  workspaceStatuses: Record<string, WorkspaceStatus>
}) {
  const [createAppOpen, setCreateAppOpen] = useState(false)
  const [newAppName, setNewAppName] = useState("")
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<"active" | "hidden">("active")
  useDismissibleMenu(openMenuId, setOpenMenuId)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const visibleWorkspaces = workspaces.filter((workspace) =>
    workspaceView === "hidden" ? workspace.hidden : !workspace.hidden
  )
  const visibleWorkspaceIds = visibleWorkspaces.map((workspace) => workspace.id)
  const workspacePorts = useMemo(() => serverPortsForWorkspaces(workspaces), [workspaces])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
      },
    })
  )
  const activeServerUrl = activeWorkspace && !activeWorkspace.isTauri
    ? `http://localhost:${workspacePorts[activeWorkspace.id]}/`
    : ""
  const canCreateApp = newAppName.trim().length > 0 && !busy

  function closeCreateAppForm() {
    setCreateAppOpen(false)
    setNewAppName("")
  }

  function submitNewApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const appName = newAppName.trim()
    if (!appName) return

    void onCreateApp(appName).then((created) => {
      if (!created) return
      closeCreateAppForm()
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onMoveWorkspace(String(active.id), String(over.id), visibleWorkspaceIds)
  }

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCreate}
                disabled={busy}
                aria-label="Add existing app"
              >
                <FolderOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add existing app</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCreateAppOpen((open) => !open)}
                disabled={busy}
                aria-label="Create new app"
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create new app</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {createAppOpen ? (
        <form className="mb-3 grid gap-2" onSubmit={submitNewApp}>
          <label className="sr-only" htmlFor="new-app-name">
            New app name
          </label>
          <Input
            id="new-app-name"
            value={newAppName}
            onChange={(event) => setNewAppName(event.target.value)}
            placeholder="new-app"
            autoComplete="off"
            autoFocus
            disabled={busy}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" size="sm" disabled={!canCreateApp}>
              <Plus />
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeCreateAppForm}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visibleWorkspaces.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleWorkspaceIds} strategy={verticalListSortingStrategy}>
              {visibleWorkspaces.map((workspace) => (
                <SortableWorkspaceRow
                  key={workspace.id}
                  active={activeWorkspaceId === workspace.id}
                  busy={busy}
                  menuOpen={openMenuId === workspace.id}
                  workspace={workspace}
                  workspaceStatus={workspaceStatuses[workspace.id]}
                  onDelete={onDelete}
                  onCloseMenu={() => setOpenMenuId(null)}
                  onSelect={onSelect}
                  onSetHidden={onSetHidden}
                  onToggleMenu={() =>
                    setOpenMenuId(openMenuId === workspace.id ? null : workspace.id)
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
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

function SortableWorkspaceRow({
  active,
  busy,
  menuOpen,
  workspace,
  workspaceStatus,
  onDelete,
  onCloseMenu,
  onSelect,
  onSetHidden,
  onToggleMenu,
}: {
  active: boolean
  busy: boolean
  menuOpen: boolean
  workspace: WorkspaceInfo
  workspaceStatus?: WorkspaceStatus
  onDelete: (workspaceId: string) => void
  onCloseMenu: () => void
  onSelect: (workspaceId: string) => void
  onSetHidden: (workspaceId: string, hidden: boolean) => void
  onToggleMenu: () => void
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id, disabled: busy })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-lg bg-background p-3 transition-colors",
        active && "bg-muted",
        isDragging && "shadow-md"
      )}
    >
      <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={setActivatorNodeRef}
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={`Reorder ${workspace.appName}`}
              className={cn(
                "cursor-grab text-muted-foreground active:cursor-grabbing",
                isDragging && "cursor-grabbing"
              )}
              {...attributes}
              {...listeners}
            >
              <GripVertical />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>
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
            {workspaceStatus ? (
              <span
                className={cn(
                  "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                  workspaceStatus === "running"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {workspaceStatus === "running" ? "Running" : "Waiting input"}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">{workspace.name}</div>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(event) => {
            event.stopPropagation()
            onToggleMenu()
          }}
          aria-label={`${workspace.appName} menu`}
        >
          <MoreVertical />
        </Button>
      </div>

      {menuOpen ? (
        <div
          className="absolute right-3 top-12 z-10 grid w-36 gap-1 rounded-md border bg-popover p-1 shadow-md"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => {
              onCloseMenu()
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
              onCloseMenu()
              onDelete(workspace.id)
            }}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  )
}
