"use client"

import { AdminCard } from "@/components/admin/layout/dashboard/AdminCard"

interface AdminLayoutProps {
  children: React.ReactNode
  noPadding?: boolean
}

/**
 * Simple layout wrapper for admin pages
 * Authentication is handled by the root /app/admin/layout.tsx
 * This component is just for consistent layout structure
 */
export function AdminLayout({
  children,
  noPadding = false,
}: AdminLayoutProps) {
  return <div className={noPadding ? "" : "p-3.5 lg:px-6 lg:py-6"}>{children}</div>
}

// Re-export admin components
export { AdminCard }
