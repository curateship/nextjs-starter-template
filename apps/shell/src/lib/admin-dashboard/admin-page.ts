import { appBlockNodeName } from "@/lib/admin-dashboard/admin-additions"
import { appAdminBlocks } from "@/lib/app-options"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Admin dashboard's page, on the left beside every section (Tyler, 8 Nov
 * 2026: Plans "as well as a block"). Overview's right page went the same day
 * ("Remove the right panel for overview dashboard"), so the left is the only
 * side; the table keeps its side column for it.
 */
export const ADMIN_PAGE_SIDES = ["left"] as const
export type AdminPageSide = (typeof ADMIN_PAGE_SIDES)[number]

/**
 * The Dashboards block: Overview, Users, Feedback and Media library, one row
 * each, on the left page. It is fixed (Tyler, 8 Nov 2026: "It can be a fixed
 * block but I'd need to be able to move it too"): it is never offered in the
 * "/" list, the editor refuses to take it off, the server puts it back at the
 * top of a page saved without it, and its ⋮ moves it up and down.
 */
export const ADMIN_SECTIONS_NODE = "noteAdminSections"

/** The shell's own Admin blocks' keys, which an app's may not reuse. */
export const SHELL_ADMIN_BLOCK_KEYS = ["sections", "plans"] as const

/** The shell's own block nodes. */
const SHELL_ADMIN_BLOCK_TYPES = [ADMIN_SECTIONS_NODE, "noteAdminPlans"] as const

/**
 * Every block node an Admin page may hold: the shell's, then the app's own
 * (`admin.blocks` in the app's `src/app/options.ts`). The editor and the
 * server both clean a page with this list, so a block missing here is
 * dropped on save. Only the app's keys are read, never its components, so
 * the server can call it.
 */
export function adminPageBlockTypes(): readonly string[] {
  return [
    ...SHELL_ADMIN_BLOCK_TYPES,
    ...appAdminBlocks(SHELL_ADMIN_BLOCK_KEYS).map((block) => appBlockNodeName(block.key)),
  ]
}

/** A page nobody has written on: Dashboards, then Plans. */
export function defaultAdminPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: ADMIN_SECTIONS_NODE }, { type: "noteAdminPlans" }, { type: "paragraph" }],
  }
}

/**
 * The page with its Dashboards block: a page saved before the block
 * existed, or one that lost it some other way, gets it back at the top, and
 * a second one is dropped. A page already holding exactly one comes back as
 * it was, the block wherever it was moved to.
 */
export function withSectionsBlock(body: NoteNode): NoteNode {
  const content = body.content ?? []
  let seen = false
  const kept = content.filter((node) => {
    if (node.type !== ADMIN_SECTIONS_NODE) return true
    if (seen) return false
    seen = true
    return true
  })
  if (seen) return kept.length === content.length ? body : { ...body, content: kept }
  return { ...body, content: [{ type: ADMIN_SECTIONS_NODE }, ...kept] }
}
