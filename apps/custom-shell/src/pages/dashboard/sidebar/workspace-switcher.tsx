"use client"

import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react"

import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { WorkspaceFormDialog } from "@/components/shared/workspace-form-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
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
  const [busyWorkspaceId, setBusyWorkspaceId] = React.useState<string | null>(
    null
  )

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
                  {/* The shared Button already draws the app's focus ring and
                      shades itself while the menu is open (`aria-expanded`). */}
                  <Button variant="ghost" size="icon-sm">
                    <ChevronsUpDownIcon />
                    <span className="sr-only">Change workspace</span>
                  </Button>
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
                    onSelect={() => setCreateOpen(true)}
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

      <WorkspaceFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
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
