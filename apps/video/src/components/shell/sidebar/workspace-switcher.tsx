"use client"

import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react"

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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  WorkspaceCopyChoice,
  WorkspaceItem,
} from "@/lib/api/people/workspaces"
import { useSwitchWorkspace } from "@/lib/hooks/use-switch-workspace"
import { renderShellIcon } from "@/lib/custom-shell"
import {
  appUsesSiteBranding,
  capitalise,
  whoMayHaveWorkspaces,
  workspaceWord,
} from "@/lib/app-options"
import { workspaceListedAddress } from "@/lib/workspaces/addresses"
import { cn } from "@/lib/utils"

const subscribeToBrowserOrigin = () => () => {}

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
  baseDomain = "",
  copyChoices = [],
  brand,
}: {
  workspaces: WorkspaceItem[]
  /** The domain workspaces hang off, for the address field's preview. */
  baseDomain?: string
  copyChoices?: WorkspaceCopyChoice[]
  /**
   * Who this site is, for somebody with no list to choose from.
   *
   * A member owns no workspace, so `workspaces` reaches them empty and this
   * whole block used to render nothing — the top of their sidebar was blank
   * while an admin's named the site. They get the same logo and name, and no
   * chevron, because there is nothing they may switch to.
   */
  brand?: {
    name: string
    favicon: string
    logo: string
    logoDark: string
  } | null
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const activeWorkspace =
    workspaces.find((workspace) => workspace.active) ?? workspaces[0]
  // Read here rather than at the top of the module: an app's options file can
  // import its way back to this one.
  const word = workspaceWord()
  const activeWorkspaceName = activeWorkspace?.name ?? ""
  const activeFavicon = activeWorkspace?.favicon || ""
  const browserOrigin = React.useSyncExternalStore(
    subscribeToBrowserOrigin,
    () => window.location.origin,
    () => ""
  )

  // The rule for what a workspace answers on lives in one place, because the
  // workspaces table prints the same thing.
  const addressOf = (workspace: WorkspaceItem) =>
    workspaceListedAddress(workspace, baseDomain).text
  const publicUrlOf = (workspace: WorkspaceItem) => {
    const address = addressOf(workspace)
    if (!baseDomain && !workspace.customDomain) return "/"

    const currentOrigin = browserOrigin ? new URL(browserOrigin) : null
    const protocol = workspace.customDomain
      ? "https:"
      : (currentOrigin?.protocol ??
        (baseDomain === "localhost" ? "http:" : "https:"))
    const port =
      !workspace.customDomain && currentOrigin?.port
        ? `:${currentOrigin.port}`
        : ""
    return `${protocol}//${address}${port}`
  }
  const [createOpen, setCreateOpen] = React.useState(false)
  // The switch itself lives in `useSwitchWorkspace`, because the workspaces
  // dashboard does the same thing and the two must not drift apart.
  const { switchToWorkspace, busyWorkspaceId } = useSwitchWorkspace()

  // Nothing to switch between and nothing to name: draw no header at all.
  if (!activeWorkspace && !brand?.name) {
    return null
  }

  // The name and logo come from the workspace when there is one, and from the
  // site's own settings when there is not.
  const brandName = activeWorkspace ? activeWorkspaceName : brand!.name
  // A site's own picture counts only where an app builds distinct sites, which
  // is the same gate `readBranding` puts on the public pictures. Everywhere
  // else the one uploaded logo stands in, so the sidebar, the signed-out pages
  // and the browser tab are the same picture rather than three choices. Both
  // sources meet here — the config for somebody in no site, the workspaces list
  // for an admin who owns one — so the rule is written once, here.
  // Only the fallback gets a dark twin: a site's own picture has none.
  const siteBranding = appUsesSiteBranding()
  const siteFavicon = siteBranding
    ? activeWorkspace
      ? activeFavicon
      : brand!.favicon
    : ""
  const brandFavicon = siteFavicon || brand?.logo || ""
  const brandFaviconDark = siteFavicon ? "" : (brand?.logoDark ?? "")

  /**
   * Whether there is a menu at all.
   *
   * Two ways to have none. An app that is one site says so in its options, and
   * then nobody switches, admin included — the endpoints refuse it too. And a
   * member owns no workspace, so their list is empty and there is nothing to
   * put in a menu. Either way the name and logo above still draw: this block
   * is who the site is first and a switcher second.
   */
  const maySwitch = Boolean(activeWorkspace) && whoMayHaveWorkspaces() !== "off"

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false)
  }
  const handleSwitch = async (workspaceId: string) => {
    closeMobileSidebar()
    if (!activeWorkspace || workspaceId === activeWorkspace.id) return
    await switchToWorkspace(workspaceId)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex min-h-8 items-center gap-2 py-2">
            <Link
              to="/home"
              onClick={closeMobileSidebar}
              className="flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center"
            >
              <WorkspaceLogo
                favicon={brandFavicon}
                darkFavicon={brandFaviconDark}
                icon={activeWorkspace?.icon}
                name={brandName}
              />
            </Link>
            <div className="flex min-w-0 flex-1 items-center overflow-visible whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
              <Link
                to="/home"
                onClick={closeMobileSidebar}
                className="grid min-w-0 flex-1 text-left text-sm leading-tight"
              >
                <span className="truncate font-medium">{brandName}</span>
                {/* The address is what tells two sites apart, so it is drawn
                    only where there are two to tell apart: not on an app that
                    is one site, and not for a member who reaches one. */}
                {maySwitch ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {addressOf(activeWorkspace)}
                  </span>
                ) : null}
              </Link>
              {maySwitch ? (
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
                      // Gated like the header above. The rows do NOT fall
                      // back to the app logo, though: a row answers "which
                      // site", and the same logo on every row answers nothing.
                      // The site editor's chosen shape is what tells them
                      // apart.
                      const workspaceFavicon = siteBranding
                        ? workspace.active
                          ? activeFavicon
                          : workspace.favicon
                        : ""
                      const busy = busyWorkspaceId === workspace.id

                      return (
                        <div key={workspace.id} className="flex items-center">
                          <DropdownMenuItem
                            disabled={Boolean(busyWorkspaceId)}
                            onSelect={() => void handleSwitch(workspace.id)}
                            className="min-w-0 flex-1 gap-2 p-2"
                          >
                            <div className="flex h-6 min-w-6 shrink-0 items-center justify-center border-border">
                              <WorkspaceLogo
                                favicon={workspaceFavicon}
                                icon={workspace.icon}
                                name={displayName}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">
                                {displayName}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {addressOf(workspace)}
                              </div>
                            </div>
                            {busy ? (
                              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                            ) : workspace.active ? (
                              <CheckIcon className="size-4 text-muted-foreground" />
              ) : null}
                        </DropdownMenuItem>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              asChild
                              className="size-8 shrink-0 p-0"
                            >
                              <a
                                href={publicUrlOf(workspace)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${displayName} site in a new tab`}
                                onClick={closeMobileSidebar}
                              >
                                <ExternalLinkIcon className="size-4" />
                              </a>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            Open site in a new tab
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="gap-2 p-2">
                    <Link
                      to="/workspaces"
                      search={{ open: undefined }}
                      onClick={closeMobileSidebar}
                    >
                      <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                        {renderShellIcon("settings")}
                      </div>
                      <div className="font-medium text-muted-foreground">
                        Manage {word.many}
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
              ) : null}
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>

      <WorkspaceFormDialog
        baseDomain={baseDomain}
        availableWorkspaces={workspaces}
        copyChoices={copyChoices}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  )
}

function WorkspaceLogo({
  favicon,
  darkFavicon = "",
  icon,
  name,
}: {
  favicon: string
  /** The dark-sidebar twin, when this picture is the app's own logo. */
  darkFavicon?: string
  icon: WorkspaceItem["icon"]
  name: string
}) {
  if (!favicon) return renderShellIcon(icon)
  if (!darkFavicon) return <FaviconImage src={favicon} name={name} />

  // Both are drawn and CSS hides one, the same way `BrandLogo` does it on the
  // signed-out pages. Choosing in JavaScript after load would flash the wrong
  // picture on a hard reload.
  return (
    <>
      <FaviconImage src={favicon} name={name} className="dark:hidden" />
      <FaviconImage
        src={darkFavicon}
        name={name}
        className="hidden dark:block"
      />
    </>
  )
}

function FaviconImage({
  src,
  name,
  className,
}: {
  src: string
  name: string
  className?: string
}) {
  // The file behind this can be deleted from the media library without warning,
  // and the sidebar names the site on its own — so nothing is better than a
  // broken-image glyph sitting at the top of every page. `BrandLogo` does the
  // same on the signed-out pages, and for the same reason.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  if (failedSrc === src) return null

  return (
    <img
      src={src}
      alt={`${name || "Workspace"} logo`}
      // Contained rather than cropped: a square site icon looks the same either
      // way, and a logo that is wider than it is tall must not lose its ends.
      className={cn("size-full rounded-md object-contain", className)}
      onError={() => setFailedSrc(src)}
    />
  )
}
