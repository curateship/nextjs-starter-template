"use client"

import { AppSidebar } from "@/components/admin/layout/sidebar/app-sidebar"
import { StickyHeader } from "@/components/admin/layout/dashboard/sticky-header"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/admin-page-header"
import { AdminCard } from "@/components/admin/layout/dashboard/admin-card"
import { BasicBlock } from "@/components/admin/modules/products/BasicBlock"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/admin/layout/sidebar/sidebar"


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