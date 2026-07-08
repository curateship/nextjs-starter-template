import * as React from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"

import { DashboardContent } from "@/components/ui/dashboard-content"
import { FeedbackModal } from "@/components/feedback-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import {
  createDefaultShellConfig,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  isShellItem,
  normalizeTopRightNavigation,
  renderShellIcon,
  type ShellConfig,
  type ShellItem,
} from "@/lib/custom-shell"
import { clampMaxCandles } from "@/lib/backtest/types"
import type { AuthUser } from "@/lib/api/auth"
import { loadCurrentUser, logout } from "@/lib/api/auth"
import {
  getShellSettingsErrorMessage,
  saveShellSettings,
} from "@/lib/api/shell-settings"
import type { WorkspaceListResponse } from "@/lib/api/workspaces"

type SaveStatus = "idle" | "saving" | "saved"

type ShellRuntime = {
  config: ShellConfig
  settingsError: string | null
  saveStatus: SaveStatus
  feedbackRefreshToken: number
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
  onOpenFeedback: () => void
  onOpenFeedbackThread: (feedbackId: string) => void
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
  workspaces,
}: {
  user: AuthUser
  settings: ShellConfig | null
  workspaces: WorkspaceListResponse
}) {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  // Full-bleed workspaces manage their own height and scrolling, so they drop
  // the padded DashboardContent wrapper: the live trade terminal and the bot
  // workspace always, and the backtest chart workspace when opened with
  // ?run= / ?draft= (the strategies list at /backtest and the bot fleet list
  // keep their padding). Read the resolved location, not the pending one —
  // during navigation the outgoing page is still on screen, and flipping the
  // padding early makes it jump for a split second.
  const fullBleed = useRouterState({
    select: (state) => {
      const location = state.resolvedLocation ?? state.location
      const search = location.search as {
        run?: string
        draft?: unknown
      }
      return (
        location.pathname === "/trade" ||
        /^\/bots\/.+/.test(location.pathname) ||
        (location.pathname === "/backtest" &&
          Boolean(search.run || search.draft))
      )
    },
  })
  const [config, setConfig] = React.useState(() => normalizeConfig(settings))
  const [settingsError, setSettingsError] = React.useState<string | null>(null)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [targetFeedbackId, setTargetFeedbackId] = React.useState<string | null>(
    null
  )
  const [feedbackRefreshToken, setFeedbackRefreshToken] = React.useState(0)
  const lastSettingsRef = React.useRef(settings)

  useShellFavicon(config.favicon)

  React.useEffect(() => {
    if (lastSettingsRef.current === settings) {
      return
    }

    lastSettingsRef.current = settings
    setConfig(normalizeConfig(settings))
    setSettingsError(null)
    setSaveStatus("idle")
  }, [settings])

  React.useEffect(() => {
    let active = true

    const redirectIfSignedOut = async () => {
      const currentUser = await loadCurrentUser().catch(() => null)
      if (active && !currentUser) {
        window.location.href = "/login"
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void redirectIfSignedOut()
      }
    }

    window.addEventListener("focus", redirectIfSignedOut)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      active = false
      window.removeEventListener("focus", redirectIfSignedOut)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

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

  const openFeedback = React.useCallback((feedbackId?: string) => {
    setTargetFeedbackId(feedbackId ?? null)
    setFeedbackOpen(true)
  }, [])

  const handleFeedbackOpenChange = React.useCallback((open: boolean) => {
    setFeedbackOpen(open)
    if (!open) {
      setTargetFeedbackId(null)
    }
  }, [])

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
      onOpenFeedback: () => openFeedback(),
      onOpenFeedbackThread: openFeedback,
    }),
    [
      config,
      feedbackRefreshToken,
      handleConfigChange,
      handleSaveConfig,
      openFeedback,
      saveStatus,
      settingsError,
    ]
  )

  return (
    <ShellRuntimeContext.Provider value={runtime}>
      <div className="min-h-screen bg-background">
        <SidebarProvider className="h-screen">
          <AppSidebar
            config={config}
            user={user}
            workspaces={workspaces.workspaces}
            onLogout={handleLogout}
          />
          <SidebarInset>
            <StickyHeader
              navLinks={getStickyHeaderNavLinks(config, currentPath)}
              rightNavItems={config.topRightNavigation}
              onOpenFeedback={() => openFeedback()}
              onOpenFeedbackThread={openFeedback}
            />
            <DashboardContent
              className={
                fullBleed
                  ? "overflow-hidden p-0 space-y-0 sm:p-0 sm:space-y-0 md:p-0"
                  : undefined
              }
            >
              <Outlet />
            </DashboardContent>
          </SidebarInset>
        </SidebarProvider>
        <FeedbackModal
          open={feedbackOpen}
          onOpenChange={handleFeedbackOpenChange}
          targetFeedbackId={targetFeedbackId}
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

  return {
    appName: settings.appName ?? fallback.appName,
    workspaceName: settings.workspaceName ?? fallback.workspaceName,
    workspacePlan: settings.workspacePlan ?? fallback.workspacePlan,
    dashboardRowsPerPage: DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
      settings.dashboardRowsPerPage as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
    )
      ? settings.dashboardRowsPerPage
      : fallback.dashboardRowsPerPage,
    maxCandles: clampMaxCandles(settings.maxCandles),
    adminRoute: settings.adminRoute ?? fallback.adminRoute,
    favicon: settings.favicon ?? fallback.favicon,
    topNavigation: Array.isArray(settings.topNavigation)
      ? settings.topNavigation
      : fallback.topNavigation,
    topRightNavigation: normalizeTopRightNavigation(
      settings.topRightNavigation
    ),
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
  }
}

function useShellFavicon(favicon: string) {
  React.useEffect(() => {
    const href = favicon.trim()
    const currentLink = document.querySelector<HTMLLinkElement>(
      'link[data-custom-shell-favicon="true"]'
    )

    if (!href) {
      currentLink?.remove()
      return
    }

    const link = getOrCreateShellFaviconLink()
    link.href = href
  }, [favicon])
}

function getOrCreateShellFaviconLink() {
  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-custom-shell-favicon="true"]'
  )
  if (existing) {
    return existing
  }

  const link = document.createElement("link")
  link.rel = "icon"
  link.setAttribute("data-custom-shell-favicon", "true")
  document.head.appendChild(link)
  return link
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
