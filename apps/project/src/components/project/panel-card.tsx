import * as React from "react"

import { ONE_LINE_TITLE } from "@/components/project/notes/project-block-card"
import { BlockCard, BlockHeadingActions } from "@/components/shared/notes/block-card"
import { cn } from "@/lib/utils"

/**
 * A folding card on an employee's My dashboard: "Today's check-in" with a
 * Late badge, "My week · Oct 12 to 13", Time off, Inbox. Since 9 Nov 2026 it
 * is the shell's block card (task "Shell look/three-panel-shell-look", Tyler:
 * "Restyle the cards only"): the frosted grey box, a 57px heading whose title
 * folds it, and what it holds on one white tile. The muted note, the badge
 * and the card's own button sit in the heading's right end while it is open.
 * Open or shut is remembered in this browser under `storageId`. These cards
 * are not "/" blocks, so there is no Delete block.
 */
export function PanelCard({
  storageId,
  icon,
  title,
  meta,
  badge,
  action,
  top,
  children,
}: {
  /** Plain characters only; it names the card's remembered open or shut state. */
  storageId: string
  icon: React.ReactNode
  title: string
  /** Muted, at the heading's right: "4", "Oct 12 to 13". */
  meta?: React.ReactNode
  /** Beside the note, such as Late. */
  badge?: React.ReactNode
  /** A button of the card's own, at the heading's right end. */
  action?: React.ReactNode
  /** Edge to edge at the top of the tile, over the padded rows: a row of tabs. */
  top?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div data-project-panel-card="" className={ONE_LINE_TITLE}>
    <BlockCard editable={false} kind={storageId} title={title} icon={icon}>
      {meta || badge || action ? (
        <BlockHeadingActions>
          {meta ? <span className="truncate text-sm text-muted-foreground">{meta}</span> : null}
          {badge}
          {action}
        </BlockHeadingActions>
      ) : null}
      {top}
      {/* Fields sit on the tile's white, so a box to type in never looks like part of the grey. */}
      <div className="grid min-h-0 gap-4 overflow-y-auto p-3 [scrollbar-width:thin]">{children}</div>
    </BlockCard>
    </div>
  )
}

/**
 * Panel cards -> Opacity for these cards. theme.css finds a side panel's first
 * block only inside a page's writing area, and these cards sit straight in the
 * panel, so the first of them gets the same rule here (UI standard, "A side
 * panel's body"; Tyler, 13 Nov 2026: "the right panel first block not wiring
 * to the opacity setting is a persistent problem"). "First" is the first card
 * among the panel's own children, whatever comes before it, such as the
 * Daily card's greeting. Drawn once by the panel that holds the cards.
 */
export const PANEL_CARD_FIRST_STYLES = `
  [data-side-panel-body] > [data-project-panel-card]:not([data-project-panel-card] ~ [data-project-panel-card]) [data-block-card] {
    background: color-mix(
      in oklab,
      color-mix(in oklab, var(--muted) var(--shell-block-shade, 50%), var(--card))
        calc(0.6 * var(--shell-panel-first-opacity, 100%)),
      transparent
    );
    backdrop-filter: blur(var(--shell-panel-first-blur, 12px));
  }
  [data-side-panel-body] > [data-project-panel-card]:not([data-project-panel-card] ~ [data-project-panel-card]) [data-block-card] [data-block-tile] {
    --block-body: color-mix(
      in oklab,
      color-mix(in oklab, var(--muted) var(--shell-block-body-shade, 0%), var(--card))
        var(--shell-panel-first-opacity, 100%),
      transparent
    );
  }
`

/** A row of buttons under what they act on, wrapping in a narrow panel. */
export function PanelCardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}
