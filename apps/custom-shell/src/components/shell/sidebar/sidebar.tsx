"use client"

import * as React from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { ListIcon } from "lucide-react"

import { UserDropdown } from "@/components/shell/sidebar/user-dropdown"
import {
  SidebarCollapsible,
  type SidebarGroupEntry,
} from "@/components/shell/sidebar/sidebar-group-collapsible"
import { WorkspaceSwitcher } from "@/components/shell/sidebar/workspace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  canSeeShellEntry,
  isActiveShellHref,
  isShellEntryNamed,
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellSection,
} from "@/lib/custom-shell"
import { whoMayHaveWorkspaces } from "@/lib/app-options"
import { useBlankSpaceDoubleClick } from "@/lib/layout/panel-collapse"
import type { AuthUser } from "@/lib/api/auth/auth"
import type { PlanSummary } from "@/lib/api/billing/billing"
import type {
  WorkspaceCopyChoice,
  WorkspaceItem,
} from "@/lib/api/people/workspaces"

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  config: ShellConfig
  user: AuthUser
  plan: PlanSummary
  workspaces: WorkspaceItem[]
  baseDomain?: string
  copyChoices?: WorkspaceCopyChoice[]
  /** True while an admin is looking at the app as this member. */
  viewingAsMember: boolean
  onLogout: () => void
}

function getActiveHref(config: ShellConfig, currentPath: string, role: string) {
  const hrefs: string[] = []

  config.sections.forEach((section) => {
    section.entries.forEach((entry) => {
      if (!isShellItem(entry) || !entry.visible) return
      if (!canSeeShellEntry(entry, role) || !isShellEntryNamed(entry)) return
      hrefs.push(entry.href)
      entry.children
        ?.filter(
          (child) => canSeeShellEntry(child, role) && isShellEntryNamed(child)
        )
        .forEach((child) => hrefs.push(child.href))
    })
  })

  return hrefs
    .filter((href) => isActiveShellHref(href, currentPath))
    .sort((a, b) => b.length - a.length)[0]
}

function mapSectionEntries(
  section: ShellSection,
  activeHref: string | undefined,
  role: string
): SidebarGroupEntry[] {
  const entries: SidebarGroupEntry[] = []

  section.entries.forEach((entry) => {
    if (!isShellItem(entry)) {
      entries.push({
        type: "divider",
        id: entry.id,
        label: entry.label,
      })
      return
    }

    if (
      !entry.visible ||
      !canSeeShellEntry(entry, role) ||
      !isShellEntryNamed(entry)
    ) {
      return
    }

    const children = entry.children?.filter(
      (child) => canSeeShellEntry(child, role) && isShellEntryNamed(child)
    )

    entries.push({
      type: "item",
      id: entry.id,
      label: entry.label,
      href: entry.href,
      icon: renderShellIcon(entry.icon),
      active:
        entry.href === activeHref ||
        Boolean(children?.some((child) => child.href === activeHref)),
      children: children?.map((child) => ({
        id: child.id,
        label: child.label,
        href: child.href,
        icon: child.icon ? renderShellIcon(child.icon) : undefined,
        active: child.href === activeHref,
      })),
    })
  })

  return entries
}

/** A section with nothing left after the role filter is not rendered at all. */
function hasVisibleEntries(entries: SidebarGroupEntry[]) {
  return entries.some((entry) => entry.type === "item")
}

export function AppSidebar({
  config,
  user,
  plan,
  workspaces,
  baseDomain,
  copyChoices,
  viewingAsMember,
  onLogout,
  ...props
}: AppSidebarProps) {
  const navigate = useNavigate()
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  const activeHref = getActiveHref(config, currentPath, user.role)
  const { toggleSidebar } = useSidebar()
  // Double-clicking the empty part of the rail — under the links — narrows it
  // to icons, and double-clicking there again brings it back. Same gesture as
  // the editors' side and bottom panels.
  const handleDoubleClick = useBlankSpaceDoubleClick(toggleSidebar)

  const handleNavigate = React.useCallback((href: string) => {
    navigate({ href })
  }, [navigate])

  const sections = config.sections
    .map((section) => ({
      section,
      entries: mapSectionEntries(section, activeHref, user.role),
    }))
    .filter(({ entries }) => hasVisibleEntries(entries))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pb-3">
        {/* An app that is one site and always will be draws no switcher at
            all — see `workspaces.whoMayHave`. Read inside the component, never
            at module level, because an app's options file can import its way
            back to this one. */}
        {whoMayHaveWorkspaces() === "off" ? null : (
          <WorkspaceSwitcher
            workspaces={workspaces}
            baseDomain={baseDomain}
            copyChoices={copyChoices}
            favicon={config.favicon}
          />
        )}
      </SidebarHeader>
      <SidebarContent
        aria-label="Main navigation"
        onDoubleClick={handleDoubleClick}
      >
        {sections.length ? (
          sections.map(({ section, entries }) => (
            <SidebarCollapsible
              key={section.id}
              id={section.id}
              title={section.title}
              entries={entries}
              onNavigate={handleNavigate}
            />
          ))
        ) : (
          <EmptySidebar isAdmin={user.role === "admin"} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <UserDropdown
          onLogout={onLogout}
          viewingAsMember={viewingAsMember}
          isAdmin={user.role === "admin"}
          showUpgrade={!plan.isPaid}
          user={{
            name: user.name,
            email: user.email,
            avatar: user.avatarUrl,
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/**
 * Every section is hidden, emptied, or filtered away by role. The config is
 * already in hand when the shell renders, so this is never a half-loaded rail —
 * it means there is genuinely nothing to show, and a blank column just reads as
 * broken. Admins get the way to put links back; members are told whose call it
 * is. Hidden when the rail is collapsed to icons, where there is no room to
 * read it.
 */
function EmptySidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <SidebarGroup className="px-2 py-0 group-data-[collapsible=icon]:hidden">
      <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
        <ListIcon className="size-6 text-sidebar-foreground/45" />
        <p className="text-sm font-medium text-sidebar-foreground">
          No links to show
        </p>
        <p className="text-xs text-sidebar-foreground/70">
          {isAdmin
            ? "Your sidebar links are set up in Settings."
            : "An admin decides which links appear here."}
        </p>
        {isAdmin ? (
          <Link
            to="/admin/settings/$tab"
            params={{ tab: "sidebar" }}
            className="rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground underline underline-offset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:no-underline"
          >
            Sidebar settings
          </Link>
        ) : null}
      </div>
    </SidebarGroup>
  )
}
