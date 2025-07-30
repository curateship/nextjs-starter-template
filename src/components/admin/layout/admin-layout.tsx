"use client"

import { AppSidebar } from "@/components/admin/sidebar/app-sidebar"
import { StickyHeader } from "@/components/admin/dashboard/sticky-header"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/dashboard/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/admin/sidebar/sidebar"

interface AdminLayoutProps {
  children: React.ReactNode
  headerTitle?: string
  headerSubtitle?: string
  headerActions?: React.ReactNode
  breadcrumbItems?: Array<{
    href?: string
    label: string
    isPage?: boolean
  }>
}

export function AdminLayout({
  children,
  headerTitle = "Admin Dashboard",
  headerSubtitle = "Manage your application",
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
        <StickyHeader 
          title={headerTitle} 
          subtitle={headerSubtitle}
        >
          {headerActions}
        </StickyHeader>
        
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbItems.map((item, index) => (
                  <div key={index} className="flex items-center">
                    <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                      {item.isPage ? (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={item.href || "#"}>
                          {item.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbItems.length - 1 && (
                      <BreadcrumbSeparator className="hidden md:block" />
                    )}
                  </div>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}