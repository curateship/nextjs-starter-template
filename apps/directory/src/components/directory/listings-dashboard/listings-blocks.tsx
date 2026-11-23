import * as React from "react"
import { EyeIcon, EyeOffIcon, InboxIcon, LayoutDashboardIcon, TagIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import type { NeedsYouRow } from "@/lib/api/directory/listings-dashboard"
import { waitedText, waitedTooLong } from "@/lib/directory/listings-dashboard-page"
import {
  LISTINGS_CATEGORIES_NODE,
  LISTINGS_NEEDS_NODE,
  LISTINGS_SECTIONS_NODE,
} from "@/lib/directory/listings-dashboard-page"
import {
  LISTINGS_LIST_SECTIONS,
  LISTINGS_SECTION_LABELS,
  LISTINGS_SECTIONS,
  type ListingsListSection,
  type ListingsSection,
} from "@/lib/directory/listings-dashboard-search"
import { orderSections } from "@/lib/layout/styling-values"

/**
 * The Listings dashboard's own "/" blocks on its left page (Tyler, 18 Nov
 * 2026), drawn the way Promo's `makeDashboardBlocks` draws the Projects
 * dashboard's:
 *
 * - **Dashboards**, fixed: Overview, then each row, the one showing picked,
 *   each with its count. Submissions, Claims, Owner changes and Reports count
 *   only what is waiting (Tyler's polish pick: "The \"N need review\" links
 *   become pill counts"). Its ⋮ shows and hides every row but Overview and
 *   drags them into order.
 * - **Needs you**: the oldest waiting submissions, claims, owner changes and
 *   reports, five rows then "Show all", each opening its record. A row that
 *   has waited three days or more has an amber dot.
 * - **Categories**: the site's categories, biggest first. Pressing one
 *   narrows Listings to it; pressing it again lets it go.
 *
 * Each keeps no values: it draws what the dashboard hands down through the
 * blocks' Provider.
 */

export type ListingsBlocks = {
  /** The row showing, and picking another. */
  section: ListingsSection
  onPickSection: (section: ListingsSection) => void
  /** Rows left out of the Dashboards block, and their dragged order. */
  hiddenSections: readonly ListingsListSection[]
  sectionOrder: readonly ListingsListSection[]
  onSectionsChange: (sections: { hidden: ListingsListSection[]; order: ListingsListSection[] }) => void
  /** Each row's count. Null while it is read. */
  counts: Record<ListingsSection, number | null>
  /** The oldest records waiting, and how many wait in all. Null while read. */
  needs: { rows: NeedsYouRow[]; total: number } | null
  onOpenNeed: (row: NeedsYouRow) => void
  /** The site's categories with how many listings each holds. */
  categories: { id: string; name: string; count: number }[]
  /** The category Listings is narrowed to, or "". */
  activeCategory: string
  /** Narrows Listings to a category; "" lets it go. */
  onCategory: (categoryId: string) => void
}

const Context = React.createContext<ListingsBlocks | null>(null)

export function ListingsBlocksProvider({ value, children }: { value: ListingsBlocks; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

const listOnly = (sections: readonly string[]): ListingsListSection[] =>
  sections.filter((section): section is ListingsListSection => (LISTINGS_LIST_SECTIONS as readonly string[]).includes(section))

function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Listings dashboard.</p>
}

export function ListingsSectionsBlock() {
  const blocks = React.useContext(Context)
  const hidden: readonly ListingsSection[] = blocks?.hiddenSections ?? []
  const ordered = orderSections(LISTINGS_SECTIONS, blocks?.sectionOrder)
  const change = blocks?.onSectionsChange
  useBlockMenu(
    change
      ? ordered
          .filter((section) => (LISTINGS_LIST_SECTIONS as readonly string[]).includes(section))
          .map((section) => {
            const isHidden = hidden.includes(section)
            return {
              label: LISTINGS_SECTION_LABELS[section],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${LISTINGS_SECTION_LABELS[section]}`,
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
          label: LISTINGS_SECTION_LABELS[section],
          value: blocks.counts[section]?.toLocaleString(),
        }))}
    />
  )
}

const NEED_KIND: Record<NeedsYouRow["section"], string> = {
  submissions: "Submission",
  claims: "Claim",
  changes: "Owner change",
  dealRequests: "Deal from an owner",
  reports: "Report",
}

function NeedsYouBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.needs?.total || undefined)
  if (!blocks) return <NotHere />
  if (!blocks.needs) return <p className="px-4 py-3 text-sm text-muted-foreground">Reading…</p>
  return (
    <SideRows
      empty="Nothing is waiting on you."
      rows={blocks.needs.rows.map((row) => ({
        key: `${row.section}-${row.id}`,
        name: row.name || "Untitled",
        line: NEED_KIND[row.section],
        dot: waitedTooLong(row.waitingSince) ? "bg-amber-500" : undefined,
        // A space that never breaks, so "4 days" stays one pill in the narrow panel.
        value: waitedText(row.waitingSince).replace(" ", "\u00a0"),
        onPress: () => blocks.onOpenNeed(row),
      }))}
    />
  )
}

function CategoriesBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.categories.length || undefined)
  if (!blocks) return <NotHere />
  return (
    <SideRows
      empty="No categories yet. New category in the Categories row makes one."
      rows={blocks.categories.map((category) => ({
        key: category.id,
        name: category.name,
        value: category.count.toLocaleString(),
        picked: blocks.activeCategory === category.id,
        onPress: () => blocks.onCategory(blocks.activeCategory === category.id ? "" : category.id),
      }))}
    />
  )
}

const SectionsView = blockView({
  kind: "directory-listings-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: ListingsSectionsBlock,
  fixed: true,
})

const NeedsView = blockView({
  kind: "directory-listings-needs",
  title: "Needs you",
  icon: <InboxIcon />,
  Draw: NeedsYouBlock,
})

const CategoriesView = blockView({
  kind: "directory-listings-categories",
  title: "Categories",
  icon: <TagIcon />,
  Draw: CategoriesBlock,
})

/** Dashboards (fixed, never in the "/" list), then Needs you and Categories under Advanced blocks. */
export const LISTINGS_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "listingsSections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: LISTINGS_SECTIONS_NODE,
    extension: keepOnPage(blockNode(LISTINGS_SECTIONS_NODE, {}, SectionsView)),
    offered: false,
  },
  {
    key: "listingsNeeds",
    label: "Needs you",
    icon: InboxIcon,
    node: LISTINGS_NEEDS_NODE,
    extension: blockNode(LISTINGS_NEEDS_NODE, {}, NeedsView),
  },
  {
    key: "listingsCategories",
    label: "Categories",
    icon: TagIcon,
    node: LISTINGS_CATEGORIES_NODE,
    extension: blockNode(LISTINGS_CATEGORIES_NODE, {}, CategoriesView),
  },
]
