"use client"

import { AppSidebar } from "@/components/admin/sidebar/app-sidebar"
import { StickyHeader } from "@/components/admin/dashboard/sticky-header"
import { AdminPageHeader } from "@/components/admin/dashboard/admin-page-header"
import { AdminCard } from "@/components/admin/dashboard/admin-card"
import { BasicBlock } from "@/components/admin/content-type/products/BasicBlock"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/admin/sidebar/sidebar"


interface AdminLayoutProps {
  children: React.ReactNode
  headerActions?: React.ReactNode
}

export function AdminLayout({
  children,
  headerActions,
}: AdminLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <StickyHeader>
          <SidebarTrigger className="-ml-1" />
          {headerActions}
        </StickyHeader>
        

        
        <div className="flex flex-1 flex-col gap-4 p-4 pt-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

// Re-export admin components
export { AdminPageHeader, AdminCard, BasicBlock }