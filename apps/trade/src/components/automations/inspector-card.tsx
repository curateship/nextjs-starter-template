import * as React from "react"

import { PanelBox, PanelCard } from "@/components/shared/panel-card"
import { cn } from "@/lib/utils"

/*
 * The two pieces every node's settings panel is built from.
 *
 * Their own file rather than the inspector's, because a node points at its
 * panel and the inspector reads that pointer — so a panel reaching back into
 * the inspector for these would be a circle. True of the shell's own nodes and
 * of one an app adds alike.
 */

/**
 * A titled card wrapping one group of node settings — the inspector's version
 * of the modal "every section is its own card" rule. Node tasks compose their
 * field panels from one or more of these.
 *
 * A titled card folds away: hovering it reveals an arrow in the heading,
 * clicking the heading opens and shuts the fields, and the choice is remembered
 * per card in this browser. It is a `PanelCard`, so it looks and behaves as
 * every other side panel card does.
 */
export function InspectorCard({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  // The side panels' own card, heading and all (Tyler, 10 Nov 2026: "The
  // automation right panel HAS to match the ui"), so its 15px heading, 16px
  // spacing and Settings → Styling → Panel cards look are the same as every
  // other panel card's. The grey, the white fields on it and the fold come
  // with it.
  if (!title)
    return (
      <PanelBox>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
      </PanelBox>
    )
  return (
    // Plain characters only, as before, so a card shut before still opens shut.
    <PanelCard
      storageId={`automation-node-${title.toLowerCase().replace(/[^\w-]+/g, "-")}`}
      title={title}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
    </PanelCard>
  )
}

/**
 * A box of information inside a card — something the panel is telling you
 * rather than something you fill in. White on the card's grey, like the fields,
 * so it stands off the card instead of dissolving into it.
 */
export function InspectorNote({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}
