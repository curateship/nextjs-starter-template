"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { SiteProvider } from "@/contexts/site-context"
import { AppSidebar } from "@/components/admin/layout/sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/admin/layout/sidebar/Sidebar"
import { ThemeProvider } from "next-themes"
import { FontProvider } from "@/components/frontend/layout/font-provider"
import { getAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [fontFamily, setFontFamily] = useState("urbanist")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("urbanist")
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        router.push('/auth/login?redirect=/admin')
        return
      }

      setIsAuthenticated(true)
    }

    checkAuth()
  }, [router])

  useEffect(() => {
    async function loadAdminSettings() {
      const result = await getAdminSettingsAction()

      if (result.success && result.data) {
        const settings = result.data.settings
        setFontFamily(settings.font_family || "urbanist")
        setSecondaryFontFamily(settings.secondary_font_family || "urbanist")
      }
    }

    if (isAuthenticated) {
      loadAdminSettings()
    }
  }, [isAuthenticated])

  // Don't render anything until auth check completes
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="admin-theme"
    >
      <FontProvider
        fontFamily={fontFamily}
        secondaryFontFamily={secondaryFontFamily}
      />
      <SiteProvider>
        <div className="min-h-screen bg-background">
          <SidebarProvider className="h-screen">
            <AppSidebar />
            <SidebarInset>
              {children}
            </SidebarInset>
          </SidebarProvider>
        </div>
      </SiteProvider>
    </ThemeProvider>
  )
}