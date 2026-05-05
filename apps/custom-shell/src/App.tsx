import * as React from "react"

import { Dashboard2Content } from "@/components/dashboard2"
import { DashboardContent } from "@/components/demo/dashboard-content"
import { Navbar09Demo } from "@/components/demo/navbar-09"
import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
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

const SHELL_CONFIG_STORAGE_KEY = "custom-shell:config:v1"

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

  if (
    currentPath === "/admin/settings" ||
    currentPath.startsWith("/admin/settings/")
  ) {
    return []
  }

  if (dashboardPaths.includes(currentPath)) {
    return [
      {
        label: "Dashboard 1",
        href: "#/",
        icon: renderShellIcon("panelsTopLeft", "h-3.5 w-3.5"),
        active: true,
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

function getInitialShellConfig() {
  const fallback = createDefaultShellConfig()

  if (typeof window === "undefined") {
    return fallback
  }

  try {
    const storedConfig = window.localStorage.getItem(SHELL_CONFIG_STORAGE_KEY)
    if (!storedConfig) {
      return fallback
    }

    const parsedConfig = JSON.parse(storedConfig) as ShellConfig
    if (!parsedConfig || !Array.isArray(parsedConfig.sections)) {
      return fallback
    }

    return parsedConfig
  } catch (error) {
    console.error("Failed to load custom shell config:", error)
    return fallback
  }
}

export function App() {
  const [config, setConfig] = React.useState(getInitialShellConfig)
  const [currentPath, setCurrentPath] = React.useState(getCurrentHashPath)

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        SHELL_CONFIG_STORAGE_KEY,
        JSON.stringify(config)
      )
    } catch (error) {
      console.error("Failed to save custom shell config:", error)
    }
  }, [config])

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(getCurrentHashPath())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const navLinks = getStickyHeaderNavLinks(config, currentPath)

  const isDashboardRoute = currentPath === "/" || currentPath === "/overview-2"
  const isPostsRoute = currentPath === "/admin/posts"
  const isMediaRoute = currentPath === "/admin/media"
  const isImagesRoute = currentPath === "/admin/media/images"
  const isFoldersRoute = currentPath === "/admin/media/folders"
  const isSettingsRoute =
    currentPath === "/admin/settings" ||
    currentPath.startsWith("/admin/settings/")
  const isNavbar09DemoRoute = currentPath === "/demo/navbar-09"

  if (isNavbar09DemoRoute) {
    return (
      <div
        className="min-h-screen bg-background"
        data-shell-theme={config.themePreset}
        data-shell-font={config.fontPreset}
      >
        <Navbar09Demo />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-background"
      data-shell-theme={config.themePreset}
      data-shell-font={config.fontPreset}
    >
      <SidebarProvider className="h-screen">
        <AppSidebar config={config} />
        <SidebarInset>
          <StickyHeader navLinks={navLinks} />
          {isDashboardRoute ? (
            <Dashboard2Content />
          ) : (
            <DashboardContent>
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

              {isSettingsRoute ? (
                <SettingsPage
                  activeTab={getSettingsTabFromPath(currentPath)}
                  config={config}
                  onConfigChange={setConfig}
                />
              ) : null}

              {!isPostsRoute &&
              !isMediaRoute &&
              !isImagesRoute &&
              !isFoldersRoute &&
              !isSettingsRoute ? (
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
          )}
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

export default App
