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
  getModalStyleVars,
  isShellItem,
  MODAL_STYLE_VAR_NAMES,
  renderShellIcon,
  resolveBackground,
  type ShellConfig,
  type ShellItem,
  type ShellModalStyling,
} from "@/lib/ai-video"
import type { AuthUser } from "@/lib/api/auth"
import { logout } from "@/lib/api/auth"
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
  useModalStyleVars(config.styling.modal)

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
            {/* Full-bleed workspaces still receive the styling contract so they
                track the content-spacing setting and go flat at 0; DashboardContent
                just skips the outer gutter padding/gap for them (they pad
                themselves from --shell-gutter). */}
            <DashboardContent
              styling={config.styling}
              fullBleed={isVideoEditorPath}
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
