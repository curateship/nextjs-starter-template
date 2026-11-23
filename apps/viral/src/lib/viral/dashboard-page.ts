import { ArchiveIcon, FlameIcon, type LucideIcon } from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Viral dashboard's left page, one per person, and its Overview widgets
 * (task features/03), the same shape as Directory's Events dashboard
 * (`events-dashboard-page.ts`). The page's own "/" blocks keep no values:
 * each draws what the dashboard already knows. The editor and the server
 * both clean a page with this list, so a block missing here is dropped.
 */

/** The Dashboards block: one row per section, fixed. */
export const VIRAL_SECTIONS_NODE = "noteViralSections"

/** Projects: "All projects", then each project with its count; narrows Vault, Hooks and Formats. */
export const VIRAL_PROJECTS_NODE = "noteViralProjects"

/** Folders: All, No folder, each folder and Archived; narrows the Projects row. */
export const VIRAL_FOLDERS_NODE = "noteViralFolders"

export const VIRAL_PAGE_BLOCK_TYPES = [VIRAL_SECTIONS_NODE, VIRAL_PROJECTS_NODE, VIRAL_FOLDERS_NODE] as const

export const VIRAL_PAGE_ERRORS = {
  tooLong: "The page is too long to save. Take some of it out and try again.",
  locked: "The page is locked. Unlock the notes in its ⋮ first.",
} as const

/** A page nobody has written on: Dashboards, then Projects, then Folders. */
export function defaultViralPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: VIRAL_SECTIONS_NODE }, { type: VIRAL_PROJECTS_NODE }, { type: VIRAL_FOLDERS_NODE }, { type: "paragraph" }],
  }
}

export function withViralSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, VIRAL_SECTIONS_NODE)
}

/** Overview's widgets: Today's two tables (Tyler, 19 Nov 2026: "Today's two tables become Overview widgets"). */
const VIRAL_WIDGETS = [
  { id: "new-and-rising", label: "New and rising", icon: FlameIcon },
  { id: "vault-by-status", label: "Vault by status", icon: ArchiveIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type ViralWidgetId = (typeof VIRAL_WIDGETS)[number]["id"]

export const VIRAL_WIDGET_IDS: readonly string[] = VIRAL_WIDGETS.map((widget) => widget.id)

export const VIRAL_WIDGET_OFFER: WidgetOffer = { choices: VIRAL_WIDGETS }

export function findViralWidget(id: string) {
  return VIRAL_WIDGETS.find((widget) => widget.id === id)
}

/** What Overview starts with: the two side by side, filling the panel. */
export const DEFAULT_VIRAL_WIDGETS: WidgetLayout = {
  top: { columns: 2, spots: ["new-and-rising", "vault-by-status"] },
  bottom: { columns: 0, spots: [] },
}
