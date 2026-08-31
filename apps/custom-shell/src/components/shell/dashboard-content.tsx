import * as React from "react"

import { cn } from "@/lib/utils"
import { resolveBackground, type ShellStyling } from "@/lib/custom-shell"
import { DASHBOARD_CARD_HEADER_HEIGHT_PX } from "@/lib/layout/dashboard-card-header"
import { pageGutter } from "@/lib/layout/shell-gutter"

export function DashboardContent({
  className,
  styling,
  pageTitle,
  children,
  ...props
}: React.ComponentProps<"main"> & {
  styling?: ShellStyling
  pageTitle?: string
}) {
  // No styling (e.g. rendered outside the shell) → keep the original defaults.
  if (!styling) {
    return (
      <main
        data-focus-return=""
        data-scroll-restoration-id="dashboard-content"
        tabIndex={-1}
        className={cn(
          "flex min-w-0 w-full flex-1 flex-col overflow-auto bg-muted/60 outline-none",
          className
        )}
        style={{
          "--dashboard-card-header-height": `${DASHBOARD_CARD_HEADER_HEIGHT_PX}px`,
          padding: pageGutter,
          gap: pageGutter,
        } as React.CSSProperties}
        {...props}
      >
        {pageTitle ? <h1 className="sr-only">{pageTitle}</h1> : null}
        {children}
      </main>
    )
  }

  const background = resolveBackground(styling.content)
  const borderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })
  const isFlat = styling.gutter === 0

  return (
    <main
      data-focus-return=""
      data-scroll-restoration-id="dashboard-content"
      tabIndex={-1}
      data-content-styling=""
      data-flat={isFlat ? "true" : undefined}
      className={cn(
        "flex min-w-0 w-full flex-1 flex-col overflow-auto outline-none",
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
        "--dashboard-card-header-height": `${DASHBOARD_CARD_HEADER_HEIGHT_PX}px`,
        padding: "var(--shell-gutter)",
        gap: "var(--shell-gutter)",
        backgroundColor: background,
        // Consumed by the scoped card rules in theme.css.
        "--shell-card-border-width": String(styling.cardBorderWidth),
        ...(borderColor ? { "--shell-card-border-color": borderColor } : {}),
      } as React.CSSProperties}
      {...props}
    >
      {pageTitle ? <h1 className="sr-only">{pageTitle}</h1> : null}
      {children}
    </main>
  )
}
