import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The CRM dashboard's own "/" blocks on its left page (the Admin 3 panel
 * design, 7 Nov 2026; Tyler: "Left panel list blocks like emails"). Each
 * keeps no values: it draws what the CRM already knows. The editor and the
 * server both clean a page with this list, so a block missing here is
 * dropped on save.
 */
export const CRM_PAGE_BLOCK_TYPES = [
  "noteCrmSections",
  "noteCrmFollowUps",
  "noteCrmStages",
  "noteCrmWaiting",
  "noteCrmSegments",
] as const
export type CrmPageBlockType = (typeof CRM_PAGE_BLOCK_TYPES)[number]

/**
 * The Dashboards block: Overview, Inbox, People and Broadcasts, one row each,
 * in place of the middle header's tabs (Tyler, 8 Nov 2026: "We need to get
 * the CRM dashboard up to date with the new admin dashboard"). Fixed, as the
 * Admin page's is: never offered in the "/" list, the editor refuses to take
 * it off, the server puts it back at the top of a page saved without it, and
 * its ⋮ moves it up and down.
 */
export const CRM_SECTIONS_NODE = "noteCrmSections"

/**
 * A page nobody has written on starts with the Dashboards block, then Follow
 * up today. The addresses mail arrives at moved from a block here into the
 * CRM settings ⋮'s Emails tab (Tyler, 7 Nov 2026: "move the email block to
 * the settings").
 */
export function defaultCrmPage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: CRM_SECTIONS_NODE },
      { type: "noteCrmFollowUps" },
      { type: "paragraph" },
    ],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withCrmSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, CRM_SECTIONS_NODE)
}
