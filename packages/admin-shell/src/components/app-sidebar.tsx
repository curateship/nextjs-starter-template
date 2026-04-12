"use client"

import { NavUser } from "./nav-user"
import { ShellSidebarGroup, type SidebarGroupEntry } from "./sidebar-group"
import { TeamSwitcher } from "./team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "./ui/sidebar"
import {
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellSection,
} from "../lib/custom-shell"

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
      active: currentPath === entry.href,
      children: entry.children?.map((child) => ({
        id: child.id,
        label: child.label,
        href: child.href,
        active: currentPath === child.href,
      })),
    })
  })

  return entries
}

export function AppSidebar({ config, ...props }: AppSidebarProps) {
  const currentPath = getCurrentHashPath()
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
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        {config.sections.map((section) => (
          <ShellSidebarGroup
            key={section.id}
            title={section.title}
            entries={mapSectionEntries(section, currentPath)}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
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
