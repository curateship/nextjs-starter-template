import * as React from "react"

import { cn } from "@/lib/utils"
import { resolveBackground, type ShellStyling } from "@/lib/custom-shell"

export function DashboardContent({
  className,
  styling,
  ...props
}: React.ComponentProps<"main"> & { styling?: ShellStyling }) {
  // No styling (e.g. rendered outside the shell) → keep the original defaults.
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
        "flex min-w-0 w-full flex-1 flex-col overflow-auto",
        // Only fall back to the muted canvas when no explicit color is resolved.
        background ? undefined : "bg-muted/60",
        className
      )}
      style={{
        // This gap is the only thing spacing a page's blocks: a page renders
        // its cards and tables straight into here, with no wrapper of its own.
        // --shell-gutter also cascades to the containers that stack cards
        // inside a page (CardGroup, the settings columns) so those match too.
        "--shell-gutter": `${styling.gutter}px`,
        padding: "var(--shell-gutter)",
        gap: "var(--shell-gutter)",
        backgroundColor: background,
        // Consumed by the scoped card rules in theme.css.
        "--shell-card-border-width": String(styling.cardBorderWidth),
        ...(borderColor ? { "--shell-card-border-color": borderColor } : {}),
      } as React.CSSProperties}
      {...props}
    />
  )
}
