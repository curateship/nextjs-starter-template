import * as React from "react"
import {
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router"
import { toast } from "sonner"

import { AccountDialog, accountTabForHref } from "@/components/account-dialog"
import { DashboardContent } from "@/components/demo/dashboard-content"
import { FeedbackModal } from "@/components/feedback-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import {
  canSeeShellEntry,
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
  type ShellSection,
} from "@/lib/custom-shell"
import type { AuthUser } from "@/lib/api/auth"
import { logout } from "@/lib/api/auth"
import type { PlanSummary } from "@/lib/api/billing"
import {
  getShellSettingsErrorMessage,
  saveShellSettings,
  saveSidebarWidth,
} from "@/lib/api/shell-settings"
import type { WorkspaceListResponse } from "@/lib/api/workspaces"
import { clampSidebarWidth } from "@/lib/sidebar-width"

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
  plan,
}: {
  user: AuthUser
  settings: ShellConfig | null
  workspaces: WorkspaceListResponse
  plan: PlanSummary
}) {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  const navigate = useNavigate()
  const router = useRouter()
  const { account: accountTab } = useSearch({ from: "/_authenticated" })
  const [config, setConfig] = React.useState(() => normalizeConfig(settings))
  // Last width the server confirmed, plus a serialized save queue + version
  // counter so rapid drags persist in order and a failure rolls back to the
  // last-saved width without clobbering a newer in-flight drag.
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

  // Persist the dragged sidebar width on its own (not through the admin-gated
  // full-config save). Updates local config immediately, then saves; on failure
  // rolls the width back to the last-confirmed value unless a newer drag has
  // superseded this one, and toasts the error.
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

  // Recolors both the sidebar rail and the sticky header (both use bg-sidebar).
  // Opaque so the two render the same color regardless of what sits behind them.
  const chromeBackground = resolveBackground(config.styling.chrome, {
    opaque: true,
  })
  // Divider lines resolve to the theme --border token; overriding it (and the
  // sidebar edge) on this wrapper recolors the rules inside cards and tables plus
  // the sidebar border across the whole shell at once.
  const dividerColor = resolveBackground(config.styling.dividerColor, {
    base: "--muted-foreground",
  })
  const rootStyle = {
    ...(chromeBackground ? { "--sidebar": chromeBackground } : {}),
    ...(dividerColor
      ? { "--border": dividerColor, "--sidebar-border": dividerColor }
      : {}),
  } as React.CSSProperties

  return (
    <ShellRuntimeContext.Provider value={runtime}>
      <div className="min-h-screen bg-muted/60" style={rootStyle}>
        <SidebarProvider
          className="h-screen"
          sidebarWidth={config.sidebarWidth}
          onSidebarWidthCommit={handleSidebarWidthCommit}
        >
          <AppSidebar
            config={config}
            user={user}
            plan={plan}
            workspaces={workspaces.workspaces}
            onLogout={handleLogout}
          />
          <SidebarInset>
            <StickyHeader
              navLinks={getStickyHeaderNavLinks(config, currentPath, user.role)}
              rightNavItems={config.topRightNavigation}
              onOpenFeedback={() => openFeedback()}
              onOpenFeedbackThread={openFeedback}
            />
            <DashboardContent styling={config.styling}>
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
        <AccountDialog
          tab={accountTab ?? null}
          user={user}
          plan={plan}
          onTabChange={(tab) =>
            navigate({ to: ".", search: (prev) => ({ ...prev, account: tab }) })
          }
          onClose={() =>
            navigate({
              to: ".",
              search: ({ account: _account, ...rest }) => rest,
            })
          }
          onProfileSaved={() => router.invalidate()}
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
    sidebarWidth: clampSidebarWidth(
      settings.sidebarWidth ?? fallback.sidebarWidth
    ),
    adminRoute: settings.adminRoute ?? fallback.adminRoute,
    favicon: settings.favicon ?? fallback.favicon,
    topRightNavigation: normalizeTopRightNavigation(
      settings.topRightNavigation
    ),
    sections: stripRetiredAccountEntries(
      Array.isArray(settings.sections) ? settings.sections : fallback.sections
    ),
    styling: normalizeStyling(settings.styling),
  }
}

// The account area is a modal reached from the user menu, not the sidebar, so
// drop its retired nav links (and any section left empty by that) from saved
// configs — no config migration needed.
function stripRetiredAccountEntries(sections: ShellSection[]): ShellSection[] {
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter(
        (entry) => !(isShellItem(entry) && accountTabForHref(entry.href) != null)
      ),
    }))
    .filter((section) => section.entries.length > 0)
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

function getShellItems(config: ShellConfig, role: string) {
  return config.sections
    .flatMap((section) => section.entries.filter(isShellItem))
    .filter((item) => canSeeShellEntry(item, role))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => canSeeShellEntry(child, role)),
    }))
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

// The header's top-left nav mirrors the sidebar: the active section item and
// its children (or the single active item when it has none).
function getStickyHeaderNavLinks(
  config: ShellConfig,
  currentPath: string,
  role: string
) {
  const items = getShellItems(config, role)
  const activeSectionItem = findActiveSectionItem(items, currentPath)
  // Most specific match wins, so /account/billing shows Billing rather than the
  // shorter /account that also matches.
  const activeItem = items
    .filter((item) => isActivePath(item.href, currentPath))
    .sort((a, b) => b.href.length - a.href.length)[0]

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
