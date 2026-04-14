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
  type ShellConfig,
  type ShellItem,
} from "@/lib/custom-shell"

import { Button } from "@/components/ui/button"

function getCurrentHashPath() {
  if (typeof window === "undefined") {
    return "/"
  }

  const hash = window.location.hash
  return hash.startsWith("#") ? hash.slice(1) || "/" : hash || "/"
}

function getShellItems(config: ShellConfig) {
  return config.sections.flatMap((section) =>
    section.entries.filter(isShellItem)
  )
}

function findActiveSectionItem(
  items: ShellItem[],
  currentPath: string
) {
  return items.find(
    (item) =>
      item.children?.length &&
      (item.href === currentPath ||
        item.children.some((child) => child.href === currentPath))
  )
}

function getStickyHeaderNavLinks(
  config: ShellConfig,
  currentPath: string
) {
  const dashboardPaths = ["/", "/overview-2"]

  if (dashboardPaths.includes(currentPath)) {
    return [
      {
        label: "Overview",
        href: "#/",
        icon: renderShellIcon("layoutDashboard", "h-3.5 w-3.5"),
        active: currentPath === "/",
      },
      {
        label: "Overview 2",
        href: "#/overview-2",
        icon: renderShellIcon("panelsTopLeft", "h-3.5 w-3.5"),
        active: currentPath === "/overview-2",
      },
    ]
  }

  const items = getShellItems(config)
  const activeSectionItem = findActiveSectionItem(items, currentPath)
  const activeItem = items.find((item) => item.href === currentPath)

  if (activeSectionItem) {
    return [
      {
        label: activeSectionItem.label,
        href: `#${activeSectionItem.href}`,
        icon: renderShellIcon(activeSectionItem.icon, "h-3.5 w-3.5"),
        active: currentPath === activeSectionItem.href,
      },
      ...(activeSectionItem.children ?? []).map((child) => ({
        label: child.label,
        href: `#${child.href}`,
        icon: child.icon ? renderShellIcon(child.icon, "h-3.5 w-3.5") : undefined,
        active: currentPath === child.href,
      })),
    ]
  }

  if (activeItem) {
    return [
      {
        label: activeItem.label,
        href: `#${activeItem.href}`,
        icon: renderShellIcon(activeItem.icon, "h-3.5 w-3.5"),
        active: true,
      },
    ]
  }

  return []
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

  const navLinks = getStickyHeaderNavLinks(config, currentPath)

  const isIndexRoute = currentPath === "/"
  const isOverview2Route = currentPath === "/overview-2"
  const isPostsRoute = currentPath === "/admin/posts"
  const isMediaRoute = currentPath === "/admin/media"
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
            {isIndexRoute ? (
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

            {isOverview2Route ? (
              <>
                <section className="grid gap-4 sm:gap-6 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Overview 2</CardTitle>
                      <CardDescription>
                        Secondary dashboard view for future workspace summaries.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                      <p>Current route: {currentPath}</p>
                      <p>
                        This page exists to prove the top-left header can switch
                        between multiple dashboard overviews without using the
                        sidebar for local dashboard navigation.
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Snapshot</CardTitle>
                      <CardDescription>
                        Placeholder summary card for an alternate dashboard.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tracking-tight">
                        12 active views
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </>
            ) : null}

            {isPostsRoute ? (
              <Card>
                <CardHeader>
                  <CardTitle>Posts</CardTitle>
                  <CardDescription>
                    Top-level sidebar page with its own single-item local nav.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Current route: {currentPath}
                </CardContent>
              </Card>
            ) : null}

            {isMediaRoute ? (
              <Card>
                <CardHeader>
                  <CardTitle>Media Library</CardTitle>
                  <CardDescription>
                    Parent dashboard for the Media Library section.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Current route: {currentPath}</p>
                  <p>
                    The sticky header should show the local section navigation:
                    Media Library, Images, and Folders.
                  </p>
                </CardContent>
              </Card>
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

            {!isIndexRoute &&
            !isOverview2Route &&
            !isPostsRoute &&
            !isMediaRoute &&
            !isImagesRoute &&
            !isFoldersRoute ? (
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
