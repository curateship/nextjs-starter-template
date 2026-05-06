import * as React from "react"
import type { ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import { useNavigate } from "@tanstack/react-router"
import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
import { StickyHeader } from "@/components/sticky-header"
import { ScraperSidebar } from "@/components/scraper-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  createDefaultShellConfig,
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellItem,
} from "@/lib/custom-shell"

const SHELL_CONFIG_STORAGE_KEY = "scraper:shell-config:v2"

function getShellItems(config: ShellConfig) {
  return config.sections.flatMap((section) =>
    section.entries.filter(isShellItem)
  )
}

function isActivePath(href: string, currentPath: string) {
  return (
    href === currentPath ||
    (href !== "/" && currentPath.startsWith(`${href}/`))
  )
}

function findActiveSectionItem(items: ShellItem[], currentPath: string) {
  return items.find(
    (item) =>
      item.children?.length &&
      (isActivePath(item.href, currentPath) ||
        item.children.some((child) => isActivePath(child.href, currentPath)))
  )
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

    const parsedConfig = JSON.parse(storedConfig) as Partial<ShellConfig>
    if (!parsedConfig || !Array.isArray(parsedConfig.sections)) {
      return fallback
    }

    return {
      ...fallback,
      ...parsedConfig,
      topNavigation: Array.isArray(parsedConfig.topNavigation)
        ? parsedConfig.topNavigation
        : fallback.topNavigation,
      sections: parsedConfig.sections,
    }
  } catch (error) {
    console.error("Failed to load scraper shell config:", error)
    return fallback
  }
}

export function AppFrame({ children }: { children: ReactNode }) {
  const [shellConfig, setShellConfig] = React.useState(getInitialShellConfig)
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const shellItems = getShellItems(shellConfig)
  const dashboardPaths = shellConfig.topNavigation.map((item) => item.href)
  const isSettingsRoute =
    pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")
  const activeSectionItem = findActiveSectionItem(shellItems, pathname)
  const activeItem = shellItems.find((item) => isActivePath(item.href, pathname))

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        SHELL_CONFIG_STORAGE_KEY,
        JSON.stringify(shellConfig)
      )
    } catch (error) {
      console.error("Failed to save scraper shell config:", error)
    }
  }, [shellConfig])

  const navLinks = activeSectionItem
    ? [
        {
          label: activeSectionItem.label,
          icon: renderShellIcon(activeSectionItem.icon, "h-3.5 w-3.5"),
          active: pathname === activeSectionItem.href,
          onClick: () => void navigate({ to: activeSectionItem.href }),
        },
        ...(activeSectionItem.children ?? []).map((child) => ({
          label: child.label,
          icon: child.icon
            ? renderShellIcon(child.icon, "h-3.5 w-3.5")
            : undefined,
          active: isActivePath(child.href, pathname),
          onClick: () => void navigate({ to: child.href }),
        })),
      ]
    : activeItem
      ? [
          {
            label: activeItem.label,
            icon: renderShellIcon(activeItem.icon, "h-3.5 w-3.5"),
            active: true,
            onClick: () => void navigate({ to: activeItem.href }),
          },
        ]
      : pathname === "/" || dashboardPaths.includes(pathname)
        ? shellConfig.topNavigation
            .filter((item) => item.visible)
            .map((item) => ({
              label: item.label,
              icon: renderShellIcon(item.icon, "h-3.5 w-3.5"),
              active: pathname === item.href,
              onClick: () => void navigate({ to: item.href }),
            }))
        : []

  return (
    <div
      className="min-h-screen bg-background"
      data-shell-theme={shellConfig.themePreset}
      data-shell-font={shellConfig.fontPreset}
    >
      <SidebarProvider className="h-screen">
        <ScraperSidebar config={shellConfig} />
        <SidebarInset>
          <StickyHeader navLinks={navLinks} />
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
            {isSettingsRoute ? (
              <SettingsPage
                activeTab={getSettingsTabFromPath(pathname)}
                config={shellConfig}
                onConfigChange={setShellConfig}
              />
            ) : (
              children
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
