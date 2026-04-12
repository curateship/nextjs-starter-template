import type { ReactNode } from "react"
import { CalendarIcon, LayoutDashboardIcon, WorkflowIcon } from "lucide-react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { StickyHeader } from "@/components/sticky-header"
import { ScraperSidebar } from "@/components/scraper-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppFrame({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isGoogleMapsRoute =
    pathname === "/google-maps" || pathname.startsWith("/google-maps/")
  const navLinks = [
    {
      label: "Overview",
      href: "/google-maps",
      active: pathname === "/google-maps",
      icon: <LayoutDashboardIcon className="size-4" />,
      onClick: () => {
        void navigate({ to: "/google-maps" })
      },
    },
    {
      label: "Run",
      href: "/google-maps/runs",
      active:
        pathname === "/google-maps/runs" ||
        pathname === "/google-maps/runs/new" ||
        pathname.startsWith("/google-maps/runs/"),
      icon: <WorkflowIcon className="size-4" />,
      onClick: () => {
        void navigate({ to: "/google-maps/runs" })
      },
    },
    {
      label: "Schedules",
      href: "/google-maps/schedules",
      active: pathname === "/google-maps/schedules",
      icon: <CalendarIcon className="size-4" />,
      onClick: () => {
        void navigate({ to: "/google-maps/schedules" })
      },
    },
  ]

  return (
    <div
      className="scraper-shell bg-background"
      data-shell-theme="graphite"
      data-shell-font="operator"
    >
      <SidebarProvider className="min-h-screen">
        <ScraperSidebar />
        <SidebarInset>
          <StickyHeader
            navLinks={isGoogleMapsRoute ? navLinks : undefined}
          />
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
