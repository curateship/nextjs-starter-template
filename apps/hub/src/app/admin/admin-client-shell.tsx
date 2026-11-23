'use client'

import { useEffect } from "react"
import { SiteSwitcherProvider, useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { DashboardHeaderActionsSlotProvider } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { AppSidebar } from "@/components/admin/layout/sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/admin/layout/sidebar/Sidebar"
import { ThemeProvider } from "next-themes"
import { AdminFontProvider } from "@/components/admin/layout/providers/admin-font-provider"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import {
  createDefaultStyling,
  getModalStyleVars,
  MODAL_STYLE_VAR_NAMES,
  resolveBackground,
  type ShellModalStyling,
  type ShellStyling,
} from "@/lib/admin-styling"

interface AdminClientShellProps {
  children: React.ReactNode
  fontFamily: string
  secondaryFontFamily: string
  initialSites: SiteWithTheme[]
  pageSize: number
  styling?: ShellStyling
  user: { name: string; email: string; avatar?: string }
}

// Modal styling portals to <body> (outside the shell subtree), so it is applied
// as CSS variables on the document root where it can reach the dialog.
function useModalStyleVars(modal: ShellModalStyling) {
  useEffect(() => {
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

function setAdminIcon(rel: string, href: string) {
  const selector = `link[data-admin-site-icon="${rel}"]`
  const existing = document.querySelector<HTMLLinkElement>(selector)

  if (!href) {
    existing?.remove()
    return
  }

  const link = existing ?? document.createElement("link")
  link.rel = rel
  link.href = href
  link.setAttribute("data-admin-site-icon", rel)

  if (!existing) document.head.appendChild(link)
}

function AdminDocumentMeta() {
  const { currentSite } = useSiteSwitcher()

  useEffect(() => {
    if (!currentSite) {
      document.title = "Admin"
      setAdminIcon("icon", "")
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
    setAdminIcon("icon", favicon)
    setAdminIcon("apple-touch-icon", favicon)
  }, [currentSite])

  return null
}

export function AdminClientShell({
  children,
  fontFamily,
  secondaryFontFamily,
  initialSites,
  pageSize,
  styling,
  user,
}: AdminClientShellProps) {
  const resolvedStyling = styling ?? createDefaultStyling()
  useModalStyleVars(resolvedStyling.modal)

  const isFlat = resolvedStyling.gutter === 0
  // Recolors both the sidebar rail and the sticky header (both use bg-sidebar).
  // Opaque so they render the same color regardless of what sits behind them.
  const chromeBackground = resolveBackground(resolvedStyling.chrome, {
    opaque: true,
  })
  const contentBackground = resolveBackground(resolvedStyling.content)
  const cardBorderColor = resolveBackground(resolvedStyling.cardBorderColor, {
    base: "--muted-foreground",
  })

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="admin-theme"
    >
      <AdminFontProvider
        fontFamily={fontFamily}
        secondaryFontFamily={secondaryFontFamily}
      />
      <SiteSwitcherProvider initialSites={initialSites} pageSize={pageSize}>
        <AdminDocumentMeta />
        <DashboardHeaderActionsSlotProvider>
          <div
            className="admin-layout min-h-screen bg-background"
            style={
              chromeBackground
                ? ({ "--sidebar": chromeBackground } as React.CSSProperties)
                : undefined
            }
          >
            <SidebarProvider className="h-screen">
              <AppSidebar user={user} />
              <SidebarInset
                data-content-styling=""
                data-flat={isFlat ? "true" : undefined}
                style={
                  {
                    // Cascades to AdminLayout padding + CardGroup gap so the
                    // gutter drives both outer padding and card spacing.
                    "--shell-gutter": `${resolvedStyling.gutter}px`,
                    "--shell-card-border-width": String(
                      resolvedStyling.cardBorderWidth
                    ),
                    ...(cardBorderColor
                      ? { "--shell-card-border-color": cardBorderColor }
                      : {}),
                    ...(contentBackground
                      ? { backgroundColor: contentBackground }
                      : {}),
                  } as React.CSSProperties
                }
              >
                {children}
              </SidebarInset>
            </SidebarProvider>
          </div>
        </DashboardHeaderActionsSlotProvider>
      </SiteSwitcherProvider>
    </ThemeProvider>
  )
}
