import * as React from "react"
import { LayoutDashboardIcon } from "lucide-react"

import { blockView } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { BOTS_SECTIONS_NODE } from "@/lib/bots/bots-page"
import { BOTS_VIEW_LABELS, BOTS_VIEWS, type BotsView } from "@/lib/bots/bots-search"
import type { BotsSectionCounts } from "@/lib/api/trade/bots"

/**
 * The Bots dashboard's own "/" block: Dashboards, fixed on its left page, a
 * row per section with a count, the one showing picked. It keeps no values;
 * the dashboard hands down what it read through `BotsBlocksProvider`.
 */
export type BotsBlocks = {
  view: BotsView
  onPickView: (view: BotsView) => void
  /** Null while they are read, or when the read failed. */
  counts: BotsSectionCounts | null
  /** How many widgets Overview shows; null while the layout is read. */
  widgetCount: number | null
  /**
   * While a record is open in the middle, pressing its own row goes back to
   * that row's table. The shell's rows ignore a press on the row already
   * picked, so this block hears it itself.
   */
  onReturn?: () => void
}

const BotsBlocksContext = React.createContext<BotsBlocks | null>(null)

export const BotsBlocksProvider = BotsBlocksContext.Provider

/**
 * Overview, Recipes, Backtests and Bots. Also drawn on its own while the left
 * page is read or could not be, because it is the only way between them.
 */
export function BotsSectionsBlock() {
  const blocks = React.useContext(BotsBlocksContext)
  if (!blocks) return <p className="p-3 text-xs text-muted-foreground">This block shows on the Bots dashboard.</p>
  const onReturn = blocks.onReturn
  return (
    // Hears a press on the picked row, which the shell's rows leave alone, so
    // Recipes takes you from a recipe's canvas back to the Recipes table
    // (Tyler, 9 Nov 2026: "if im in the canvas, clicking the sidebar link here
    // doesnt work").
    <div
      onClick={(event) => {
        if (onReturn && event.target instanceof Element && event.target.closest('[aria-current="true"]')) onReturn()
      }}
    >
    <DashboardsRows
      current={blocks.view}
      onPick={blocks.onPickView}
      sections={BOTS_VIEWS.map((view) => ({
        key: view,
        label: BOTS_VIEW_LABELS[view],
        value:
          view === "overview"
            ? blocks.widgetCount?.toLocaleString()
            : blocks.counts
              ? blocks.counts[view].toLocaleString()
              : undefined,
      }))}
    />
    </div>
  )
}

let made: readonly AppBlock[] | null = null

/** Every block the Bots page knows, made once: the fixed Dashboards block, never in the "/" list. */
export function botsBlocks(): readonly AppBlock[] {
  made ??= [
    {
      key: "sections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: BOTS_SECTIONS_NODE,
      extension: keepOnPage(
        blockNode(
          BOTS_SECTIONS_NODE,
          {},
          blockView({ kind: "bots-sections", title: "Dashboards", icon: <LayoutDashboardIcon />, Draw: BotsSectionsBlock, fixed: true })
        )
      ),
      offered: false,
    },
  ]
  return made
}
