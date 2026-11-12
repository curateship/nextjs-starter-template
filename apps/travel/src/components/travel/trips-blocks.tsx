import * as React from "react"
import { EyeIcon, EyeOffIcon, LayoutDashboardIcon, TagsIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import { orderSections } from "@/lib/layout/styling-values"
import { TRIPS_SECTIONS, TRIPS_SECTION_LABELS, type TripsSection } from "@/lib/travel/trips-search"
import { TRIPS_SECTIONS_NODE, TRIPS_TAGS_NODE } from "@/lib/travel/trips-page"

/**
 * The Trips dashboard's own "/" blocks on its left page (Tyler, 12 Nov 2026:
 * "The left panel can have the dashboard block that list Overview widgets,
 * trips, places"). Each keeps no values: it draws what the dashboard hands
 * down through `TripsBlocksProvider`, as the CRM's blocks do.
 */

/** A section the Dashboards block can hide or move: every one but Overview. */
type ListSection = Exclude<TripsSection, "overview">

export type TripsBlocks = {
  /** The section showing, and picking another. */
  section: TripsSection
  onPickSection: (section: TripsSection) => void
  /** Sections left out of the Dashboards block, and their dragged order. */
  hiddenSections: readonly ListSection[]
  sectionOrder: readonly ListSection[]
  onSectionsChange: (sections: { hidden: ListSection[]; order: ListSection[] }) => void
  /**
   * Trips' and Places' counts: the upcoming trips and the saved places, null while read. Overview has
   * none, since its widgets counted beside "Trips 1" read as trips (Travel polish part 26).
   */
  counts: Record<ListSection, number | null>
  /** Every tag on the person's trips with how many trips carry it, A to Z. */
  tags: { tag: string; count: number }[]
  /** The tag the Trips table is narrowed to, or "". */
  activeTag: string
  /** Narrows the Trips table to a tag; "" lets it go. */
  onTag: (tag: string) => void
}

function listSections(sections: readonly string[]): ListSection[] {
  return sections.filter((section): section is ListSection => section === "trips" || section === "places")
}

const TripsBlocksContext = React.createContext<TripsBlocks | null>(null)

export function TripsBlocksProvider({ value, children }: { value: TripsBlocks; children: React.ReactNode }) {
  return <TripsBlocksContext.Provider value={value}>{children}</TripsBlocksContext.Provider>
}

/** What a block shows on a page with no Trips dashboard behind it. */
function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Trips dashboard.</p>
}

/**
 * Dashboards: Overview, Trips and Places, the one showing picked, each with
 * its count. Its ⋮ shows and hides Trips and Places and drags them into
 * order; Overview stays first and always shows. A section hidden keeps its
 * row while it is the one showing.
 */
export function TripsSectionsBlock() {
  const blocks = React.useContext(TripsBlocksContext)
  const hidden: readonly TripsSection[] = blocks?.hiddenSections ?? []
  const ordered = orderSections(TRIPS_SECTIONS, blocks?.sectionOrder)
  const change = blocks?.onSectionsChange
  useBlockMenu(
    change
      ? ordered
          .filter((section) => section !== "overview")
          .map((section) => {
            const isHidden = hidden.includes(section)
            return {
              label: TRIPS_SECTION_LABELS[section],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${TRIPS_SECTION_LABELS[section]}`,
              muted: isHidden,
              keepOpen: true,
              end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
              sortKey: section,
              onSelect: () =>
                change({
                  hidden: listSections(isHidden ? hidden.filter((other) => other !== section) : [...hidden, section]),
                  order: listSections(ordered),
                }),
            }
          })
      : undefined,
    change
      ? (keys) => change({ hidden: listSections(hidden), order: listSections(keys) })
      : undefined
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
          label: TRIPS_SECTION_LABELS[section],
          value: section === "overview" ? undefined : blocks.counts[section]?.toLocaleString(),
        }))}
    />
  )
}

/**
 * Tags: every tag on the person's trips, with how many trips carry it.
 * Pressing one shows the Trips table narrowed to it; pressing it again lets
 * it go. It takes the place of the Trips table's tag dropdown.
 */
function TagsBlock() {
  const blocks = React.useContext(TripsBlocksContext)
  useBlockCount(blocks?.tags.length || undefined)
  if (!blocks) return <NotHere />
  return (
    <SideRows
      empty="No tags yet. Trip settings in a trip's ⋮ gives it some."
      rows={blocks.tags.map(({ tag, count }) => ({
        key: tag,
        name: tag,
        value: count.toLocaleString(),
        picked: blocks.activeTag === tag,
        onPress: () => blocks.onTag(blocks.activeTag === tag ? "" : tag),
      }))}
    />
  )
}

const SectionsBlockView = blockView({
  kind: "trips-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: TripsSectionsBlock,
  fixed: true,
})

const TagsBlockView = blockView({
  kind: "trips-tags",
  title: "Tags",
  icon: <TagsIcon />,
  Draw: TagsBlock,
})

/**
 * Every block the Trips page knows: Dashboards (fixed, never in the "/"
 * list), then Tags under Advanced blocks. Their node names are
 * `TRIPS_PAGE_BLOCK_TYPES`, which the server cleans a saved page with.
 */
export const TRIPS_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "tripsSections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: TRIPS_SECTIONS_NODE,
    extension: keepOnPage(blockNode(TRIPS_SECTIONS_NODE, {}, SectionsBlockView)),
    offered: false,
  },
  {
    key: "tripsTags",
    label: "Tags",
    icon: TagsIcon,
    node: TRIPS_TAGS_NODE,
    extension: blockNode(TRIPS_TAGS_NODE, {}, TagsBlockView),
  },
]
