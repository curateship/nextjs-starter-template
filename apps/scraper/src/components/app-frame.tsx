import type { ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import { StickyHeader } from "@/components/sticky-header"
import { ScraperSidebar } from "@/components/scraper-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isGoogleMapsOverviewRoute = pathname === "/google-maps"

  return (
    <div
      className="scraper-shell bg-background"
      data-shell-theme="graphite"
      data-shell-font="operator"
    >
      <SidebarProvider className="min-h-screen">
        <ScraperSidebar />
        <SidebarInset>
          <StickyHeader />
          <div
            className={
              isGoogleMapsOverviewRoute
                ? "flex w-full flex-1 flex-col"
                : "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6"
            }
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
