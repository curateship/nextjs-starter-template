import * as React from "react"

import { cn } from "@/lib/utils"
import { resolveBackground, type ShellStyling } from "@/lib/ai-video"

export function DashboardContent({
  className,
  styling,
  fullBleed,
  ...props
}: React.ComponentProps<"main"> & {
  styling?: ShellStyling
  /**
   * Full-screen workspaces manage their own inner padding, so we skip the outer
   * gutter padding/gap here — but still emit the styling contract (--shell-gutter,
   * data-flat, card border vars, background) so those screens track the setting
   * and go flat at 0, exactly like the padded card pages.
   */
  fullBleed?: boolean
}) {
  // No styling (e.g. rendered outside the shell, or the full-viewport editor) →
  // keep the original defaults.
  if (!styling) {
    return (
      <main
        className={cn(
          "min-w-0 w-full flex-1 overflow-auto bg-muted/60 p-3 space-y-4 sm:p-4 sm:space-y-6 md:p-6",
          className
        )}
        {...props}
      />
    )
  }

  const background = resolveBackground(styling.content)
  const borderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })
  const isFlat = styling.gutter === 0

  return (
    <main
      data-content-styling=""
      data-flat={isFlat ? "true" : undefined}
      className={cn(
        "flex min-w-0 w-full flex-1 flex-col",
        fullBleed ? "overflow-hidden" : "overflow-auto",
        // Only fall back to the muted canvas when no explicit color is resolved.
        background ? undefined : "bg-muted/60",
        className
      )}
      style={
        {
          // --shell-gutter cascades to nested card-stacking containers
          // (CardGroup, DashboardRow, settings page) so the gap *between* cards
          // tracks the gutter too — not just the outer padding.
          "--shell-gutter": `${styling.gutter}px`,
          // Full-bleed workspaces pad themselves from --shell-gutter internally.
          padding: fullBleed ? 0 : "var(--shell-gutter)",
          gap: fullBleed ? 0 : "var(--shell-gutter)",
          backgroundColor: background,
          // Consumed by the scoped card rules in theme.css.
          "--shell-card-border-width": String(styling.cardBorderWidth),
          ...(borderColor ? { "--shell-card-border-color": borderColor } : {}),
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export function DashboardRow({
  className,
  style,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("flex flex-col xl:flex-row", className)}
      // Falls back to the previous gap-4 (1rem) outside a styled content area.
      style={{ gap: "var(--shell-gutter, 1rem)", ...style }}
      {...props}
    />
  )
}
