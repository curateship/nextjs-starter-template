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
  children?: React.ReactNode
}) {
  return (
    <div className={ONE_LINE_TITLE}>
    <BlockCard editable={false} kind={storageId} title={title} icon={icon}>
      {meta || badge || action ? (
        <BlockHeadingActions>
          {meta ? <span className="truncate text-sm text-muted-foreground">{meta}</span> : null}
          {badge}
          {action}
        </BlockHeadingActions>
      ) : null}
      {/* Fields sit on the tile's white, so a box to type in never looks like part of the grey. */}
      <div className="grid min-h-0 gap-4 overflow-y-auto p-3 [scrollbar-width:thin]">{children}</div>
    </BlockCard>
    </div>
  )
}

/** A row of buttons under what they act on, wrapping in a narrow panel. */
export function PanelCardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}
