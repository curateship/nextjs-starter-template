import * as React from "react"
import { EyeIcon, EyeOffIcon, LayoutDashboardIcon } from "lucide-react"

import { blockView, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { orderSections } from "@/lib/layout/styling-values"
import { FLOW_SECTIONS_NODE } from "@/lib/video/flow/flow-page"
import { FLOW_TAB_LABELS, FLOW_TABS, type FlowTab } from "@/lib/video/flow/flow-search"

/**
 * The Flow dashboard's own "/" block: the fixed Dashboards block, a row per
 * section with its count, copied from Automations' (`automation-blocks.tsx`).
 * It keeps no values of its own; the dashboard hands them down through
 * `FlowBlocksProvider`.
 */
export type FlowBlocks = {
  tab: FlowTab
  onPickTab: (tab: FlowTab) => void
  /** A press on the section showing: from the builder or a run back to the table. */
  onRepickTab: (tab: FlowTab) => void
  counts: Record<FlowTab, number>
  /** The sections hidden in the block's ⋮, kept on the person's page. */
  hiddenSections: readonly FlowTab[]
  onHiddenSectionsChange: (hidden: FlowTab[]) => void
  /** The sections' order, dragged in the block's ⋮. */
  sectionOrder: readonly FlowTab[]
  onSectionOrderChange: (order: FlowTab[]) => void
}

const FlowBlocksContext = React.createContext<FlowBlocks | null>(null)

export const FlowBlocksProvider = FlowBlocksContext.Provider

/**
 * Flows and Runs, the one showing picked. Its ⋮ lists each section with an
 * eye that hides or shows it, and the rows drag into a new order (Tyler,
 * 11 Nov 2026: "add this same feature for all apps that has dashboards
 * block"). The section showing keeps its row until another is picked.
 */
export function FlowSectionsBlock() {
  const blocks = React.useContext(FlowBlocksContext)
  const hidden = blocks?.hiddenSections ?? []
  const changeHidden = blocks?.onHiddenSectionsChange
  const changeOrder = blocks?.onSectionOrderChange
  const ordered = orderSections(FLOW_TABS, blocks?.sectionOrder)
  useBlockMenu(
    changeHidden
      ? ordered.map((tab) => {
          const isHidden = hidden.includes(tab)
          return {
            label: FLOW_TAB_LABELS[tab],
            ariaLabel: `${isHidden ? "Show" : "Hide"} ${FLOW_TAB_LABELS[tab]}`,
            muted: isHidden,
            keepOpen: true,
            end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
            sortKey: tab,
            onSelect: () => changeHidden(isHidden ? hidden.filter((other) => other !== tab) : [...hidden, tab]),
          }
        })
      : undefined,
    changeOrder ? (keys) => changeOrder(keys.filter((key): key is FlowTab => (FLOW_TABS as readonly string[]).includes(key))) : undefined
  )
  if (!blocks) {
    return <p className="p-3 text-xs text-muted-foreground">This block shows on the Flow dashboard.</p>
  }
  return (
    <DashboardsRows
      current={blocks.tab}
      onPick={blocks.onPickTab}
      onRepick={blocks.onRepickTab}
      sections={ordered
        .filter((tab) => tab === blocks.tab || !hidden.includes(tab))
        .map((tab) => ({ key: tab, label: FLOW_TAB_LABELS[tab], value: blocks.counts[tab].toLocaleString() }))}
    />
  )
}

let made: readonly AppBlock[] | null = null

/** The page's own blocks, made once: the Dashboards block, fixed and never in the "/" list. */
export function flowBlocks(): readonly AppBlock[] {
  made ??= [
    {
      key: "sections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: FLOW_SECTIONS_NODE,
      extension: keepOnPage(
        blockNode(
          FLOW_SECTIONS_NODE,
          {},
          blockView({
            kind: "video-flow-sections",
            title: "Dashboards",
            icon: <LayoutDashboardIcon />,
            Draw: FlowSectionsBlock,
            fixed: true,
          })
        )
      ),
      offered: false,
    },
  ]
  return made
}
