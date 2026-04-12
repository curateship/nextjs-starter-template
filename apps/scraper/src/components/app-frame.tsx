import type { ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import {
  SidebarInset,
  SidebarProvider,
  StickyHeader,
} from "@repo/admin-shell"
import type { ShellConfig } from "@repo/admin-shell"
import { ScraperSidebar } from "@/components/scraper-sidebar"
import { config } from "@/lib/config"

const shellConfig: ShellConfig = {
  appName: config.appName,
  workspaceName: config.appName,
  workspacePlan: "Internal",
  themePreset: "graphite",
  fontPreset: "operator",
  sections: [
    {
      id: "core",
      title: "Google Maps",
      entries: [
        {
          type: "item",
          id: "overview",
          label: "Overview",
          href: "/",
          icon: "layoutDashboard",
          visible: true,
        },
        {
          type: "item",
          id: "runs",
          label: "Runs",
          href: "/runs",
          icon: "workflow",
          visible: true,
          children: [
            {
              id: "runs-all",
              label: "All runs",
              href: "/runs",
            },
            {
              id: "runs-new",
              label: "New run",
              href: "/runs/new",
            },
          ],
        },
        {
          type: "item",
          id: "schedules",
          label: "Schedules",
          href: "/schedules",
          icon: "calendar",
          visible: true,
        },
      ],
    },
  ],
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <div
      className="scraper-shell bg-background"
      data-shell-theme={shellConfig.themePreset}
      data-shell-font={shellConfig.fontPreset}
    >
      <SidebarProvider className="min-h-screen">
        <ScraperSidebar pathname={pathname} />
        <SidebarInset>
          <StickyHeader />
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
