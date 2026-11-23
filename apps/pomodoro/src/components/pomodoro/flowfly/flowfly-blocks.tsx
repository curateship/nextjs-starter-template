import * as React from "react"
import { EyeIcon, EyeOffIcon, InboxIcon, LayoutDashboardIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import type { WaitingItem } from "@/lib/api/pomodoro/flowfly"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { orderSections } from "@/lib/layout/styling-values"
import { FLOWFLY_SECTIONS_NODE, FLOWFLY_WAITING_NODE } from "@/lib/pomodoro/flowfly-page"
import {
  FLOWFLY_LIST_SECTIONS,
  FLOWFLY_SECTION_LABELS,
  FLOWFLY_SECTIONS,
  type FlowflyListSection,
  type FlowflySection,
} from "@/lib/pomodoro/flowfly-search"

/**
 * The Flowfly dashboard's two "/" blocks (Tyler, 13 Nov 2026), built as
 * Promo's dashboards build theirs (`apps/promo/src/components/dashboard-page/dashboard-blocks.tsx`):
 *
 * - **Dashboards**, fixed: Overview, then the six sections, the one showing
 *   picked, each with its count. Safety and Library count what waits for an
 *   admin (reports to decide, shared files to approve); the others count
 *   their first tab's rows. Its ⋮
 *   shows and hides every section but Overview and drags them into order.
 * - **Waiting on you** (Tyler's pick): reports to decide, shared files to
 *   approve and held chat lines, oldest first. Pressing one opens it.
 *
 * Each keeps no values: it draws what the dashboard hands down.
 */

export type FlowflyBlocks = {
  section: FlowflySection
  onPickSection: (section: FlowflySection) => void
  hiddenSections: readonly FlowflyListSection[]
  sectionOrder: readonly FlowflyListSection[]
  onSectionsChange: (sections: { hidden: FlowflyListSection[]; order: FlowflyListSection[] }) => void
  /** Each row's pill, already in words ("464"). Null while it is read. */
  counts: Record<FlowflySection, string | null>
  /** Null while the list is read, or when the read failed. */
  waiting: { total: number; items: WaitingItem[] } | null
  onOpenWaiting: (item: WaitingItem) => void
}

const Context = React.createContext<FlowflyBlocks | null>(null)

export function FlowflyBlocksProvider({ value, children }: { value: FlowflyBlocks; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

const listOnly = (sections: readonly string[]): FlowflyListSection[] =>
  sections.filter((section): section is FlowflyListSection => (FLOWFLY_LIST_SECTIONS as readonly string[]).includes(section))

function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Flowfly dashboard.</p>
}

export function FlowflySectionsBlock() {
  const blocks = React.useContext(Context)
  const hidden: readonly FlowflySection[] = blocks?.hiddenSections ?? []
  const ordered = orderSections(FLOWFLY_SECTIONS, blocks?.sectionOrder)
  const change = blocks?.onSectionsChange
  useBlockMenu(
    change
      ? ordered
          .filter((section) => (FLOWFLY_LIST_SECTIONS as readonly string[]).includes(section))
          .map((section) => {
            const isHidden = hidden.includes(section)
            return {
              label: FLOWFLY_SECTION_LABELS[section],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${FLOWFLY_SECTION_LABELS[section]}`,
              muted: isHidden,
              keepOpen: true,
              end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
              sortKey: section,
              onSelect: () =>
                change({
                  hidden: listOnly(isHidden ? hidden.filter((other) => other !== section) : [...hidden, section]),
                  order: listOnly(ordered),
                }),
            }
          })
      : undefined,
    change ? (keys) => change({ hidden: listOnly(hidden), order: listOnly(keys) }) : undefined
  )
  if (!blocks) return <NotHere />
  return (
    <DashboardsRows
      current={blocks.section}
      onPick={blocks.onPickSection}
      sections={ordered
        .filter((section) => section === blocks.section || !hidden.includes(section))
        .map((section) => ({
          key: section,
          label: FLOWFLY_SECTION_LABELS[section],
          value: blocks.counts[section] ?? undefined,
        }))}
    />
  )
}

function WaitingBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.waiting?.total || undefined)
  if (!blocks) return <NotHere />
  if (!blocks.waiting) return <p className="p-3 text-sm text-muted-foreground">Reading what is waiting…</p>
  return (
    <SideRows
      empty="Nothing is waiting for you."
      // The name first and short, so it still reads in the narrowest panel;
      // how long it has waited is the muted line, which gives way first.
      rows={blocks.waiting.items.map((item) => ({
        key: `${item.kind}-${item.id}`,
        name: item.label,
        line: formatShortTimeAgo(item.since),
        onPress: () => blocks.onOpenWaiting(item),
      }))}
    />
  )
}

const SectionsView = blockView({
  kind: "pomodoro-flowfly-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: FlowflySectionsBlock,
  fixed: true,
})

const WaitingView = blockView({
  kind: "pomodoro-flowfly-waiting",
  title: "Waiting on you",
  icon: <InboxIcon />,
  Draw: WaitingBlock,
})

/** Dashboards (fixed, never in the "/" list), then Waiting on you under Advanced blocks. */
export const FLOWFLY_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "flowflySections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: FLOWFLY_SECTIONS_NODE,
    extension: keepOnPage(blockNode(FLOWFLY_SECTIONS_NODE, {}, SectionsView)),
    offered: false,
  },
  {
    key: "flowflyWaiting",
    label: "Waiting on you",
    icon: InboxIcon,
    node: FLOWFLY_WAITING_NODE,
    extension: blockNode(FLOWFLY_WAITING_NODE, {}, WaitingView),
  },
]
