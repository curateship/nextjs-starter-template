import * as React from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

import { DashboardContent } from "@/components/ui/dashboard-content"
import { FeedbackModal } from "@/components/feedback-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import {
  createDefaultShellConfig,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  getModalStyleVars,
  isShellItem,
  MODAL_STYLE_VAR_NAMES,
  normalizeStyling,
  normalizeTopRightNavigation,
  renderShellIcon,
  resolveBackground,
  type ShellConfig,
  type ShellItem,
  type ShellModalStyling,
  type ShellStyling,
} from "@/lib/custom-shell"
import { clampMaxCandles } from "@/lib/backtest/types"
import { clampLiquidationAlertThreshold } from "@/lib/trading/liquidation-risk"
import { normalizeOrderDefaults } from "@/lib/trading/order-defaults"
import {
  getMountedLocation,
  isFullBleedLocation,
} from "@/lib/full-bleed-location"
import type { AuthUser } from "@/lib/api/auth"
import { logout } from "@/lib/api/auth"
import {
  getShellSettingsErrorMessage,
  saveSidebarWidth,
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
  onSaveConfig: (nextConfig?: ShellConfig) => Promise<boolean>
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
  const location = useRouterState({ select: getMountedLocation })
  const currentPath = location.pathname
  // Full-bleed workspaces manage their own height and scrolling, so they drop
  // the padded DashboardContent wrapper: the live trade terminal and the bot
  // workspace always, and the backtest chart workspace when opened with
  // ?run= / ?draft= (the strategies list at /backtest and the bot fleet list
  // keep their padding). Read the mounted route match, which changes in the
  // same render as Outlet, so the wrapper and page cannot disagree.
  const fullBleed = isFullBleedLocation(location)
  const [config, setConfig] = React.useState(() => normalizeConfig(settings))
  const savedSidebarWidthRef = React.useRef(config.sidebarWidth)
  const sidebarWidthSaveQueueRef = React.useRef(Promise.resolve())
  const sidebarWidthSaveVersionRef = React.useRef(0)
  const [settingsError, setSettingsError] = React.useState<string | null>(null)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [targetFeedbackId, setTargetFeedbackId] = React.useState<string | null>(
    null
  )
  const [feedbackRefreshToken, setFeedbackRefreshToken] = React.useState(0)
  const lastSettingsRef = React.useRef(settings)

  useShellFavicon(config.favicon)
  useModalStyleVars(config.styling.modal)

  React.useEffect(() => {
    if (lastSettingsRef.current === settings) {
      return
    }

    lastSettingsRef.current = settings
    const nextConfig = normalizeConfig(settings)
    savedSidebarWidthRef.current = nextConfig.sidebarWidth
    setConfig(nextConfig)
    setSettingsError(null)
    setSaveStatus("idle")
  }, [settings])

  // NOTE: no focus/visibilitychange auto-redirect. A client-side "am I still
  // signed in?" check on every tab focus was bouncing the user to /login
  // whenever the client-side loadCurrentUser call didn't see the session cookie
  // (which happens intermittently in the IDE's embedded preview). Route auth is
  // guarded server-side by the _authenticated loader on navigation, which reads
  // the cookie from the request directly — that's the reliable gate.

  const handleConfigChange = React.useCallback((nextConfig: ShellConfig) => {
    setConfig(nextConfig)
    setSettingsError(null)
    setSaveStatus("idle")
  }, [])

  const handleSaveConfig = React.useCallback(async (nextConfig?: ShellConfig) => {
    setSettingsError(null)
    setSaveStatus("saving")

    try {
      await saveShellSettings(nextConfig ?? config)
      setSaveStatus("saved")
      return true
    } catch (error) {
      if (nextConfig) setConfig(config)
      setSettingsError(getShellSettingsErrorMessage(error))
      setSaveStatus("idle")
      return false
    }
  }, [config])

  const handleSidebarWidthCommit = React.useCallback((sidebarWidth: number) => {
    const version = sidebarWidthSaveVersionRef.current + 1
    sidebarWidthSaveVersionRef.current = version
    setConfig((current) => ({ ...current, sidebarWidth }))

    const save = sidebarWidthSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveSidebarWidth(sidebarWidth))
    sidebarWidthSaveQueueRef.current = save.then(
      () => undefined,
      () => undefined
    )

    void save
      .then(() => {
        savedSidebarWidthRef.current = sidebarWidth
      })
      .catch((error) => {
        if (version === sidebarWidthSaveVersionRef.current) {
          setConfig((current) => ({
            ...current,
            sidebarWidth: savedSidebarWidthRef.current,
          }))
          toast.error(getShellSettingsErrorMessage(error))
        }
      })
  }, [])

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

  // Recolors both the sidebar rail and the sticky header (both use bg-sidebar).
  // Opaque so the two render the same color regardless of what sits behind them.
  const chromeBackground = resolveBackground(config.styling.chrome, {
    opaque: true,
  })

  return (
    <ShellRuntimeContext.Provider value={runtime}>
      <div
        className="min-h-screen bg-muted/60 dark:bg-background"
        style={
          chromeBackground
            ? ({ "--sidebar": chromeBackground } as React.CSSProperties)
            : undefined
        }
      >
        <SidebarProvider
          className="h-screen"
          sidebarWidth={config.sidebarWidth}
          onSidebarWidthCommit={handleSidebarWidthCommit}
        >
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
            <ShellPageContent fullBleed={fullBleed} styling={config.styling}>
              <Outlet />
            </ShellPageContent>
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

function ShellPageContent({
  children,
  fullBleed,
  styling,
}: {
  children: React.ReactNode
  fullBleed: boolean
  styling: ShellStyling
}) {
  return (
    // Full-bleed workspaces still receive the styling contract so they track the
    // content-spacing setting and go flat at 0; DashboardContent just skips the
    // outer gutter padding/gap for them (they pad themselves from --shell-gutter).
    <DashboardContent styling={styling} fullBleed={fullBleed}>
      {children}
    </DashboardContent>
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
    sidebarWidth: settings.sidebarWidth,
    dashboardRowsPerPage: DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
      settings.dashboardRowsPerPage as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
    )
      ? settings.dashboardRowsPerPage
      : fallback.dashboardRowsPerPage,
    maxCandles: clampMaxCandles(settings.maxCandles),
    adminRoute: settings.adminRoute ?? fallback.adminRoute,
    orderConfirmation: settings.orderConfirmation,
    liquidationAlertThresholdPct: clampLiquidationAlertThreshold(
      settings.liquidationAlertThresholdPct
    ),
    orderDefaults: normalizeOrderDefaults(settings.orderDefaults),
    favicon: settings.favicon ?? fallback.favicon,
    topRightNavigation: normalizeTopRightNavigation(
      settings.topRightNavigation
    ),
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
    styling: normalizeStyling(settings.styling),
  }
}

// The dialog portals to document.body, outside the shell subtree, so modal
// styling is applied as CSS variables on the document root where it can reach.
function useModalStyleVars(modal: ShellModalStyling) {
  React.useEffect(() => {
    const root = document.documentElement
    const vars = getModalStyleVars(modal)
    for (const name of MODAL_STYLE_VAR_NAMES) {
      const value = vars[name]
      if (value === undefined) {
        root.style.removeProperty(name)
      } else {
        root.style.setProperty(name, value)
      }
    }
    return () => {
      for (const name of MODAL_STYLE_VAR_NAMES) {
        root.style.removeProperty(name)
      }
    }
  }, [modal])
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
