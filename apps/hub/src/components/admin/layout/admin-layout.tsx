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
  // Outer padding follows the runtime "Content spacing" (gutter) setting when
  // present (Admin → Settings → Appearance), falling back to the default gutter.
  return (
    <div
      className="min-w-0 max-w-full"
      style={noPadding ? undefined : { padding: "var(--shell-gutter, 1.5rem)" }}
    >
      {children}
    </div>
  )
}

// Re-export admin components
export { AdminCard }
