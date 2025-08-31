"use client"

import { SiteProvider } from "@/contexts/site-context"
import { AppSidebar } from "@/components/admin/layout/sidebar/AppSidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/admin/layout/sidebar/Sidebar"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { ThemeProvider } from "next-themes"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="admin-theme"
    >
      <SiteProvider>
        <div className="min-h-screen bg-background">
          <SidebarProvider className="h-screen">
            <AppSidebar />
            <SidebarInset>
              <StickyHeader>
                <SidebarTrigger className="-ml-1" />
              </StickyHeader>
              <div className="flex flex-1 flex-col gap-4 p-4 pt-6 h-full">
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </SiteProvider>
    </ThemeProvider>
  )
}