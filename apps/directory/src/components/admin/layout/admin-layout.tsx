"use client"

import * as React from "react"

import { AdminCard } from "@/components/admin/layout/dashboard/AdminCard"
import { useAdminStyling } from "@/components/admin/layout/settings/admin-styling-provider"
import { resolveBackground } from "@/lib/utils/admin-styling"
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
 *
 * When the AdminStylingProvider is present, the canvas gutter, background, and
 * card borders are driven at runtime by the Settings → Styling controls via CSS
 * variables (see theme.css). Falls back to the original static look otherwise.
 */
export function AdminLayout({
  children,
  noPadding = false,
  className,
}: AdminLayoutProps) {
  const stylingContext = useAdminStyling()
  const styling = stylingContext?.styling

  if (!styling || noPadding) {
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

  const background = resolveBackground(styling.content)
  const borderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })
  const isFlat = styling.gutter === 0

  return (
    <div
      data-content-styling=""
      data-flat={isFlat ? "true" : undefined}
      className={cn(
        "min-w-0 max-w-full flex-1",
        // Only keep the default canvas tint when no explicit color is resolved.
        background ? undefined : "bg-foreground/8 dark:bg-background",
        className
      )}
      style={
        {
          "--shell-gutter": `${styling.gutter}px`,
          padding: "var(--shell-gutter)",
          backgroundColor: background,
          "--shell-card-border-width": String(styling.cardBorderWidth),
          ...(borderColor ? { "--shell-card-border-color": borderColor } : {}),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}

// Re-export admin components
export { AdminCard }
