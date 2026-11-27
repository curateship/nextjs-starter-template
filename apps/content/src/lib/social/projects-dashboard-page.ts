import {
  BanIcon,
  ChartColumnIcon,
  ClapperboardIcon,
  FolderArchiveIcon,
  ListTodoIcon,
  MessageSquareIcon,
  SearchIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

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
export const PROJECTS_PAGE_BLOCK_TYPES = ["notePromoSections"] as const

/**
 * The Dashboards block: Overview, Projects, Accounts, Messages and Viral, one
 * row each. Fixed, as the Admin, CRM and Trips pages' are: never offered in the
 * "/" list, the editor refuses to take it off, the server puts it back at the
 * top of a page saved without it, and its ⋮ moves it up and down.
 */
export const PROJECTS_SECTIONS_NODE = "notePromoSections"

/*
 * The Projects block (`notePromoProjects`), which narrowed the sections to one
 * project, is gone (Tyler, 27 Nov 2026: "Remove projects block. List row
 * only"), and so is the Viral block (`contentViralSections`), now the Viral
 * row of Dashboards ("remove the viral block and add a "Viral" link in the
 * dashboard"). Neither is in the list above, so a page saved with one is read
 * and saved without it, as any block the page does not know.
 */

/** What a refused save of the page says. */
export const PROJECTS_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/** A page nobody has written on: the Dashboards block. */
export function defaultProjectsPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: PROJECTS_SECTIONS_NODE }, { type: "paragraph" }],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withProjectsSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, PROJECTS_SECTIONS_NODE)
}

/**
 * Overview's widgets, Tyler's picks of 12 Nov 2026: Posts that need you,
 * Messages waiting, Accounts by status, and "Bans and archive room" as two
 * widgets of their own; and Results, picked on 18 Nov 2026, which a person
 * adds from Manage widgets.
 */
const PROJECTS_WIDGETS = [
  // Content's two, one for each of its other jobs (`workspace/docs/content-app.md`).
  { id: "found-today", label: "Found today", icon: SearchIcon },
  { id: "videos-in-progress", label: "Videos in progress", icon: ClapperboardIcon },
  { id: "posts-need-you", label: "Posts that need you", icon: ListTodoIcon },
  { id: "messages-waiting", label: "Messages waiting", icon: MessageSquareIcon },
  { id: "accounts-by-status", label: "Accounts by status", icon: UsersIcon },
  { id: "bans", label: "Bans in the last 30 days", icon: BanIcon },
  { id: "archive-room", label: "Archive room", icon: FolderArchiveIcon },
  // Tyler picked it on 18 Nov 2026 (part 4 of workspace/tasks/New features/new-features-18-nov.md).
  { id: "results", label: "Results", icon: ChartColumnIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type ProjectsWidgetId = (typeof PROJECTS_WIDGETS)[number]["id"]

export const PROJECTS_WIDGET_IDS: readonly string[] = PROJECTS_WIDGETS.map((widget) => widget.id)

export const PROJECTS_WIDGET_OFFER: WidgetOffer = { choices: PROJECTS_WIDGETS }

export function findProjectsWidget(id: string) {
  return PROJECTS_WIDGETS.find((widget) => widget.id === id)
}

/**
 * What Overview starts with in Content: one widget for each job on top (what
 * Research found, the videos being made, the posts that need you), then
 * messages, accounts and the Archive. Bans and Results are a Manage widgets
 * away.
 */
export const DEFAULT_PROJECTS_WIDGETS: WidgetLayout = {
  top: { columns: 3, spots: ["found-today", "videos-in-progress", "posts-need-you"] },
  bottom: { columns: 3, spots: ["messages-waiting", "accounts-by-status", "archive-room"] },
}
