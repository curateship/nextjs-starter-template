import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The CRM dashboard's own "/" blocks on its left page (the Admin 3 panel
 * design, 7 Nov 2026; Tyler: "Left panel list blocks like emails"). Each
 * keeps no values: it draws what the CRM already knows. The editor and the
 * server both clean a page with this list, so a block missing here is
 * dropped on save.
 */
export const CRM_PAGE_BLOCK_TYPES = [
  "noteCrmEmails",
  "noteCrmFollowUps",
  "noteCrmStages",
  "noteCrmWaiting",
] as const
export type CrmPageBlockType = (typeof CRM_PAGE_BLOCK_TYPES)[number]

/** A page nobody has written on starts with the Emails and Follow up today blocks. */
export function defaultCrmPage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: "noteCrmEmails" },
      { type: "noteCrmFollowUps" },
      { type: "paragraph" },
    ],
  }
}
