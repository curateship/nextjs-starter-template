"use client"

import { SidebarSection } from "@/components/sidebar-section"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { appPages, type AppPage } from "@/lib/app-pages"
import { renderShellIcon, type ShellConfig } from "@/lib/custom-shell"

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  config: ShellConfig
  currentPage: AppPage
}

export function AppSidebar({ config, currentPage, ...props }: AppSidebarProps) {
  const teams = [
    {
      name: config.workspaceName,
      logo: renderShellIcon("briefcaseBusiness"),
      plan: config.workspacePlan,
    },
    {
      name: "Hub baseline",
      logo: renderShellIcon("globe"),
      plan: "Reference",
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workbench</SidebarGroupLabel>
          <SidebarMenu>
            {appPages.map((page) => (
              <SidebarMenuItem key={page.id}>
                <SidebarMenuButton
                  asChild
                  tooltip={page.label}
                  isActive={currentPage === page.id}
                >
                  <a href={page.href}>
                    {renderShellIcon(page.icon)}
                    <span>{page.label}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        {config.sections.map((section) => (
          <SidebarSection key={section.id} section={section} />
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
