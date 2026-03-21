"use client"

import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { AdminCard } from "@/components/admin/layout/dashboard/AdminCard"

interface AdminLayoutProps {
  children: React.ReactNode
  headerActions?: React.ReactNode
  noPadding?: boolean
}

/**
 * Simple layout wrapper for admin pages
 * Authentication is handled by the root /app/admin/layout.tsx
 * This component is just for consistent layout structure
 */
export function AdminLayout({
  children,
  headerActions,
  noPadding = false,
}: AdminLayoutProps) {
  return (
    <div className={noPadding ? "" : "px-5 pt-[15px]"}>
      {headerActions && (
        <div className="mb-4">
          {headerActions}
        </div>
      )}
      {children}
    </div>
  )
}

// Re-export admin components
export { AdminPageHeader, AdminCard }