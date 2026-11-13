import { BotIcon, DoorOpenIcon, InboxIcon, TargetIcon, TrophyIcon, type LucideIcon } from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Flowfly admin dashboard's left page, one per admin, and its Overview
 * widgets (Tyler, 13 Nov 2026), built as Promo's Anti Detect page is
 * (`apps/promo/src/lib/anti-detect/page.ts`). The page's own "/" blocks keep
 * no values, and the editor and the server both clean a page with
 * `FLOWFLY_PAGE_BLOCK_TYPES`, so a block missing here is dropped on save.
 */

/** The Dashboards block: Overview and the six sections, one row each. Fixed. */
export const FLOWFLY_SECTIONS_NODE = "notePomodoroFlowflySections"

/** Waiting on you: reports to decide, shared files to approve and held chat lines (Tyler's pick). */
export const FLOWFLY_WAITING_NODE = "notePomodoroFlowflyWaiting"

export const FLOWFLY_PAGE_BLOCK_TYPES = [FLOWFLY_SECTIONS_NODE, FLOWFLY_WAITING_NODE] as const

/** What a refused save of the page says. */
export const FLOWFLY_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/** A page nobody has written on: Dashboards, then Waiting on you. */
export function defaultFlowflyPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: FLOWFLY_SECTIONS_NODE }, { type: FLOWFLY_WAITING_NODE }, { type: "paragraph" }],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withFlowflySectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, FLOWFLY_SECTIONS_NODE)
}

/** Overview's widgets, Tyler's five picks of 13 Nov 2026. */
const FLOWFLY_WIDGETS = [
  { id: "focus-today", label: "Focus today", icon: TargetIcon },
  { id: "waiting", label: "Waiting", icon: InboxIcon },
  { id: "rooms-live", label: "Rooms live now", icon: DoorOpenIcon },
  { id: "madeup-today", label: "Made-up members", icon: BotIcon },
  { id: "top-focusers", label: "Top focusers", icon: TrophyIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type FlowflyWidgetId = (typeof FLOWFLY_WIDGETS)[number]["id"]

export const FLOWFLY_WIDGET_IDS: readonly string[] = FLOWFLY_WIDGETS.map((widget) => widget.id)

export const FLOWFLY_WIDGET_OFFER: WidgetOffer = { choices: FLOWFLY_WIDGETS }

export function findFlowflyWidget(id: string) {
  return FLOWFLY_WIDGETS.find((widget) => widget.id === id)
}

/** Tyler's answer: two on top (Focus today, Waiting), three below. */
export const DEFAULT_FLOWFLY_WIDGETS: WidgetLayout = {
  top: { columns: 2, spots: ["focus-today", "waiting"] },
  bottom: { columns: 3, spots: ["rooms-live", "madeup-today", "top-focusers"] },
}

/**
 * Where the dashboard remembers things in this browser. The number on a
 * layout key is bumped whenever the default widths move.
 */
export const FLOWFLY_LAYOUT_KEY = "pomodoro-flowfly-horizontal-1"
export const FLOWFLY_OVERVIEW_LAYOUT_KEY = "pomodoro-flowfly-overview-horizontal-1"
export const FLOWFLY_PLACE_KEY = "pomodoro-flowfly-place"
