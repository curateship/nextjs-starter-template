import { ActivityIcon, CalendarRangeIcon, MessageCircleIcon, ScaleIcon, TrendingUpIcon, WalletIcon } from "lucide-react"

import {
  cleanWidgetLayout,
  type WidgetChoice,
  type WidgetLayout,
  type WidgetOffer,
} from "@/lib/admin-dashboard/overview-widgets"
import { LEAD_TABS, type LeadTab } from "@/lib/dating/leads"
import type { DatingApp } from "@/lib/dating/options"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Dating dashboard's left page, one per profile (task
 * "features/07-three-panel-design", Tyler, 18 Nov 2026), and its Overview's
 * widgets.
 *
 * The Dashboards block is fixed, as on the shell's Admin, CRM and Automations
 * pages: never offered in the "/" list, refused by the editor when taken off,
 * put back at the top by the server, and moved up and down from its ⋮.
 */
export const DATING_SECTIONS_NODE = "noteDatingSections"

/** Date's own "/" blocks, each a node name kept in the page's document. */
export const DATING_BLOCK_NODES = {
  needsYou: "noteDatingNeedsYou",
  phone: "noteDatingPhone",
  profiles: "noteDatingProfiles",
  leads: "noteDatingLeads",
  secondLook: "noteDatingSecondLook",
  myProfile: "noteDatingMyProfile",
} as const

/**
 * Every block node the page may hold beyond the shell's basic ones. The
 * editor and the server both clean a page with it, so a block missing here
 * is dropped on save.
 */
export function datingPageBlockTypes(): readonly string[] {
  return [DATING_SECTIONS_NODE, ...Object.values(DATING_BLOCK_NODES)]
}

/**
 * A page nobody has written on: today's left-panel sections as blocks, in
 * their old order, so nothing goes missing on the first visit. Second Look is
 * Facebook Dating's, and My profile is not on a Facebook Dating profile.
 */
export function defaultDatingPage(app: DatingApp): NoteNode {
  const blocks = [
    DATING_SECTIONS_NODE,
    DATING_BLOCK_NODES.needsYou,
    DATING_BLOCK_NODES.phone,
    DATING_BLOCK_NODES.profiles,
    DATING_BLOCK_NODES.leads,
    ...(app === "facebook" ? [DATING_BLOCK_NODES.secondLook] : [DATING_BLOCK_NODES.myProfile]),
  ]
  return { type: "doc", content: [...blocks.map((type) => ({ type })), { type: "paragraph" }] }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withDatingSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, DATING_SECTIONS_NODE)
}

/** The Dashboards block's rows hidden from its ⋮, and their dragged order. Overview never hides and stays first. */
export type DatingSections = { hidden: Exclude<LeadTab, "overview">[]; order: Exclude<LeadTab, "overview">[] }

const MOVABLE = LEAD_TABS.filter((tab): tab is Exclude<LeadTab, "overview"> => tab !== "overview")

/** A stored or sent list of rows made safe: known rows only, each once. */
export function readSectionList(value: unknown): Exclude<LeadTab, "overview">[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value)].filter((item): item is Exclude<LeadTab, "overview"> => (MOVABLE as readonly unknown[]).includes(item))
}

// ------------------------------------------------------------ Widgets --

export type DatingWidgetId = "today" | "spend" | "week" | "openers" | "working" | "compare"

/** Overview's widgets: what the left panel's stats were, each in the shell's widget card. */
export const DATING_WIDGETS = [
  { id: "today", label: "Today", icon: ActivityIcon },
  { id: "spend", label: "AI spend", icon: WalletIcon },
  { id: "week", label: "Last 7 days", icon: CalendarRangeIcon },
  { id: "openers", label: "Openers", icon: MessageCircleIcon },
  { id: "working", label: "What's working", icon: TrendingUpIcon },
  { id: "compare", label: "Compare apps", icon: ScaleIcon },
] as const satisfies readonly (WidgetChoice & { id: DatingWidgetId })[]

export const DATING_WIDGET_IDS: readonly DatingWidgetId[] = DATING_WIDGETS.map((widget) => widget.id)

/** What the grid, its Widgets tab and each widget's ⋮ offer. */
export const DATING_WIDGET_OFFER: WidgetOffer = { choices: DATING_WIDGETS }

export function findDatingWidget(id: string) {
  return DATING_WIDGETS.find((widget) => widget.id === id)
}

/** A fresh start: Today and AI spend on top, then the last 7 days, Openers and What's working. */
export const DEFAULT_DATING_WIDGET_LAYOUT: WidgetLayout = {
  top: { columns: 2, spots: ["today", "spend"] },
  bottom: { columns: 3, spots: ["week", "openers", "working"] },
}

/** A stored or sent layout made safe; nothing stored reads as the fresh start. */
export function readDatingWidgetLayout(value: unknown): WidgetLayout {
  return cleanWidgetLayout(value ?? undefined, DATING_WIDGET_IDS, DEFAULT_DATING_WIDGET_LAYOUT)
}
