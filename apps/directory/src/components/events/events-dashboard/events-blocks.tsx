import * as React from "react"
import { CalendarClockIcon, EyeIcon, EyeOffIcon, LayoutDashboardIcon, TagIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import type { ComingUpRow } from "@/lib/api/events/events-dashboard"
import { EVENTS_CATEGORIES_NODE, EVENTS_COMING_NODE, EVENTS_SECTIONS_NODE } from "@/lib/events/events-dashboard-page"
import {
  EVENTS_LIST_SECTIONS,
  EVENTS_SECTION_LABELS,
  EVENTS_SECTIONS,
  type EventsListSection,
  type EventsSection,
} from "@/lib/events/events-dashboard-search"
import { formatEventClock, formatEventShortDay } from "@/lib/events/event-time"
import { orderSections } from "@/lib/layout/styling-values"

/**
 * The Events dashboard's own "/" blocks on its left page (task events/37,
 * Part 1), drawn the way the Listings dashboard's are:
 *
 * - **Dashboards**, fixed: Overview, Events, Sign-ups, Featured events and
 *   Custom fields,
 *   the one showing picked, each with its count. Its ⋮ shows and hides every
 *   row but Overview and drags them into order.
 * - **Coming up**: the site's next five events, a repeat's dates each on its
 *   own, soonest first, each opening its record. It stands where the
 *   Listings dashboard has Needs you.
 * - **Categories**: the categories events are filed under, biggest first.
 *   Pressing one narrows Events to it; pressing it again lets it go.
 */

export type EventsBlocks = {
  section: EventsSection
  onPickSection: (section: EventsSection) => void
  hiddenSections: readonly EventsListSection[]
  sectionOrder: readonly EventsListSection[]
  onSectionsChange: (sections: { hidden: EventsListSection[]; order: EventsListSection[] }) => void
  /** Each row's count. Null while it is read. */
  counts: Record<EventsSection, number | null>
  /** The next events and how many are to come. Null while read. */
  coming: { rows: ComingUpRow[]; total: number } | null
  onOpenEvent: (id: string) => void
  categories: { id: string; name: string; count: number }[]
  /** The category Events is narrowed to, or "". */
  activeCategory: string
  onCategory: (categoryId: string) => void
}

const Context = React.createContext<EventsBlocks | null>(null)

export function EventsBlocksProvider({ value, children }: { value: EventsBlocks; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

const listOnly = (sections: readonly string[]): EventsListSection[] =>
  sections.filter((section): section is EventsListSection => (EVENTS_LIST_SECTIONS as readonly string[]).includes(section))

function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Events dashboard.</p>
}

export function EventsSectionsBlock() {
  const blocks = React.useContext(Context)
  const hidden: readonly EventsSection[] = blocks?.hiddenSections ?? []
  const ordered = orderSections(EVENTS_SECTIONS, blocks?.sectionOrder)
  const change = blocks?.onSectionsChange
  useBlockMenu(
    change
      ? ordered
          .filter((section) => (EVENTS_LIST_SECTIONS as readonly string[]).includes(section))
          .map((section) => {
            const isHidden = hidden.includes(section)
            return {
              label: EVENTS_SECTION_LABELS[section],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${EVENTS_SECTION_LABELS[section]}`,
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
          label: EVENTS_SECTION_LABELS[section],
          value: blocks.counts[section]?.toLocaleString(),
        }))}
    />
  )
}

function ComingUpBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.coming?.total || undefined)
  if (!blocks) return <NotHere />
  if (!blocks.coming) return <p className="px-4 py-3 text-sm text-muted-foreground">Reading…</p>
  return (
    <SideRows
      empty="Nothing is coming up. Publish an event to see it here."
      rows={blocks.coming.rows.map((row) => ({
        key: row.id,
        name: row.title || "Untitled",
        line: `${formatEventShortDay(row.startDate)}, ${formatEventClock(row.startTime)}`,
        // The month and day alone, with a space that never breaks, so the pill
        // stays small in the narrow panel and the name keeps its room.
        value: formatEventShortDay(row.startDate).split(", ")[1]?.replace(" ", "\u00a0"),
        onPress: () => blocks.onOpenEvent(row.id),
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
      empty="No event is filed under a category yet."
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
  kind: "directory-events-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: EventsSectionsBlock,
  fixed: true,
})

const ComingView = blockView({
  kind: "directory-events-coming",
  title: "Coming up",
  icon: <CalendarClockIcon />,
  Draw: ComingUpBlock,
})

const CategoriesView = blockView({
  kind: "directory-events-categories",
  title: "Categories",
  icon: <TagIcon />,
  Draw: CategoriesBlock,
})

/** Dashboards (fixed, never in the "/" list), then Coming up and Categories under Advanced blocks. */
export const EVENTS_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "eventsSections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: EVENTS_SECTIONS_NODE,
    extension: keepOnPage(blockNode(EVENTS_SECTIONS_NODE, {}, SectionsView)),
    offered: false,
  },
  {
    key: "eventsComing",
    label: "Coming up",
    icon: CalendarClockIcon,
    node: EVENTS_COMING_NODE,
    extension: blockNode(EVENTS_COMING_NODE, {}, ComingView),
  },
  {
    key: "eventsCategories",
    label: "Categories",
    icon: TagIcon,
    node: EVENTS_CATEGORIES_NODE,
    extension: blockNode(EVENTS_CATEGORIES_NODE, {}, CategoriesView),
  },
]
