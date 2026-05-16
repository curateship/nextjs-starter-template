import * as React from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"

import { DashboardContent } from "@/components/demo/dashboard-content"
import { FeedbackModal } from "@/components/feedback-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import {
  createDefaultShellConfig,
  ensureDefaultShellNavigation,
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellItem,
} from "@/lib/custom-shell"
import type { AuthUser } from "@/lib/auth-api"
import { logout } from "@/lib/auth-api"
import {
  getShellSettingsErrorMessage,
  saveShellSettings,
} from "@/lib/shell-settings-api"

type SaveStatus = "idle" | "saving" | "saved"

type ShellRuntime = {
  config: ShellConfig
  settingsError: string | null
  saveStatus: SaveStatus
  feedbackRefreshToken: number
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
  onOpenFeedback: () => void
}

const ShellRuntimeContext = React.createContext<ShellRuntime | null>(null)

export function useShellRuntime() {
  const context = React.useContext(ShellRuntimeContext)
  if (!context) {
    throw new Error("Shell runtime is missing")
  }
  return context
}

export function ShellLayout({
  user,
  settings,
}: {
  user: AuthUser
  settings: ShellConfig | null
}) {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [config, setConfig] = React.useState(() => normalizeConfig(settings))
  const [settingsError, setSettingsError] = React.useState<string | null>(null)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedbackRefreshToken, setFeedbackRefreshToken] = React.useState(0)
  const lastSettingsRef = React.useRef(settings)

  React.useEffect(() => {
    if (lastSettingsRef.current === settings) {
      return
    }

    lastSettingsRef.current = settings
    setConfig(normalizeConfig(settings))
    setSettingsError(null)
    setSaveStatus("idle")
  }, [settings])

  const handleConfigChange = React.useCallback((nextConfig: ShellConfig) => {
    setConfig(nextConfig)
    setSettingsError(null)
    setSaveStatus("idle")
  }, [])

  const handleSaveConfig = React.useCallback(async () => {
    setSettingsError(null)
    setSaveStatus("saving")

    try {
      await saveShellSettings(config)
      setSaveStatus("saved")
      return true
    } catch (error) {
      setSettingsError(getShellSettingsErrorMessage(error))
      setSaveStatus("idle")
      return false
    }
  }, [config])

  const handleLogout = React.useCallback(async () => {
    await logout()
    window.location.href = "/login"
  }, [])

  const runtime = React.useMemo<ShellRuntime>(
    () => ({
      config,
      settingsError,
      saveStatus,
      feedbackRefreshToken,
      onConfigChange: handleConfigChange,
      onSaveConfig: handleSaveConfig,
      onOpenFeedback: () => setFeedbackOpen(true),
    }),
    [
      config,
      feedbackRefreshToken,
      handleConfigChange,
      handleSaveConfig,
      saveStatus,
      settingsError,
    ]
  )

  return (
    <ShellRuntimeContext.Provider value={runtime}>
      <div className="min-h-screen bg-background">
        <SidebarProvider className="h-screen">
          <AppSidebar config={config} user={user} onLogout={handleLogout} />
          <SidebarInset>
            <StickyHeader
              navLinks={getStickyHeaderNavLinks(config, currentPath)}
              onOpenFeedback={() => setFeedbackOpen(true)}
            />
            {isDashboardPath(config, currentPath) ? (
              <Outlet />
            ) : (
              <DashboardContent>
                <Outlet />
              </DashboardContent>
            )}
          </SidebarInset>
        </SidebarProvider>
        <FeedbackModal
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          onCreated={() => setFeedbackRefreshToken((current) => current + 1)}
        />
      </div>
    </ShellRuntimeContext.Provider>
  )
}

function normalizeConfig(settings: ShellConfig | null) {
  const fallback = createDefaultShellConfig()
  if (!settings) {
    return fallback
  }

  return ensureDefaultShellNavigation({
    appName: settings.appName ?? fallback.appName,
    workspaceName: settings.workspaceName ?? fallback.workspaceName,
    workspacePlan: settings.workspacePlan ?? fallback.workspacePlan,
    topNavigation: Array.isArray(settings.topNavigation)
      ? settings.topNavigation
      : fallback.topNavigation,
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
  })
}

function getShellItems(config: ShellConfig) {
  return config.sections.flatMap((section) =>
    section.entries.filter(isShellItem)
  )
}

function isDashboardPath(config: ShellConfig, currentPath: string) {
  const dashboardPaths = config.topNavigation.map((item) => item.href)
  return currentPath === "/" || dashboardPaths.includes(currentPath)
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

function getStickyHeaderNavLinks(config: ShellConfig, currentPath: string) {
  if (isDashboardPath(config, currentPath)) {
    return config.topNavigation
      .filter((item) => item.visible)
      .map((item) => ({
        label: item.label,
        href: item.href,
        icon: item.icon
          ? renderShellIcon(item.icon, "h-3.5 w-3.5")
          : undefined,
        active: currentPath === item.href,
      }))
  }

  const items = getShellItems(config)
  const activeSectionItem = findActiveSectionItem(items, currentPath)
  const activeItem = items.find((item) => isActivePath(item.href, currentPath))

  if (activeSectionItem) {
    return [
      {
        label: activeSectionItem.label,
        href: activeSectionItem.href,
        icon: renderShellIcon(activeSectionItem.icon, "h-3.5 w-3.5"),
        active: currentPath === activeSectionItem.href,
      },
      ...(activeSectionItem.children ?? []).map((child) => ({
        label: child.label,
        href: child.href,
        icon: child.icon
          ? renderShellIcon(child.icon, "h-3.5 w-3.5")
          : undefined,
        active: currentPath === child.href,
      })),
    ]
  }

  if (activeItem) {
    return [
      {
        label: activeItem.label,
        href: activeItem.href,
        icon: renderShellIcon(activeItem.icon, "h-3.5 w-3.5"),
        active: true,
      },
    ]
  }

  return []
}
