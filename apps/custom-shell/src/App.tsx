import * as React from "react"

import { Dashboard2Content } from "@/components/dashboard2"
import { DashboardContent } from "@/components/demo/dashboard-content"
import { FeedbackModal } from "@/components/feedback-modal"
import { FeedbackPage } from "@/components/feedback-page"
import {
  getMediaTabFromPath,
  MediaLibraryPage,
} from "@/components/media-library-page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
import { AppSidebar } from "@/pages/dashboard/sidebar/sidebar"
import { StickyHeader } from "@/pages/dashboard/sticky-header/sticky-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  createDefaultShellConfig,
  ensureDefaultShellNavigation,
  isShellItem,
  renderShellIcon,
  type ShellConfig,
  type ShellItem,
} from "@/lib/custom-shell"
import {
  getShellSettingsErrorMessage,
  loadShellSettings,
  saveShellSettings,
} from "@/lib/shell-settings-api"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  login,
  logout,
  type AuthUser,
} from "@/lib/auth-api"

type SaveStatus = "idle" | "saving" | "saved"
type AuthStatus = "loading" | "authenticated" | "unauthenticated"

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

function getDashboardPaths(config: ShellConfig) {
  return config.topNavigation.map((item) => item.href)
}

function isActivePath(href: string, currentPath: string) {
  return (
    href === currentPath ||
    (href !== "/" && currentPath.startsWith(`${href}/`))
  )
}

function findActiveSectionItem(
  items: ShellItem[],
  currentPath: string
) {
  return items.find(
    (item) =>
      item.children?.length &&
      (isActivePath(item.href, currentPath) ||
        item.children.some((child) => isActivePath(child.href, currentPath)))
  )
}

function getStickyHeaderNavLinks(
  config: ShellConfig,
  currentPath: string
) {
  const dashboardPaths = getDashboardPaths(config)

  if (currentPath === "/" || dashboardPaths.includes(currentPath)) {
    return config.topNavigation
      .filter((item) => item.visible)
      .map((item) => ({
        label: item.label,
        href: `#${item.href}`,
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
  const [config, setConfig] = React.useState(createDefaultShellConfig)
  const [currentPath, setCurrentPath] = React.useState(getCurrentHashPath)
  const [settingsError, setSettingsError] = React.useState<string | null>(null)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>("loading")
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null)
  const [authError, setAuthError] = React.useState<string | null>(null)
  const [loginEmail, setLoginEmail] = React.useState("")
  const [loginPassword, setLoginPassword] = React.useState("")
  const [loginLoading, setLoginLoading] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedbackRefreshToken, setFeedbackRefreshToken] = React.useState(0)

  React.useEffect(() => {
    let active = true

    loadCurrentUser()
      .then((user) => {
        if (!active) return
        setAuthUser(user)
        setAuthStatus(user ? "authenticated" : "unauthenticated")
      })
      .catch((error) => {
        if (!active) return
        setAuthError(getAuthErrorMessage(error))
        setAuthStatus("unauthenticated")
      })

    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (authStatus !== "authenticated") {
      return
    }

    let active = true

    loadShellSettings()
      .then(({ settings }) => {
        if (!active) return
        setSettingsError(null)
        if (settings) {
          const fallback = createDefaultShellConfig()
          setConfig(ensureDefaultShellNavigation({
            appName: settings.appName ?? fallback.appName,
            workspaceName: settings.workspaceName ?? fallback.workspaceName,
            workspacePlan: settings.workspacePlan ?? fallback.workspacePlan,
            topNavigation: Array.isArray(settings.topNavigation)
              ? settings.topNavigation
              : fallback.topNavigation,
            sections: Array.isArray(settings.sections)
              ? settings.sections
              : fallback.sections,
          }))
        }
      })
      .catch((error) => {
        if (!active) return
        setSettingsError(getShellSettingsErrorMessage(error))
      })

    return () => {
      active = false
    }
  }, [authStatus])

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(getCurrentHashPath())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
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

  const handleLogin = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setAuthError(null)
      setLoginLoading(true)

      try {
        const user = await login(loginEmail, loginPassword)
        setAuthUser(user)
        setAuthStatus("authenticated")
        setLoginPassword("")
      } catch (error) {
        setAuthError(getAuthErrorMessage(error))
      } finally {
        setLoginLoading(false)
      }
    },
    [loginEmail, loginPassword]
  )

  const handleLogout = React.useCallback(async () => {
    try {
      await logout()
      setAuthUser(null)
      setAuthStatus("unauthenticated")
      setLoginPassword("")
      setAuthError(null)
      setSettingsError(null)
    } catch (error) {
      setSettingsError(getAuthErrorMessage(error))
    }
  }, [])

  const handleFeedbackCreated = React.useCallback(() => {
    setFeedbackRefreshToken((current) => current + 1)
  }, [])

  const navLinks = getStickyHeaderNavLinks(config, currentPath)
  const dashboardPaths = getDashboardPaths(config)

  const isDashboardRoute =
    currentPath === "/" || dashboardPaths.includes(currentPath)
  const isSettingsRoute =
    currentPath === "/admin/settings" ||
    currentPath.startsWith("/admin/settings/")
  const isFeedbackRoute = currentPath === "/admin/feedback"
  const isMediaRoute =
    currentPath === "/admin/media" || currentPath.startsWith("/admin/media/")

  if (authStatus === "loading") {
    return <div className="min-h-screen bg-background" />
  }

  if (authStatus !== "authenticated" || !authUser) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm"
        >
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Sign in to Custom Shell</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your Custom Shell account.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </div>
            {authError ? (
              <p className="text-sm text-destructive">{authError}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loginLoading}>
              {loginLoading ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </form>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider className="h-screen">
        <AppSidebar config={config} user={authUser} onLogout={handleLogout} />
        <SidebarInset>
          <StickyHeader
            navLinks={navLinks}
            onOpenFeedback={() => setFeedbackOpen(true)}
          />
          {isDashboardRoute ? (
            <Dashboard2Content />
          ) : (
            <DashboardContent>
              {isSettingsRoute ? (
                <SettingsPage
                  activeTab={getSettingsTabFromPath(currentPath)}
                  config={config}
                  settingsError={settingsError}
                  saveStatus={saveStatus}
                  onConfigChange={handleConfigChange}
                  onSaveConfig={handleSaveConfig}
                />
              ) : null}
              {isFeedbackRoute ? (
                <FeedbackPage
                  refreshToken={feedbackRefreshToken}
                  onOpenFeedback={() => setFeedbackOpen(true)}
                />
              ) : null}
              {isMediaRoute ? (
                <MediaLibraryPage activeTab={getMediaTabFromPath(currentPath)} />
              ) : null}
            </DashboardContent>
          )}
        </SidebarInset>
      </SidebarProvider>
      <FeedbackModal
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onCreated={handleFeedbackCreated}
      />
    </div>
  )
}

export default App
