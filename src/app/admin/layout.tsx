"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { SiteProvider } from "@/contexts/site-context"
import { AppSidebar } from "@/components/admin/layout/sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/admin/layout/sidebar/Sidebar"
import { ThemeProvider } from "next-themes"
import { AdminFontProvider } from "@/components/admin/layout/admin-font-provider"
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

      // Verify super_admin role (middleware handles this too, but double-check)
      const role = user.app_metadata?.role
      if (role !== 'super_admin') {
        router.push('/user-pages')
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
    return null
  }

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
      <SiteProvider>
        <div className="admin-layout min-h-screen bg-background">
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