"use client"

import { SiteProvider } from "@/contexts/site-context"
import { AppSidebar } from "@/components/admin/sidebar/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/admin/sidebar/sidebar"
import { StickyHeader } from "@/components/admin/dashboard/sticky-header"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
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
  )
}