"use client"

import * as React from "react"

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

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  config: ShellConfig
}

function getCurrentHashPath() {
  if (typeof window === "undefined") {
    return "/"
  }

  const hash = window.location.hash
  return hash.startsWith("#") ? hash.slice(1) || "/" : hash || "/"
}

function isActivePath(href: string, currentPath: string) {
  return (
    href === currentPath ||
    (href !== "/" && currentPath.startsWith(`${href}/`))
  )
}

function mapSectionEntries(
  section: ShellSection,
  currentPath: string
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
        isActivePath(entry.href, currentPath) ||
        Boolean(
          entry.children?.some((child) => isActivePath(child.href, currentPath))
        ),
      children: entry.children?.map((child) => ({
        id: child.id,
        label: child.label,
        href: child.href,
        icon: child.icon ? renderShellIcon(child.icon) : undefined,
        active: isActivePath(child.href, currentPath),
      })),
    })
  })

  return entries
}

export function AppSidebar({ config, ...props }: AppSidebarProps) {
  const [currentPath, setCurrentPath] = React.useState(getCurrentHashPath)

  const handleNavigate = React.useCallback((href: string) => {
    window.location.hash = href
    setCurrentPath(href)
  }, [])

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(getCurrentHashPath())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const teams = [
    {
      name: config.workspaceName,
      logo: renderShellIcon("briefcaseBusiness"),
      plan: config.workspacePlan,
      href: "#/",
    },
    {
      name: "Hub baseline",
      logo: renderShellIcon("globe"),
      plan: "Reference",
      href: "#/",
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <WorkspaceSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        {config.sections.map((section) => (
          <SidebarCollapsible
            key={section.id}
            title={section.title}
            entries={mapSectionEntries(section, currentPath)}
            onNavigate={handleNavigate}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserDropdown
          user={{
            name: "Tyler",
            email: "tyler@internal.dev",
            avatar: "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
