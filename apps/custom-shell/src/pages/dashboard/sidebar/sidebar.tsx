"use client"

import * as React from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import { UserDropdown } from "@/pages/dashboard/sidebar/user-dropdown"
import {
  SidebarCollapsible,
  type SidebarGroupEntry,
} from "@/pages/dashboard/sidebar/sidebar-group-collapsible"
import { WorkspaceSwitcher } from "@/pages/dashboard/sidebar/workspace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellSection,
} from "@/lib/custom-shell"
import type { AuthUser } from "@/lib/api/auth"
import type { WorkspaceItem } from "@/lib/api/workspaces"

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  config: ShellConfig
  user: AuthUser
  workspaces: WorkspaceItem[]
  onLogout: () => void
}

function isActivePath(href: string, currentPath: string) {
  if (!href.trim()) return false

  return (
    href === currentPath ||
    (href !== "/" && currentPath.startsWith(`${href}/`))
  )
}

function getActiveHref(config: ShellConfig, currentPath: string) {
  const hrefs: string[] = []

  config.sections.forEach((section) => {
    section.entries.forEach((entry) => {
      if (!isShellItem(entry) || !entry.visible) return
      hrefs.push(entry.href)
      entry.children?.forEach((child) => hrefs.push(child.href))
    })
  })

  return hrefs
    .filter((href) => isActivePath(href, currentPath))
    .sort((a, b) => b.length - a.length)[0]
}

function mapSectionEntries(
  section: ShellSection,
  activeHref: string | undefined
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

    if (!entry.visible) {
      return
    }

    entries.push({
      type: "item",
      id: entry.id,
      label: entry.label,
      href: entry.href,
      icon: renderShellIcon(entry.icon),
      active:
        entry.href === activeHref ||
        Boolean(
          entry.children?.some((child) => child.href === activeHref)
        ),
      children: entry.children?.map((child) => ({
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

export function AppSidebar({
  config,
  user,
  workspaces,
  onLogout,
  ...props
}: AppSidebarProps) {
  const navigate = useNavigate()
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  const activeHref = getActiveHref(config, currentPath)

  const handleNavigate = React.useCallback((href: string) => {
    navigate({ href })
  }, [navigate])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pb-3">
        <WorkspaceSwitcher
          workspaces={workspaces}
          workspaceName={config.workspaceName}
          favicon={config.favicon}
        />
      </SidebarHeader>
      <SidebarContent>
        {config.sections.map((section) => (
          <SidebarCollapsible
            key={section.id}
            id={section.id}
            title={section.title}
            entries={mapSectionEntries(section, activeHref)}
            onNavigate={handleNavigate}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserDropdown
          onLogout={onLogout}
          user={{
            name: user.name,
            email: user.email,
            avatar: "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
