import { Eye, EyeOff, FolderOpen, MoreVertical, Play, Plus, Square, Trash2 } from "lucide-react"
import { useState } from "react"

import { serverPortForWorkspace } from "@/app/server"
import type { WorkspaceInfo, WorkspaceStatus } from "@/app/types"
import { Button } from "@/components/ui/button"
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
