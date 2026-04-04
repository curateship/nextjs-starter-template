'use client'

import { SiteSwitcherProvider } from "@/components/admin/providers/site-switcher-provider"
import { AppSidebar } from "@/components/admin/layout/sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/admin/layout/sidebar/Sidebar"
import { ThemeProvider } from "next-themes"
import { AdminFontProvider } from "@/components/admin/providers/admin-font-provider"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"

interface AdminClientShellProps {
  children: React.ReactNode
  fontFamily: string
  secondaryFontFamily: string
  initialSites: SiteWithTheme[]
  pageSize: number
  user: { name: string; email: string }
}

export function AdminClientShell({
  children,
  fontFamily,
  secondaryFontFamily,
  initialSites,
  pageSize,
  user,
}: AdminClientShellProps) {
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
        <div className="admin-layout min-h-screen bg-background">
          <SidebarProvider className="h-screen">
            <AppSidebar user={user} />
            <SidebarInset>
              {children}
            </SidebarInset>
          </SidebarProvider>
        </div>
      </SiteSwitcherProvider>
    </ThemeProvider>
  )
}
