import { BanIcon, FolderArchiveIcon, ListTodoIcon, MessageSquareIcon, UsersIcon, type LucideIcon } from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Projects dashboard's left page, one per person, and its Overview
 * widgets (Tyler, 12 Nov 2026). The page's own "/" blocks keep no values:
 * each draws what the dashboard already knows. The editor and the server
 * both clean a page with this list, so a block missing here is dropped on
 * save.
 */
export const PROJECTS_PAGE_BLOCK_TYPES = ["notePromoSections", "notePromoProjects"] as const

/**
 * The Dashboards block: Overview, Projects, Voices, Accounts, Archive and
 * Messages, one row each. Fixed, as the Admin, CRM and Trips pages' are:
 * never offered in the "/" list, the editor refuses to take it off, the
 * server puts it back at the top of a page saved without it, and its ⋮ moves
 * it up and down.
 */
export const PROJECTS_SECTIONS_NODE = "notePromoSections"

/** The Projects block: every project, picking one narrows the section showing to it. */
export const PROJECTS_PICKER_NODE = "notePromoProjects"

/** What a refused save of the page says. */
export const PROJECTS_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/** A page nobody has written on: the Dashboards block, then Projects. */
export function defaultProjectsPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: PROJECTS_SECTIONS_NODE }, { type: PROJECTS_PICKER_NODE }, { type: "paragraph" }],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withProjectsSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, PROJECTS_SECTIONS_NODE)
}

/**
 * Overview's widgets, Tyler's picks of 12 Nov 2026: Posts that need you,
 * Messages waiting, Accounts by status, and "Bans and archive room" as two
 * widgets of their own.
 */
const PROJECTS_WIDGETS = [
  { id: "posts-need-you", label: "Posts that need you", icon: ListTodoIcon },
  { id: "messages-waiting", label: "Messages waiting", icon: MessageSquareIcon },
  { id: "accounts-by-status", label: "Accounts by status", icon: UsersIcon },
  { id: "bans", label: "Bans in the last 30 days", icon: BanIcon },
  { id: "archive-room", label: "Archive room", icon: FolderArchiveIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type ProjectsWidgetId = (typeof PROJECTS_WIDGETS)[number]["id"]

export const PROJECTS_WIDGET_IDS: readonly string[] = PROJECTS_WIDGETS.map((widget) => widget.id)

export const PROJECTS_WIDGET_OFFER: WidgetOffer = { choices: PROJECTS_WIDGETS }

export function findProjectsWidget(id: string) {
  return PROJECTS_WIDGETS.find((widget) => widget.id === id)
}

/** What Overview starts with: the two lists that need you on top, the three counts under them. */
export const DEFAULT_PROJECTS_WIDGETS: WidgetLayout = {
  top: { columns: 2, spots: ["posts-need-you", "messages-waiting"] },
  bottom: { columns: 3, spots: ["accounts-by-status", "bans", "archive-room"] },
}
