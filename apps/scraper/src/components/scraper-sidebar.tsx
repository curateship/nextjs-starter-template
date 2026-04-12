import * as React from "react"
import { Link } from "@tanstack/react-router"
import { useNavigate } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarCollapsible,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  renderShellIcon,
} from "@repo/admin-shell"
import { config } from "@/lib/config"

function BrandLink() {
  return (
    <div className="relative flex min-h-8 items-center py-2">
      <Link
        to="/"
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
      >
        <span className="text-xs font-semibold">S</span>
      </Link>
      <div className="absolute inset-y-0 left-10 right-0 flex min-w-0 items-center overflow-hidden whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
        <Link to="/" className="grid min-w-0 flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{config.appName}</span>
          <span className="truncate text-xs text-muted-foreground">Admin</span>
        </Link>
      </div>
    </div>
  )
}

export function ScraperSidebar() {
  const navigate = useNavigate()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <BrandLink />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarCollapsible
          title="Scrapers"
          onNavigate={(href) => {
            void navigate({ to: href })
          }}
          entries={[
            {
              type: "item",
              id: "google-maps",
              label: "Google Maps",
              href: "/google-maps",
              icon: renderShellIcon("globe"),
              children: [
                {
                  id: "google-maps-run",
                  label: "Run",
                  href: "/google-maps/runs",
                  icon: renderShellIcon("workflow"),
                },
                {
                  id: "google-maps-schedules",
                  label: "Schedules",
                  href: "/google-maps/schedules",
                  icon: renderShellIcon("calendar"),
                },
              ],
            },
          ]}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
