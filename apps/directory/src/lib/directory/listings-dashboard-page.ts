import { BookmarkIcon, CreditCardIcon, SendIcon, SparklesIcon, TagIcon, type LucideIcon } from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Listings dashboard's left page, one per site, and its Overview
 * widgets (Tyler, 18 Nov 2026: "Cosolidate listings into one 3 panel
 * dashboard. Match design pattern of the shell 1 to 1"). The page's own "/"
 * blocks keep no values: each draws what the dashboard already knows. The
 * editor and the server both clean a page with this list, so a block missing
 * here is dropped on save.
 */

/**
 * The Dashboards block: one row per section. Fixed, as the Admin, CRM and
 * Automations pages' are: never offered in the "/" list, the editor refuses
 * to take it off, the server puts it back at the top of a page saved without
 * it, and its ⋮ moves it up and down.
 */
export const LISTINGS_SECTIONS_NODE = "noteListingsSections"

/** Needs you: the oldest waiting submissions, claims, owner changes and reports. */
export const LISTINGS_NEEDS_NODE = "noteListingsNeeds"

/** Categories: the site's categories; picking one narrows Listings to it. */
export const LISTINGS_CATEGORIES_NODE = "noteListingsCategories"

export const LISTINGS_PAGE_BLOCK_TYPES = [LISTINGS_SECTIONS_NODE, LISTINGS_NEEDS_NODE, LISTINGS_CATEGORIES_NODE] as const

/** What a refused save of the page says. */
export const LISTINGS_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/** A page nobody has written on: Dashboards, then Needs you, then Categories. */
export function defaultListingsPage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: LISTINGS_SECTIONS_NODE },
      { type: LISTINGS_NEEDS_NODE },
      { type: LISTINGS_CATEGORIES_NODE },
      { type: "paragraph" },
    ],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withListingsSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, LISTINGS_SECTIONS_NODE)
}

/**
 * Overview's widgets: what used to sit above and beside the tables on the
 * Featured, Saves and Outreach pages, Featured's three figures, Most saved
 * listings and Send history, so every row of the Dashboards block is one
 * list.
 */
const LISTINGS_WIDGETS = [
  { id: "featured-income", label: "Featured income", icon: CreditCardIcon },
  { id: "featured-running", label: "Running placements", icon: SparklesIcon },
  { id: "plans-offered", label: "Plans offered", icon: TagIcon },
  { id: "most-saved", label: "Most saved listings", icon: BookmarkIcon },
  { id: "send-history", label: "Send history", icon: SendIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type ListingsWidgetId = (typeof LISTINGS_WIDGETS)[number]["id"]

export const LISTINGS_WIDGET_IDS: readonly string[] = LISTINGS_WIDGETS.map((widget) => widget.id)

export const LISTINGS_WIDGET_OFFER: WidgetOffer = { choices: LISTINGS_WIDGETS }

export function findListingsWidget(id: string) {
  return LISTINGS_WIDGETS.find((widget) => widget.id === id)
}

/** What Overview starts with: the three figures on top, the two lists under them. */
export const DEFAULT_LISTINGS_WIDGETS: WidgetLayout = {
  top: { columns: 3, spots: ["featured-income", "featured-running", "plans-offered"] },
  bottom: { columns: 2, spots: ["most-saved", "send-history"] },
}

/** How many days a waiting submission, claim or owner change may sit before its row turns amber (Tyler, 18 Nov 2026). */
export const WAITING_AMBER_DAYS = 3

/** How many days before its end a featured placement stands out (Tyler's polish pick, 18 Nov 2026). */
export const ENDING_SOON_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days since a moment, never below zero. */
export function daysSince(at: Date | string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(at).getTime()) / DAY_MS))
}

/** "Today", "1 day", "4 days": how long something has waited. */
export function waitedText(at: Date | string, now: number = Date.now()): string {
  const days = daysSince(at, now)
  if (days === 0) return "Today"
  return days === 1 ? "1 day" : `${days} days`
}

/** Whether a wait has gone on long enough to turn the row amber. */
export function waitedTooLong(at: Date | string, now: number = Date.now()): boolean {
  return daysSince(at, now) >= WAITING_AMBER_DAYS
}

/** Whether a placement still running ends within `ENDING_SOON_DAYS`. */
export function endsSoon(endsAt: Date | string, now: number = Date.now()): boolean {
  const left = new Date(endsAt).getTime() - now
  return left > 0 && left <= ENDING_SOON_DAYS * DAY_MS
}
