import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Library dashboard's left page, one per person (Tyler, 15 Nov 2026: "I
 * think the library should live as a left panel dashboard block"). Its own
 * "/" blocks keep no values: each draws what the dashboard already knows
 * about the library picked. The editor and the server both clean a page with
 * this list, so a block missing here is dropped on save.
 */
export const LIBRARIES_NODE = "noteLibraries"
export const TAGS_NODE = "noteLibraryTags"

/**
 * Pinned, Folders, Authors and Recently opened went on 15 Nov 2026 (Tyler:
 * "remove the pinned block and move them as middle tab", "Remove folder block
 * and folder feature. Remove the authors block. Remove the recenetly opened
 * block"). A page saved with them loses them on its next read, since the
 * cleaning drops a block not listed here.
 */
export const LIBRARY_PAGE_BLOCK_TYPES = [LIBRARIES_NODE, TAGS_NODE] as const

/** A page nobody has written on: the fixed Libraries block, then Tags. */
export function defaultLibraryPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: LIBRARIES_NODE }, { type: TAGS_NODE }, { type: "paragraph" }],
  }
}

/**
 * The page with its one Libraries block (`withFixedBlock`): fixed, as the
 * Admin and CRM pages' Dashboards blocks are. Never offered in the "/" list,
 * the editor refuses to take it off, the server puts it back at the top of a
 * page saved without it, and its ⋮ moves it up and down.
 */
export function withLibrariesBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, LIBRARIES_NODE)
}
