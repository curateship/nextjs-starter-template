import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The CRM dashboard's own "/" blocks on its left page (the Admin 3 panel
 * design, 7 Nov 2026; Tyler: "Left panel list blocks like emails"). Each
 * keeps no values: it draws what the CRM already knows. The editor and the
 * server both clean a page with this list, so a block missing here is
 * dropped on save.
 */
export const CRM_PAGE_BLOCK_TYPES = [
  "noteCrmFollowUps",
  "noteCrmStages",
  "noteCrmWaiting",
  "noteCrmSegments",
] as const
export type CrmPageBlockType = (typeof CRM_PAGE_BLOCK_TYPES)[number]

/**
 * A page nobody has written on starts with the Follow up today block. The
 * addresses mail arrives at moved from a block here into the CRM settings ⋮'s
 * Emails tab (Tyler, 7 Nov 2026: "move the email block to the settings").
 */
export function defaultCrmPage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: "noteCrmFollowUps" },
      { type: "paragraph" },
    ],
  }
}
