"use client"

import { AdminPageHeader } from "@/components/admin/layout/dashboard/admin-page-header"
import { AdminCard } from "@/components/admin/layout/dashboard/admin-card"
import { BasicBlock } from "@/components/admin/layout/product-builder/BasicBlock"

interface AdminLayoutProps {
  children: React.ReactNode
  headerActions?: React.ReactNode
}

export function AdminLayout({
  children,
  headerActions,
}: AdminLayoutProps) {
  return (
    <>
      {headerActions && (
        <div className="mb-4">
          {headerActions}
        </div>
      )}
      {children}
    </>
  )
}

// Re-export admin components
export { AdminPageHeader, AdminCard, BasicBlock }