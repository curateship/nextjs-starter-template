"use client"

import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  createWorkspace,
  getWorkspaceErrorMessage,
  switchWorkspace,
  type WorkspaceItem,
} from "@/lib/api/workspaces"
import { renderShellIcon } from "@/lib/custom-shell"

export function WorkspaceSwitcher({
  workspaces,
  workspaceName,
  favicon,
}: {
  workspaces: WorkspaceItem[]
  workspaceName: string
  favicon: string
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const activeWorkspace =
    workspaces.find((workspace) => workspace.active) ?? workspaces[0]
  const activeWorkspaceName = workspaceName.trim() || activeWorkspace?.name || ""
  const activeFavicon = favicon.trim() || activeWorkspace?.favicon || ""
  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [busyWorkspaceId, setBusyWorkspaceId] = React.useState<string | null>(
    null
  )
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!activeWorkspace) {
    return null
  }

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === activeWorkspace.id) return

    setError(null)
    setBusyWorkspaceId(workspaceId)
    try {
      await switchWorkspace(workspaceId)
      await router.invalidate()
    } catch (error) {
      const message = getWorkspaceErrorMessage(error)
      setError(message)
      window.alert(message)
    } finally {
      setBusyWorkspaceId(null)
    }
  }

  const handleCreate = async () => {
    const workspaceName = name.trim()
    if (!workspaceName) {
      setError("Workspace name is required")
      return
    }

    setError(null)
    setCreating(true)
    try {
      await createWorkspace(workspaceName)
      await router.invalidate()
      setCreateOpen(false)
      setName("")
    } catch (error) {
      setError(getWorkspaceErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="relative flex min-h-8 items-center py-2">
            <Link
              to="/"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg"
            >
              <WorkspaceLogo
                favicon={activeFavicon}
                icon={activeWorkspace.icon}
                name={activeWorkspaceName}
              />
            </Link>
            <div className="absolute right-0 left-10 flex min-w-0 items-center overflow-visible whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
              <Link
                to="/"
                className="grid min-w-0 flex-1 text-left text-sm leading-tight"
              >
                <span className="truncate font-medium">
                  {activeWorkspaceName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Project
                </span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md border-0 p-2 outline-none transition-colors hover:bg-muted focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:bg-muted"
                  >
                    <ChevronsUpDownIcon className="h-4 w-4" />
                    <span className="sr-only">Change workspace</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-72 rounded-lg"
                  align="start"
                  side={isMobile ? "bottom" : "right"}
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Workspaces
                  </DropdownMenuLabel>
                  {workspaces.map((workspace) => {
                    const displayName = workspace.active
                      ? activeWorkspaceName
                      : workspace.name
                    const workspaceFavicon = workspace.active
                      ? activeFavicon
                      : workspace.favicon
                    const busy = busyWorkspaceId === workspace.id

                    return (
                      <DropdownMenuItem
                        key={workspace.id}
                        disabled={Boolean(busyWorkspaceId)}
                        onSelect={() => void handleSwitch(workspace.id)}
                        className="gap-2 p-2"
                      >
                        <div className="flex size-6 items-center justify-center overflow-hidden rounded-md border border-border">
                          {busy ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <WorkspaceLogo
                              favicon={workspaceFavicon}
                              icon={workspace.icon}
                              name={displayName}
                            />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            Project
                          </div>
                        </div>
                        {workspace.active && !busy ? (
                          <CheckIcon className="size-4 text-muted-foreground" />
                        ) : null}
                      </DropdownMenuItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="gap-2 p-2">
                    <Link to="/workspaces">
                      <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                        {renderShellIcon("settings")}
                      </div>
                      <div className="font-medium text-muted-foreground">
                        Manage workspaces
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={Boolean(busyWorkspaceId)}
                    onSelect={() => {
                      setError(null)
                      setName("")
                      setCreateOpen(true)
                    }}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                      <PlusIcon className="size-4" />
                    </div>
                    <div className="font-medium text-muted-foreground">
                      Add workspace
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              Create a private project workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreate()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                value={name}
                disabled={creating}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter variant="plain" className="p-0">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function WorkspaceLogo({
  favicon,
  icon,
  name,
}: {
  favicon: string
  icon: WorkspaceItem["icon"]
  name: string
}) {
  if (favicon) {
    return (
      <img
        src={favicon}
        alt={`${name || "Workspace"} favicon`}
        className="h-full w-full object-cover"
      />
    )
  }

  return renderShellIcon(icon)
}
