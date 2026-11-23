import { CalendarCheckIcon, CalendarClockIcon, EyeIcon, InboxIcon, UsersIcon, type LucideIcon } from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Events dashboard's left page, one per site, and its Overview widgets
 * (task events/37, Part 1), the same shape as the Listings dashboard's
 * (`listings-dashboard-page.ts`). The page's own "/" blocks keep no values:
 * each draws what the dashboard already knows. The editor and the server
 * both clean a page with this list, so a block missing here is dropped.
 */

/** The Dashboards block: one row per section, fixed, as the Listings dashboard's is. */
export const EVENTS_SECTIONS_NODE = "noteEventsSections"

/** Coming up: the site's next five events, each opening its record. */
export const EVENTS_COMING_NODE = "noteEventsComing"

/** Categories: the site's categories with events in them; picking one narrows Events. */
export const EVENTS_CATEGORIES_NODE = "noteEventsCategories"

export const EVENTS_PAGE_BLOCK_TYPES = [EVENTS_SECTIONS_NODE, EVENTS_COMING_NODE, EVENTS_CATEGORIES_NODE] as const

export const EVENTS_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/** A page nobody has written on: Dashboards, then Coming up, then Categories. */
export function defaultEventsPage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: EVENTS_SECTIONS_NODE },
      { type: EVENTS_COMING_NODE },
      { type: EVENTS_CATEGORIES_NODE },
      { type: "paragraph" },
    ],
  }
}

export function withEventsSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, EVENTS_SECTIONS_NODE)
}

/** Overview's widgets, as the mock showed them. */
const EVENTS_WIDGETS = [
  { id: "coming-this-week", label: "Coming up this week", icon: CalendarClockIcon },
  { id: "signups-this-week", label: "Sign-ups this week", icon: UsersIcon },
  { id: "waiting-suggestions", label: "Waiting suggestions", icon: InboxIcon },
  { id: "most-viewed", label: "Most viewed in 30 days", icon: EyeIcon },
  { id: "filling-up", label: "Filling up", icon: CalendarCheckIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type EventsWidgetId = (typeof EVENTS_WIDGETS)[number]["id"]

export const EVENTS_WIDGET_IDS: readonly string[] = EVENTS_WIDGETS.map((widget) => widget.id)

export const EVENTS_WIDGET_OFFER: WidgetOffer = { choices: EVENTS_WIDGETS }

export function findEventsWidget(id: string) {
  return EVENTS_WIDGETS.find((widget) => widget.id === id)
}

/** What Overview starts with: three figures on top, two lists under them. */
export const DEFAULT_EVENTS_WIDGETS: WidgetLayout = {
  top: { columns: 3, spots: ["coming-this-week", "signups-this-week", "waiting-suggestions"] },
  bottom: { columns: 2, spots: ["most-viewed", "filling-up"] },
}
