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

  // No styling context (rendered outside the AdminStylingProvider) → keep the
  // original static look.
  if (!styling) {
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

  // Full-bleed workspaces (noPadding) manage their own inner padding and surface,
  // so we skip the outer gutter padding/canvas tint here — but still emit the
  // styling contract (--shell-gutter, data-flat, card border vars) so those
  // screens track the setting and go flat at 0, exactly like the padded pages.
  return (
    <div
      data-content-styling=""
      data-flat={isFlat ? "true" : undefined}
      className={cn(
        noPadding ? "min-w-0 max-w-full" : "min-w-0 max-w-full flex-1",
        // Only keep the default canvas tint when no explicit color is resolved.
        noPadding || background ? undefined : "bg-foreground/8 dark:bg-background",
        className
      )}
      style={
        {
          "--shell-gutter": `${styling.gutter}px`,
          // Full-bleed workspaces pad themselves from --shell-gutter internally.
          padding: noPadding ? 0 : "var(--shell-gutter)",
          backgroundColor: noPadding ? undefined : background,
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
