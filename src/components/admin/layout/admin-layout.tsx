"use client"

import { AppSidebar } from "@/components/admin/sidebar/app-sidebar"
import { StickyHeader } from "@/components/admin/dashboard/sticky-header"
import { BreadcrumbNavigation } from "@/components/admin/dashboard/breadcrumb"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/admin/sidebar/sidebar"

interface AdminLayoutProps {
  children: React.ReactNode
  headerActions?: React.ReactNode
  breadcrumbItems?: Array<{
    href?: string
    label: string
    isPage?: boolean
  }>
}

export function AdminLayout({
  children,
  headerActions,
  breadcrumbItems = [
    { href: "#", label: "Building Your Application" },
    { label: "Data Fetching", isPage: true }
  ]
}: AdminLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <StickyHeader>
          <SidebarTrigger className="-ml-1" />
          {headerActions}
        </StickyHeader>
        
        <header className="flex h-16 shrink-0 items-center justify-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <BreadcrumbNavigation items={breadcrumbItems} />
          </div>
        </header>
        
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 items-center justify-center">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}