import * as React from "react"
import { EyeIcon, EyeOffIcon, LayoutDashboardIcon } from "lucide-react"

import { blockView, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { BOTS_SECTIONS_NODE } from "@/lib/bots/bots-page"
import { BOTS_VIEW_LABELS, BOTS_VIEWS, type BotsSections, type BotsView } from "@/lib/bots/bots-search"
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
  /** The sections hidden and their order, from the block's ⋮; null while read. */
  sections: BotsSections | null
  onHiddenSectionsChange: (hidden: BotsSections["hidden"]) => void
  onSectionOrderChange: (order: BotsSections["order"]) => void
}

const BotsBlocksContext = React.createContext<BotsBlocks | null>(null)

export const BotsBlocksProvider = BotsBlocksContext.Provider

/**
 * Overview, Recipes, Backtests and Bots. Also drawn on its own while the left
 * page is read or could not be, because it is the only way between them.
 *
 * Its ⋮ lists every section but Overview, an eye on each that hides or shows
 * it, and the rows drag into a new order (Tyler, 11 Nov 2026: "add this same
 * feature for all apps that has dashboards block"), as the shell's Admin
 * Dashboards block does. Overview stays first and is never hidden. The
 * section showing keeps its row until another is picked.
 */
export function BotsSectionsBlock() {
  const blocks = React.useContext(BotsBlocksContext)
  const sections = blocks?.sections ?? null
  const hidden: readonly BotsView[] = sections?.hidden ?? []
  const ordered: readonly BotsView[] = sections?.order ?? BOTS_VIEWS
  const changeHidden = blocks?.onHiddenSectionsChange
  const changeOrder = blocks?.onSectionOrderChange
  useBlockMenu(
    sections && changeHidden
      ? ordered.filter((view): view is Exclude<BotsView, "overview"> => view !== "overview").map((view) => {
          const isHidden = hidden.includes(view)
          return {
            label: BOTS_VIEW_LABELS[view],
            ariaLabel: `${isHidden ? "Show" : "Hide"} ${BOTS_VIEW_LABELS[view]}`,
            muted: isHidden,
            keepOpen: true,
            end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
            sortKey: view,
            onSelect: () =>
              changeHidden(
                isHidden ? sections.hidden.filter((other) => other !== view) : [...sections.hidden, view]
              ),
          }
        })
      : undefined,
    sections && changeOrder
      ? (keys) => changeOrder(["overview", ...(keys as BotsView[]).filter((key) => key !== "overview")])
      : undefined
  )
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
      sections={ordered.filter((view) => view === blocks.view || !hidden.includes(view)).map((view) => ({
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
