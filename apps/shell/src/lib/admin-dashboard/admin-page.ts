import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Admin dashboard's two pages: the left one, beside every tab, and the
 * right one, beside Overview (Tyler, 8 Nov 2026: Plans "as well as a block",
 * and the Overview's right panel cards "should be real blocks").
 */
export const ADMIN_PAGE_SIDES = ["left", "right"] as const
export type AdminPageSide = (typeof ADMIN_PAGE_SIDES)[number]

/**
 * The Admin dashboard's own "/" blocks, offered on both pages. Each keeps no
 * values: it draws what the dashboard reads for the range picked. The editor
 * and the server both clean a page with this list, so a block missing here is
 * dropped on save.
 */
export const ADMIN_PAGE_BLOCK_TYPES = [
  "noteAdminPlans",
  "noteAdminTopPages",
  "noteAdminDevices",
  "noteAdminReferrers",
  "noteAdminAiFeatures",
  "noteAdminAiModels",
  "noteAdminMeters",
] as const
export type AdminPageBlockType = (typeof ADMIN_PAGE_BLOCK_TYPES)[number]

/** The blocks that draw Overview's figures, so a page holding one needs them read. */
export const ADMIN_FIGURE_BLOCK_TYPES = ADMIN_PAGE_BLOCK_TYPES.filter((type) => type !== "noteAdminPlans")

/**
 * A page nobody has written on. The left one starts with the Plans block;
 * the right one starts empty, for blocks to be added with "/".
 */
export function defaultAdminPage(side: AdminPageSide): NoteNode {
  return {
    type: "doc",
    content: side === "left" ? [{ type: "noteAdminPlans" }, { type: "paragraph" }] : [{ type: "paragraph" }],
  }
}
