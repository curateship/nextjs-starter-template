import { BanIcon, BellRingIcon, MonitorIcon, ServerIcon, type LucideIcon } from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Anti Detect dashboard's left page, one per person, and its Overview
 * widgets (Tyler, 12 Nov 2026). Built as the Projects dashboard's
 * (`src/lib/social/projects-dashboard-page.ts`): the page's own "/" blocks
 * keep no values, and the editor and the server both clean a page with
 * `ANTI_DETECT_PAGE_BLOCK_TYPES`, so a block missing here is dropped on save.
 */

/** The Dashboards block: Overview, Profiles, Proxies, Phones and Bans, one row each. Fixed. */
export const ANTI_DETECT_SECTIONS_NODE = "notePromoAntiDetectSections"

/** The Projects block: every project; picking one narrows the section showing to what its accounts use. */
export const ANTI_DETECT_PROJECTS_NODE = "notePromoAntiDetectProjects"

/**
 * The rack blocks (Tyler, 12 Nov 2026: "all of these can be blocks", then
 * "I dont think a rack needs its own dashboard", then "Shelf can go in the
 * tabs instead of block. Move the rack program into the settings tab. Logs
 * block goes into tabs"). Racks lists every rack and picks one for the
 * Phones list's Rack filter; Phones shows the picked rack, or every rack
 * together while none is picked.
 */
export const ANTI_DETECT_RACKS_NODE = "notePromoAntiDetectRacks"
export const ANTI_DETECT_PHONE_COUNTS_NODE = "notePromoAntiDetectPhoneCounts"

export const ANTI_DETECT_PAGE_BLOCK_TYPES = [
  ANTI_DETECT_SECTIONS_NODE,
  ANTI_DETECT_PROJECTS_NODE,
  ANTI_DETECT_RACKS_NODE,
  ANTI_DETECT_PHONE_COUNTS_NODE,
] as const

/** What a refused save of the page says. */
export const ANTI_DETECT_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/**
 * A page nobody has written on: Dashboards, Projects, then Racks and
 * Phones. A rack's program is in the page's ⋮, and its shelf and log are
 * tabs of the phones list.
 */
export function defaultAntiDetectPage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: ANTI_DETECT_SECTIONS_NODE },
      { type: ANTI_DETECT_PROJECTS_NODE },
      { type: ANTI_DETECT_RACKS_NODE },
      { type: ANTI_DETECT_PHONE_COUNTS_NODE },
      { type: "paragraph" },
    ],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withAntiDetectSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, ANTI_DETECT_SECTIONS_NODE)
}

/**
 * Overview's widgets, Tyler's picks of 12 Nov 2026: "Browsers and proxies,
 * Racks, Bans in 30 days, Waiting on you". Waiting on you and Bans in 30
 * days hold what used to be cards above the Bans table (his answer:
 * "Overview widgets").
 */
const ANTI_DETECT_WIDGETS = [
  { id: "browsers-proxies", label: "Browsers and proxies", icon: MonitorIcon },
  { id: "racks", label: "Racks", icon: ServerIcon },
  { id: "bans-30-days", label: "Bans in 30 days", icon: BanIcon },
  { id: "waiting-on-you", label: "Waiting on you", icon: BellRingIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type AntiDetectWidgetId = (typeof ANTI_DETECT_WIDGETS)[number]["id"]

export const ANTI_DETECT_WIDGET_IDS: readonly string[] = ANTI_DETECT_WIDGETS.map((widget) => widget.id)

export const ANTI_DETECT_WIDGET_OFFER: WidgetOffer = { choices: ANTI_DETECT_WIDGETS }

export function findAntiDetectWidget(id: string) {
  return ANTI_DETECT_WIDGETS.find((widget) => widget.id === id)
}

/** What Overview starts with: what needs you and the bans on top, the browsers and racks under them. */
export const DEFAULT_ANTI_DETECT_WIDGETS: WidgetLayout = {
  top: { columns: 2, spots: ["waiting-on-you", "bans-30-days"] },
  bottom: { columns: 2, spots: ["browsers-proxies", "racks"] },
}

/**
 * Where the dashboard remembers things in this browser. The number on a
 * layout key is bumped whenever the default widths move.
 */
export const ANTI_DETECT_LAYOUT_KEY = "promo-anti-detect-horizontal-1"
export const ANTI_DETECT_OVERVIEW_LAYOUT_KEY = "promo-anti-detect-overview-horizontal-1"
export const ANTI_DETECT_PLACE_KEY = "promo-anti-detect-place"
