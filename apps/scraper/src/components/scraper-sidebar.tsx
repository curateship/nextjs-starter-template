import * as React from "react"
import { useLocation } from "@tanstack/react-router"
import { useNavigate } from "@tanstack/react-router"
import {
  SidebarCollapsible,
  type SidebarGroupEntry,
} from "@/components/sidebar-group-collapsible"
import { UserDropdown } from "@/components/user-dropdown"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
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

type ScraperSidebarProps = React.ComponentProps<typeof Sidebar> & {
  config: ShellConfig
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

export function ScraperSidebar({ config, ...props }: ScraperSidebarProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <WorkspaceSwitcher
          name={config.workspaceName}
          logo={renderShellIcon("workflow")}
          plan={config.workspacePlan}
        />
      </SidebarHeader>
      <SidebarContent>
        {config.sections.map((section) => (
          <SidebarCollapsible
            key={section.id}
            title={section.title}
            onNavigate={(href) => {
              void navigate({ to: href })
            }}
            entries={mapSectionEntries(section, pathname)}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserDropdown
          user={{
            name: "Admin",
            email: "local@scraper",
            avatar: "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
