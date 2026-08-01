"use client"

import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
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
  workspacePlan,
  favicon,
}: {
  workspaces: WorkspaceItem[]
  workspaceName: string
  workspacePlan: string
  favicon: string
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const activeWorkspace =
    workspaces.find((workspace) => workspace.active) ?? workspaces[0]
  const activeWorkspaceName = workspaceName.trim() || activeWorkspace?.name || ""
  const activeWorkspacePlan = workspacePlan.trim() || "Project"
  const activeFavicon = favicon.trim() || activeWorkspace?.favicon || ""
  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [busyWorkspaceId, setBusyWorkspaceId] = React.useState<string | null>(
    null
  )
  const [creating, setCreating] = React.useState(false)

  if (!activeWorkspace) {
    return null
  }

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === activeWorkspace.id) return

    dismissErrorToast()
    setBusyWorkspaceId(workspaceId)
    try {
      await switchWorkspace(workspaceId)
      await router.invalidate()
    } catch (error) {
      showErrorToast(getWorkspaceErrorMessage(error))
    } finally {
      setBusyWorkspaceId(null)
    }
  }

  const handleCreate = async () => {
    const workspaceName = name.trim()
    if (!workspaceName) {
      showErrorToast("Workspace name is required")
      return
    }

    dismissErrorToast()
    setCreating(true)
    try {
      await createWorkspace(workspaceName)
      await router.invalidate()
      toast.success("Workspace created.")
      setCreateOpen(false)
      setName("")
    } catch (error) {
      showErrorToast(getWorkspaceErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex min-h-8 items-center gap-2 py-2">
            <Link
              to="/"
              className="flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center"
            >
              <WorkspaceLogo
                favicon={activeFavicon}
                icon={activeWorkspace.icon}
                name={activeWorkspaceName}
              />
            </Link>
            <div className="flex min-w-0 flex-1 items-center overflow-visible whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
              <Link
                to="/"
                className="grid min-w-0 flex-1 text-left text-sm leading-tight"
              >
                <span className="truncate font-medium">
                  {activeWorkspaceName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeWorkspacePlan}
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
                    const displayPlan = workspace.active
                      ? activeWorkspacePlan
                      : "Project"
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
                        <div className="flex h-6 min-w-6 shrink-0 items-center justify-center border-border">
                          <WorkspaceLogo
                            favicon={workspaceFavicon}
                            icon={workspace.icon}
                            name={displayName}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {displayPlan}
                          </div>
                        </div>
                        {busy ? (
                          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                        ) : workspace.active ? (
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
                      dismissErrorToast()
                      setName("")
                      setCreateOpen(true)
                    }}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                      <PlusIcon className="size-4" />
                    </div>
                    <div className="font-medium text-muted-foreground">
                      New workspace
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!next && creating) return
          setCreateOpen(next)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              Create a private project workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreate()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Workspace</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="workspace-name">Name</Label>
                    <Input
                      id="workspace-name"
                      value={name}
                      disabled={creating}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter variant="plain">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create workspace
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
        className="h-full w-auto object-contain"
      />
    )
  }

  return renderShellIcon(icon)
}
