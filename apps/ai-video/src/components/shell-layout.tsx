import * as React from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

import { DashboardContent } from "@/components/demo/dashboard-content"
import { FeedbackModal } from "@/components/feedback-modal"
import {
  ShellRuntimeContext,
  type ShellRuntime,
} from "@/components/shell-runtime"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import {
  createDefaultShellConfig,
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellItem,
} from "@/lib/ai-video"
import type { AuthUser } from "@/lib/api/auth"
import { loadCurrentUser, logout } from "@/lib/api/auth"
import {
  getShellSettingsErrorMessage,
  saveShellSettings,
  saveSidebarWidth,
} from "@/lib/api/shell-settings"
import type { WorkspaceListResponse } from "@/lib/api/workspaces"
import { requireCanonicalShellConfig } from "@/lib/shell-config-schema"

type SaveStatus = "idle" | "saving" | "saved"

export function ShellLayout({
  user,
  settings,
  settingsError: initialSettingsError,
  workspaces,
}: {
  user: AuthUser
  settings: ShellConfig | null
  settingsError: string | null
  workspaces: WorkspaceListResponse
}) {
  const currentPath = useRouterState({
    select: (state) =>
      state.resolvedLocation?.pathname ?? state.location.pathname,
  })
  const [config, setConfig] = React.useState(() => resolveConfig(settings))
  // Last width the server confirmed, plus a serialized save queue + version
  // counter so rapid drags persist in order and a failure rolls back to the
  // last-saved width without clobbering a newer in-flight drag.
  const savedSidebarWidthRef = React.useRef(config.sidebarWidth)
  const sidebarWidthSaveQueueRef = React.useRef(Promise.resolve())
  const sidebarWidthSaveVersionRef = React.useRef(0)
  const [settingsError, setSettingsError] = React.useState<string | null>(
    initialSettingsError
  )
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
    const nextConfig = resolveConfig(settings)
    savedSidebarWidthRef.current = nextConfig.sidebarWidth
    setConfig(nextConfig)
    setSettingsError(initialSettingsError)
    setSaveStatus("idle")
  }, [initialSettingsError, settings])

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

  // Persist the dragged sidebar width on its own (not through the admin-gated
  // full-config save). Updates local config immediately, then saves; on failure
  // rolls the width back to the last-confirmed value unless a newer drag has
  // superseded this one.
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

  // The editor (/admin/video-editor/$projectId) fills the viewport itself:
  // strip the content padding and let the page manage its own overflow. The
  // projects dashboard at the bare path renders as a normal padded page.
  const isVideoEditorPath =
    currentPath.startsWith("/admin/video-editor/") ||
    currentPath.startsWith("/admin/carousels/") ||
    currentPath.startsWith("/admin/automations/")

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
            <DashboardContent
              className={
                isVideoEditorPath
                  ? "space-y-0 overflow-hidden p-0 sm:space-y-0 sm:p-0 md:p-0"
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

function resolveConfig(settings: ShellConfig | null) {
  if (!settings) {
    return createDefaultShellConfig()
  }

  return requireCanonicalShellConfig(settings)
}

function useShellFavicon(favicon: string) {
  React.useEffect(() => {
    const href = favicon.trim()
    const currentLink = document.querySelector<HTMLLinkElement>(
      'link[data-ai-video-favicon="true"]'
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
    'link[data-ai-video-favicon="true"]'
  )
  if (existing) {
    return existing
  }

  const link = document.createElement("link")
  link.rel = "icon"
  link.setAttribute("data-ai-video-favicon", "true")
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
    href === currentPath || (href !== "/" && currentPath.startsWith(`${href}/`))
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
