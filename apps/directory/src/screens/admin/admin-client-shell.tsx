'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { SiteSwitcherProvider, useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { DashboardHeaderActionsSlotProvider } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { AppSidebar } from "@/components/admin/layout/sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/admin/layout/sidebar/Sidebar"
import { ThemeProvider } from "next-themes"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { updateAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"
import { clampAdminSidebarWidth } from "@/lib/utils/admin-sidebar-width"
import { toCdnUrl } from "@/lib/utils/cdn"
import { usePathname } from "@/lib/navigation-client"
import { toast } from "sonner"

interface AdminClientShellProps {
  children: React.ReactNode
  initialSites: SiteWithTheme[]
  pageSize: number
  initialSidebarWidth: number
  user: { name: string; email: string; avatar?: string }
}

function setAdminIcon(rel: string, href: string, fallbackHref = "") {
  const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`))
  const existing = links.find((link) => link.dataset.adminSiteIcon === rel) ?? links[0]
  const nextHref = href || fallbackHref

  if (!nextHref) {
    links.forEach((link) => link.remove())
    return
  }

  const link = existing ?? document.createElement("link")
  link.rel = rel
  link.href = nextHref
  link.setAttribute("data-admin-site-icon", rel)
  links.forEach((candidate) => {
    if (candidate !== link) candidate.remove()
  })

  if (!existing) document.head.appendChild(link)
}

function AdminDocumentMeta() {
  const { currentSite } = useSiteSwitcher()
  const pathname = usePathname()

  useEffect(() => {
    if (!currentSite) {
      document.title = "Admin"
      setAdminIcon("icon", "", "/globe.svg")
      setAdminIcon("apple-touch-icon", "")
      return
    }

    const siteTitle = typeof currentSite.settings?.site_title === "string"
      ? currentSite.settings.site_title.trim()
      : ""
    const favicon = typeof currentSite.settings?.favicon === "string"
      ? currentSite.settings.favicon.trim()
      : ""

    document.title = `${siteTitle || currentSite.name} Admin`
    const faviconUrl = favicon ? toCdnUrl(favicon) : ""
    setAdminIcon("icon", faviconUrl, "/globe.svg")
    setAdminIcon("apple-touch-icon", faviconUrl)
  }, [currentSite, pathname])

  return null
}

export function AdminClientShell({
  children,
  initialSites,
  pageSize,
  initialSidebarWidth,
  user,
}: AdminClientShellProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => clampAdminSidebarWidth(initialSidebarWidth))
  const savedSidebarWidthRef = useRef(sidebarWidth)
  const sidebarWidthSaveQueueRef = useRef(Promise.resolve())
  const sidebarWidthSaveVersionRef = useRef(0)

  const handleSidebarWidthCommit = useCallback((width: number) => {
    const nextWidth = clampAdminSidebarWidth(width)
    const version = sidebarWidthSaveVersionRef.current + 1
    sidebarWidthSaveVersionRef.current = version
    setSidebarWidth(nextWidth)

    const request = sidebarWidthSaveQueueRef.current.then(async () => {
      const result = await updateAdminSettingsAction({ sidebar_width: nextWidth })
      if (result.error) throw new Error(result.error)
    })
    sidebarWidthSaveQueueRef.current = request.catch(() => undefined)

    void request
      .then(() => {
        savedSidebarWidthRef.current = nextWidth
      })
      .catch((error) => {
        if (version !== sidebarWidthSaveVersionRef.current) return
        setSidebarWidth(savedSidebarWidthRef.current)
        toast.error(error instanceof Error ? error.message : "Failed to save sidebar width")
      })
  }, [])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="admin-theme"
    >
      <SiteSwitcherProvider initialSites={initialSites} pageSize={pageSize}>
        <AdminDocumentMeta />
        <DashboardHeaderActionsSlotProvider>
          <div className="admin-layout min-h-screen bg-background">
            <SidebarProvider
              className="h-screen"
              sidebarWidth={sidebarWidth}
              onSidebarWidthCommit={handleSidebarWidthCommit}
            >
              <AppSidebar user={user} />
              <SidebarInset>
                {children}
              </SidebarInset>
            </SidebarProvider>
          </div>
        </DashboardHeaderActionsSlotProvider>
      </SiteSwitcherProvider>
    </ThemeProvider>
  )
}
