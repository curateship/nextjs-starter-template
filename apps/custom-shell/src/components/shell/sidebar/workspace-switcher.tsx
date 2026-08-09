"use client"

import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react"

import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
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
} from "@/lib/api/people/workspaces"
import { renderShellIcon } from "@/lib/custom-shell"
import { capitalise, workspaceWord } from "@/lib/app-options"

/**
 * The line under a site's name is **its address**, which is the one thing that
 * genuinely tells two sites apart.
 *
 * It used to be a single subheader an admin typed in Settings, so every row in
 * the list said the same words — three sites read as three copies of one. Before
 * that it was the reader's billing plan on the active row and the literal word
 * "Project" on the others, which made one list say two different kinds of thing
 * about neighbouring rows. Both are gone, along with the setting behind them.
 */
export function WorkspaceSwitcher({
  workspaces,
  favicon,
  baseDomain = "",
}: {
  workspaces: WorkspaceItem[]
  favicon: string
  /** The domain workspaces hang off, for the address field's preview. */
  baseDomain?: string
}) {
  const { isMobile } = useSidebar()
  const activeWorkspace =
    workspaces.find((workspace) => workspace.active) ?? workspaces[0]
  // Read here rather than at the top of the module: an app's options file can
  // import its way back to this one.
  const word = workspaceWord()
  const activeWorkspaceName = activeWorkspace?.name ?? ""
  const activeFavicon = favicon.trim() || activeWorkspace?.favicon || ""

  /**
   * What a site answers on. Its own domain when it has one, otherwise its name
   * in front of the deployment's base domain — the same wording the address
   * field previews while it is being typed.
   *
   * Falls back to the site's name where no base domain is configured, because
   * on an app that is one site there is no address to show and repeating the
   * name reads better than an empty line.
   */
  const addressOf = (workspace: WorkspaceItem) =>
    workspace.customDomain ||
    (baseDomain ? `${workspace.subdomain}.${baseDomain}` : workspace.name)
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

      // **The whole page reloads, rather than the router re-running loaders.**
      //
      // Sixteen screens read their loader data once, into `useState(initial…)`,
      // and a re-run hands them fresh props that `useState` ignores — so after
      // switching, the Automations list, the media library and a dozen others
      // went on showing the site you had just left until somebody pressed
      // reload. Fixing each of them would be sixteen edits, one of which would
      // be missed, and every screen written afterwards would have to remember.
      //
      // Switching site is a rare, deliberate act that changes *everything* on
      // screen, so throwing the page away is the honest answer rather than a
      // shortcut: nothing from the site you left should survive it.
      //
      // The address is kept. On a list that is exactly right; on a record's own
      // page — an automation the other site does not have — it lands on
      // not-found, which is true, and the sidebar is right there.
      window.location.reload()
      return
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
              to="/home"
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
                to="/home"
                className="grid min-w-0 flex-1 text-left text-sm leading-tight"
              >
                <span className="truncate font-medium">
                  {activeWorkspaceName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {addressOf(activeWorkspace)}
                </span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* The shared Button already draws the app's focus ring and
                      shades itself while the menu is open (`aria-expanded`). */}
                  <Button variant="ghost" size="icon-sm">
                    <ChevronsUpDownIcon />
                    <span className="sr-only">Change {word.one}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-72 rounded-lg"
                  align="start"
                  side={isMobile ? "bottom" : "right"}
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {capitalise(word.many)}
                  </DropdownMenuLabel>
                  {workspaces.map((workspace) => {
                    const displayName = workspace.name
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
                            {addressOf(workspace)}
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
                    <Link to="/workspaces" search={{ open: undefined }}>
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
                      New {word.one}
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>

      <WorkspaceFormDialog
        baseDomain={baseDomain}
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
        className="size-full rounded-md object-cover"
      />
    )
  }

  return renderShellIcon(icon)
}
