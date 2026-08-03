import * as React from "react"
import {
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router"
import { toast } from "sonner"

import { AccountDialog, accountTabForHref } from "@/components/account/account-dialog"
import { AnnouncementBanners } from "@/components/shell/announcement-banner"
import { DashboardContent } from "@/components/shell/dashboard-content"
import { FeedbackModal } from "@/components/feedback/feedback-modal"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import {
  StickyHeader,
  type SaveStatus,
} from "@/pages/dashboard/sticky-header/sticky-header"
import {
  canSeeShellEntry,
  createDefaultShellConfig,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  getModalStyleVars,
  isActiveShellHref,
  isShellEntryNamed,
  isShellItem,
  MODAL_STYLE_VAR_NAMES,
  normalizeMaintenance,
  normalizeSessionPolicy,
  normalizeStyling,
  normalizeTopRightNavigation,
  renderShellIcon,
  resolveBackground,
  type ShellConfig,
  type ShellItem,
  type ShellMaintenance,
  type ShellModalStyling,
  type ShellSection,
  type ShellSessionPolicy,
} from "@/lib/custom-shell"
import { resolveAppName } from "@/lib/branding"
import type { UserAnnouncement } from "@/lib/announcement"
import type { AuthUser } from "@/lib/api/auth"
import { logout } from "@/lib/api/auth"
import type { PlanSummary } from "@/lib/api/billing"
import {
  getMaintenanceErrorMessage,
  saveMaintenance,
} from "@/lib/api/maintenance"
import {
  getSessionPolicyErrorMessage,
  saveSessionPolicy,
} from "@/lib/api/session-policy"
import {
  getShellSettingsErrorMessage,
  saveShellSettings,
  saveSidebarWidth,
} from "@/lib/api/shell-settings"
import type { WorkspaceListResponse } from "@/lib/api/workspaces"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { clampSidebarWidth } from "@/lib/sidebar-width"
import { setToastSeconds } from "@/lib/toast-duration"
import { clampToastSeconds } from "@/lib/toast-seconds"

// Debounce window before an edit on the settings page is auto-saved.
const CONFIG_SAVE_DEBOUNCE_MS = 700

type ShellRuntime = {
  config: ShellConfig
  saveStatus: SaveStatus
  feedbackRefreshToken: number
  /** True while the maintenance switch is being written. */
  maintenanceBusy: boolean
  /** True while the session policy is being written. */
  sessionPolicyBusy: boolean
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
  /** Writes the maintenance switch on its own; never via the settings save. */
  onMaintenanceChange: (maintenance: ShellMaintenance) => Promise<boolean>
  /** Writes the session policy on its own; never via the settings save. */
  onSessionPolicyChange: (policy: ShellSessionPolicy) => Promise<boolean>
  onOpenFeedback: () => void
  onOpenFeedbackThread: (feedbackId: string) => void
  /**
   * Lets a page that auto-saves its own record — the automation editor — put its
   * status in the sticky header, which is the one place this app reports saving.
   * The page owns the value and must clear it (pass null) when it unmounts, or
   * its last word would outlive it on the next screen.
   */
  reportSaveStatus: (status: SaveStatus | null) => void
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
  unreadNotifications,
  announcements,
  viewedBy,
}: {
  user: AuthUser
  settings: ShellConfig | null
  workspaces: WorkspaceListResponse
  plan: PlanSummary
  unreadNotifications: number
  announcements: UserAnnouncement[]
  viewedBy: { id: string; name: string; email: string } | null
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
  // Auto-save plumbing for the full shell config (settings page). Mirrors the
  // sidebar-width queue/version pattern above: edits schedule a debounced save
  // that runs on a serialized queue so rapid edits persist in order.
  const latestConfigRef = React.useRef(config)
  const configSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const configSaveQueueRef = React.useRef(Promise.resolve())
  const configSaveVersionRef = React.useRef(0)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  // A page's own auto-save, when it has one. It wins over the settings status
  // above because only one of the two can be on screen at a time, and this is
  // the one the person is looking at.
  const [pageSaveStatus, setPageSaveStatus] = React.useState<SaveStatus | null>(
    null
  )
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [targetFeedbackId, setTargetFeedbackId] = React.useState<string | null>(
    null
  )
  const [feedbackRefreshToken, setFeedbackRefreshToken] = React.useState(0)
  const [maintenanceBusy, setMaintenanceBusy] = React.useState(false)
  const [sessionPolicyBusy, setSessionPolicyBusy] = React.useState(false)
  const lastSettingsRef = React.useRef(settings)

  useShellDocumentTitle(config.appName)
  useShellFavicon(config.favicon)
  useModalStyleVars(config.styling.modal)

  React.useEffect(() => {
    if (lastSettingsRef.current === settings) {
      return
    }

    lastSettingsRef.current = settings
    const nextConfig = normalizeConfig(settings)
    savedSidebarWidthRef.current = nextConfig.sidebarWidth
    // Fresh server data supersedes any pending debounced auto-save so an
    // in-flight edit can't overwrite it.
    if (configSaveTimerRef.current) {
      clearTimeout(configSaveTimerRef.current)
      configSaveTimerRef.current = null
    }
    latestConfigRef.current = nextConfig
    setConfig(nextConfig)
    setSaveStatus("idle")
  }, [settings])

  // NOTE: no focus/visibilitychange auto-redirect. A client-side "am I still
  // signed in?" check on every tab focus was bouncing the user to /login
  // whenever the client-side loadCurrentUser call didn't see the session cookie
  // (which happens intermittently in the IDE's embedded preview). Route auth is
  // guarded server-side by the _authenticated loader on navigation, which reads
  // the cookie from the request directly — that's the reliable gate.

  // Persists the freshest config immediately, cancelling any pending debounce.
  // The server rejects an empty workspace name, so skip the request — but say
  // "Not saved" in the header instead of dropping the edit in silence. The
  // header is the only warning that reaches you when the edit that emptied the
  // name happened on another settings tab (e.g. the sidebar's Reset).
  // Returns whether it saved.
  const saveConfigNow = React.useCallback(async () => {
    if (configSaveTimerRef.current) {
      clearTimeout(configSaveTimerRef.current)
      configSaveTimerRef.current = null
    }

    const snapshot = latestConfigRef.current
    if (!snapshot.workspaceName.trim()) {
      setSaveStatus("blocked")
      return false
    }

    const version = configSaveVersionRef.current + 1
    configSaveVersionRef.current = version
    setSaveStatus("saving")

    const save = configSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveShellSettings(snapshot))
    configSaveQueueRef.current = save.then(
      () => undefined,
      () => undefined
    )

    try {
      await save
      if (version === configSaveVersionRef.current) {
        setSaveStatus("saved")
      }
      return true
    } catch (error) {
      if (version === configSaveVersionRef.current) {
        setSaveStatus("idle")
        showErrorToast(getShellSettingsErrorMessage(error))
      }
      return false
    }
  }, [])

  // Every settings edit funnels through here. Update state immediately and
  // schedule a debounced auto-save; the settings-sync effect above uses
  // setConfig directly, so loading data never triggers a save.
  const handleConfigChange = React.useCallback(
    (nextConfig: ShellConfig) => {
      setConfig(nextConfig)
      latestConfigRef.current = nextConfig
      dismissErrorToast()
      if (configSaveTimerRef.current) {
        clearTimeout(configSaveTimerRef.current)
      }
      configSaveTimerRef.current = setTimeout(() => {
        configSaveTimerRef.current = null
        void saveConfigNow()
      }, CONFIG_SAVE_DEBOUNCE_MS)
    },
    [saveConfigNow]
  )

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
          showErrorToast(getShellSettingsErrorMessage(error))
        }
      })
  }, [])

  // Maintenance mode has its own write — it is confirmed, audit-logged, and
  // must not ride along with a settings save that could carry a stale copy of
  // the switch. Nothing is scheduled here afterwards: the value is already
  // saved, so the local config is just brought in line with it.
  const handleMaintenanceChange = React.useCallback(
    async (maintenance: ShellMaintenance) => {
      setMaintenanceBusy(true)
      try {
        const saved = await saveMaintenance(maintenance)
        setConfig((current) => ({ ...current, maintenance: saved }))
        latestConfigRef.current = {
          ...latestConfigRef.current,
          maintenance: saved,
        }
        toast.success(
          saved.enabled
            ? "Maintenance mode is on. Only admins can use the app."
            : "Maintenance mode is off. Everyone can use the app again."
        )
        return true
      } catch (error) {
        showErrorToast(getMaintenanceErrorMessage(error))
        return false
      } finally {
        setMaintenanceBusy(false)
      }
    },
    []
  )

  // The session policy writes on its own for the same reason maintenance does:
  // it must never ride along with a settings save that could carry a stale
  // copy of it. The value is already saved when this resolves; the local
  // config is just brought in line with it.
  const handleSessionPolicyChange = React.useCallback(
    async (policy: ShellSessionPolicy) => {
      setSessionPolicyBusy(true)
      try {
        const saved = await saveSessionPolicy(policy)
        setConfig((current) => ({ ...current, sessionPolicy: saved }))
        latestConfigRef.current = {
          ...latestConfigRef.current,
          sessionPolicy: saved,
        }
        toast.success("Session security saved.")
        return true
      } catch (error) {
        showErrorToast(getSessionPolicyErrorMessage(error))
        return false
      } finally {
        setSessionPolicyBusy(false)
      }
    },
    []
  )

  // The sidebar link-editor dialog's "Done" button flushes any pending
  // debounced save immediately, so closing it never leaves an unsaved edit.
  const handleSaveConfig = React.useCallback(
    () => saveConfigNow(),
    [saveConfigNow]
  )

  // Flush a pending auto-save if the shell unmounts (logout / full navigation)
  // so a debounced edit isn't dropped. Best-effort and fire-and-forget — no
  // state updates, since the component is going away.
  React.useEffect(() => {
    return () => {
      if (configSaveTimerRef.current) {
        clearTimeout(configSaveTimerRef.current)
        configSaveTimerRef.current = null
        const snapshot = latestConfigRef.current
        if (snapshot.workspaceName.trim()) {
          void saveShellSettings(snapshot).catch(() => undefined)
        }
      }
    }
  }, [])

  // The Toaster lives above the router outlet and can't see the config, so
  // hand it the saved duration whenever it changes. See lib/toast-duration.ts.
  React.useEffect(() => {
    setToastSeconds(config.toastSeconds)
  }, [config.toastSeconds])

  // Auto-clear the "Saved" badge a couple seconds after it appears so it
  // doesn't linger in the shared header after leaving the settings page.
  React.useEffect(() => {
    if (saveStatus !== "saved") {
      return
    }
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

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
      saveStatus,
      feedbackRefreshToken,
      maintenanceBusy,
      sessionPolicyBusy,
      onConfigChange: handleConfigChange,
      onSaveConfig: handleSaveConfig,
      onMaintenanceChange: handleMaintenanceChange,
      onSessionPolicyChange: handleSessionPolicyChange,
      onOpenFeedback: () => openFeedback(),
      onOpenFeedbackThread: openFeedback,
      reportSaveStatus: setPageSaveStatus,
    }),
    [
      config,
      feedbackRefreshToken,
      handleConfigChange,
      handleMaintenanceChange,
      handleSaveConfig,
      handleSessionPolicyChange,
      maintenanceBusy,
      openFeedback,
      saveStatus,
      sessionPolicyBusy,
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
            viewingAsMember={Boolean(viewedBy)}
            onLogout={handleLogout}
          />
          <SidebarInset>
            <StickyHeader
              navLinks={getStickyHeaderNavLinks(config, currentPath, user.role)}
              rightNavItems={config.topRightNavigation}
              role={user.role}
              unreadNotifications={unreadNotifications}
              liveNotifications={config.liveNotifications}
              saveStatus={pageSaveStatus ?? saveStatus}
              maintenanceOn={
                user.role === "admin" && config.maintenance.enabled
              }
              maintenanceBusy={maintenanceBusy}
              viewingAs={
                viewedBy
                  ? {
                      memberName: user.name,
                      memberEmail: user.email,
                      adminName: viewedBy.name,
                    }
                  : null
              }
              onTurnOffMaintenance={() =>
                void handleMaintenanceChange({
                  ...config.maintenance,
                  enabled: false,
                })
              }
              onOpenFeedback={() => openFeedback()}
              onOpenFeedbackThread={openFeedback}
            />
            <DashboardContent styling={config.styling}>
              {/* First cards on the page, so a broadcast rides the content
                  gutter and the workspace's own card styling. Remounted per set
                  of ids so a fresh load after one is retired starts from the
                  server's list, not a stale local one. */}
              <AnnouncementBanners
                key={announcements.map((item) => item.id).join("|")}
                announcements={announcements}
              />
              <Outlet />
            </DashboardContent>
          </SidebarInset>
        </SidebarProvider>
        <FeedbackModal
          open={feedbackOpen}
          onOpenChange={handleFeedbackOpenChange}
          targetFeedbackId={targetFeedbackId}
          currentUserName={user.name}
          onMutated={() => setFeedbackRefreshToken((current) => current + 1)}
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

function normalizeConfig(settings: ShellConfig | null): ShellConfig {
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
    toastSeconds: clampToastSeconds(settings.toastSeconds),
    sidebarWidth: clampSidebarWidth(
      settings.sidebarWidth ?? fallback.sidebarWidth
    ),
    adminRoute: settings.adminRoute ?? fallback.adminRoute,
    memberHomeRoute: settings.memberHomeRoute ?? fallback.memberHomeRoute,
    favicon: settings.favicon ?? fallback.favicon,
    logo: settings.logo ?? fallback.logo,
    topRightNavigation: normalizeTopRightNavigation(
      settings.topRightNavigation
    ),
    memberTopRightNavigation: normalizeTopRightNavigation(
      settings.memberTopRightNavigation
    ),
    sections: stripRetiredAccountEntries(
      Array.isArray(settings.sections) ? settings.sections : fallback.sections
    ),
    // Not stripped: this is the list an admin is editing for members, not the
    // one being rendered, so nothing should quietly disappear out of the editor.
    memberSections: Array.isArray(settings.memberSections)
      ? settings.memberSections
      : fallback.memberSections,
    // Only an explicit `false` turns the live bell off, so a config saved
    // before this setting existed keeps it on.
    liveNotifications: settings.liveNotifications !== false,
    maintenance: normalizeMaintenance(settings.maintenance),
    sessionPolicy: normalizeSessionPolicy(settings.sessionPolicy),
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

// The root route puts the saved app name in the tab title when the page loads.
// Editing the name on the settings page does not reload the page, so follow the
// live config here too — same as the favicon below — and the tab renames itself
// as you type instead of waiting for the next full load.
function useShellDocumentTitle(appName: string) {
  React.useEffect(() => {
    document.title = resolveAppName(appName)
  }, [appName])
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
    .filter((item) => canSeeShellEntry(item, role) && isShellEntryNamed(item))
    .map((item) => ({
      ...item,
      children: item.children?.filter(
        (child) => canSeeShellEntry(child, role) && isShellEntryNamed(child)
      ),
    }))
}

function findActiveSectionItem(items: ShellItem[], currentPath: string) {
  return items.find(
    (item) =>
      item.children?.length &&
      (isActiveShellHref(item.href, currentPath) ||
        item.children.some((child) =>
          isActiveShellHref(child.href, currentPath)
        ))
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
    .filter((item) => isActiveShellHref(item.href, currentPath))
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
