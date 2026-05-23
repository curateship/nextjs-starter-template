"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { SidebarDropdown } from "@/components/admin/layout/sidebar/SidebarDropdown"
import { SidebarUserAdmin } from "@/components/admin/layout/sidebar/SidebarUserAdmin"
import { SiteSwitcherMenu } from "@/components/admin/layout/sidebar/SiteSwitcherMenu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/admin/layout/sidebar/Sidebar"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  getAdminSidebarSiteIdFromPathname,
  getAdminSidebarIcon,
  resolveAdminSidebarSettings,
} from "@/lib/utils/admin-sidebar"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: { name: string; email: string; avatar?: string }
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const { currentSite, sites } = useSiteSwitcher()
  const routeSiteId = getAdminSidebarSiteIdFromPathname(pathname)
  const routeSite = routeSiteId
    ? currentSite?.id === routeSiteId
      ? currentSite
      : sites.find((site) => site.id === routeSiteId) ?? null
    : null
  const sidebarSite = routeSite ?? currentSite
  const config = resolveAdminSidebarSettings(sidebarSite?.settings?.admin_sidebar, {
    siteId: sidebarSite?.id ?? routeSiteId,
    pathname,
  })

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pb-3">
        <SiteSwitcherMenu />
      </SidebarHeader>
      <SidebarContent>
        {config.sections.flatMap((section) => {
          const projects = section.entries
            .filter((entry) => entry.visible)
            .map((entry) => ({
              id: entry.id,
              name: entry.label || "Untitled link",
              url: entry.href,
              icon: getAdminSidebarIcon(entry.icon),
              activePaths: entry.activePaths,
              items: entry.children
                ?.filter((child) => child.visible !== false)
                .map((child) => ({
                  id: child.id,
                  title: child.label || "Untitled child",
                  url: child.href,
                  icon: child.icon ? getAdminSidebarIcon(child.icon) : undefined,
                  activePaths: child.activePaths,
                })),
            }))

          if (!projects.length) return []

          return [
            <SidebarDropdown
              key={section.id}
              id={section.id}
              title={section.title}
              projects={projects}
            />,
          ]
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserAdmin user={{ name: user.name, email: user.email, avatar: user.avatar || '' }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
