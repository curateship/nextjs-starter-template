import * as React from "react"

import { DashboardContent } from "@/components/demo/dashboard-content"
import { DataTable4 } from "@/components/demo/data-table4"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  createDefaultShellConfig,
  isShellItem,
  renderShellIcon,
} from "@/lib/custom-shell"

import { Button } from "@/components/ui/button"

function getCurrentHashPath() {
  if (typeof window === "undefined") {
    return "/admin/dashboard"
  }

  const hash = window.location.hash
  return hash.startsWith("#") ? hash.slice(1) || "/admin/dashboard" : hash || "/admin/dashboard"
}

export function App() {
  const [config, setConfig] = React.useState(() => createDefaultShellConfig())
  const [currentPath, setCurrentPath] = React.useState(getCurrentHashPath)
  const overviewCards = [
    ["Revenue", "Monthly gross volume", "$48,240"],
    ["Orders", "Processed this week", "1,284"],
    ["Conversion", "Checkout completion rate", "4.82%"],
    ["Refunds", "Open review queue", "18"],
  ] as const

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(getCurrentHashPath())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const navLinks = config.sections.flatMap((section) =>
    section.entries
      .filter(isShellItem)
      .map((entry) => ({
        label: entry.label,
        href: `#${entry.href}`,
        icon: renderShellIcon(entry.icon, "h-3.5 w-3.5"),
        active: currentPath === entry.href,
      }))
  )

  const isDashboardRoute = currentPath === "/admin/dashboard"
  const isImagesRoute = currentPath === "/admin/media/images"
  const isFoldersRoute = currentPath === "/admin/media/folders"

  return (
    <div
      className="min-h-screen bg-background"
      data-shell-theme={config.themePreset}
      data-shell-font={config.fontPreset}
    >
      <SidebarProvider className="h-screen">
        <AppSidebar config={config} />
        <SidebarInset>
          <StickyHeader
            navLinks={navLinks}
            rightActions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfig(createDefaultShellConfig())}
              >
                Reset shell
              </Button>
            }
          />
          <DashboardContent>
            {isDashboardRoute ? (
              <>
                <section className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4">
                  {overviewCards.map(([title, description, value]) => (
                    <Card key={title}>
                      <CardHeader>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-semibold tracking-tight">
                          {value}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </section>
                <DataTable4 />
              </>
            ) : null}

            {isImagesRoute ? (
              <Card>
                <CardHeader>
                  <CardTitle>Images</CardTitle>
                  <CardDescription>
                    Test page for the Media Library child navigation state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Current route: {currentPath}</p>
                  <p>The Images child item should stay highlighted without the parent item staying selected.</p>
                </CardContent>
              </Card>
            ) : null}

            {isFoldersRoute ? (
              <Card>
                <CardHeader>
                  <CardTitle>Folders</CardTitle>
                  <CardDescription>
                    Secondary child route for testing sibling navigation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Current route: {currentPath}
                </CardContent>
              </Card>
            ) : null}

            {!isDashboardRoute && !isImagesRoute && !isFoldersRoute ? (
              <Card>
                <CardHeader>
                  <CardTitle>Shell Route</CardTitle>
                  <CardDescription>
                    Placeholder content for sidebar route testing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Current route: {currentPath}
                </CardContent>
              </Card>
            ) : null}
          </DashboardContent>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

export default App
