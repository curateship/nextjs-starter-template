"use client"

import { AdminPageHeader } from "@/components/admin/dashboard/admin-page-header"
import { AdminCard } from "@/components/admin/dashboard/admin-card"
import { ProductBasicBlock as BasicBlock } from "@/components/admin/product-builder/blocks/ProductBasicBlock"

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