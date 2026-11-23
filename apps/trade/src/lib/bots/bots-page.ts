import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Bots dashboard's left page (9 Nov 2026), one per person. Tyler: "if we
 * combine all the sidebars, there's like 3 sidebar on the left", so the left
 * panel is only ever this page, whatever is open in the middle.
 *
 * The Dashboards block picks the section: Overview, Recipes, Backtests or
 * Bots. It is fixed, as Admin's is: never offered in the "/" list, the editor
 * refuses to take it off, the server puts it back at the top of a page saved
 * without it, and its ⋮ moves it up and down. The page offers the shell's
 * basic blocks only; Trade's trading blocks need an exchange, which this
 * dashboard has none of.
 */
export const BOTS_SECTIONS_NODE = "noteBotsSections"

/** Every app block a Bots page may hold. The editor and the server clean with the same list. */
export const BOTS_PAGE_BLOCK_TYPES = [BOTS_SECTIONS_NODE] as const

/** A page nobody has written on: the Dashboards block, then an empty line. */
export function defaultBotsPage(): NoteNode {
  return { type: "doc", content: [{ type: BOTS_SECTIONS_NODE }, { type: "paragraph" }] }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withBotsSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, BOTS_SECTIONS_NODE)
}

/** What a refused save says, on the server and in the browser's toast alike. */
export const BOTS_PAGE_LOCKED = "This page is locked. Unlock the notes to change it."
export const BOTS_PAGE_TOO_LONG = "This page is too long to save."
