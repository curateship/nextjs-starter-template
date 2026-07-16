"use client"

import { AdminCard } from "@/components/admin/layout/dashboard/AdminCard"
import { cn } from "@/lib/utils/tailwind"

interface AdminLayoutProps {
  children: React.ReactNode
  noPadding?: boolean
  className?: string
}

/**
 * Simple layout wrapper for admin pages
 * Authentication is handled by the root /app/admin/layout.tsx
 * This component owns the admin page canvas: a full-height light gray surface
 * with a 12px gutter that borderless white cards sit on.
 */
export function AdminLayout({
  children,
  noPadding = false,
  className,
}: AdminLayoutProps) {
  return (
    <div
      className={cn(
        noPadding
          ? "min-w-0 max-w-full"
          : "min-w-0 max-w-full flex-1 bg-foreground/8 p-3 dark:bg-background",
        className
      )}
    >
      {children}
    </div>
  )
}

// Re-export admin components
export { AdminCard }
