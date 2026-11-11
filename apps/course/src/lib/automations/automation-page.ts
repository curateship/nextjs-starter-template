import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Automations dashboard's left page, one per site, beside every section
 * (Tyler, 9 Nov 2026: "The dashboard block can have: Automations, Runs and
 * Waiting on you").
 *
 * The Dashboards block is fixed, as on the Admin page and the CRM's: it is
 * never offered in the "/" list, the editor refuses to take it off, the server
 * puts it back at the top of a page saved without it, and its ⋮ moves it up
 * and down.
 */
export const AUTOMATION_SECTIONS_NODE = "noteAutomationSections"

/**
 * Every block node the page may hold beyond the shell's basic ones. The
 * editor and the server both clean a page with it, so a block missing here
 * is dropped on save.
 */
export function automationPageBlockTypes(): readonly string[] {
  return [AUTOMATION_SECTIONS_NODE]
}

/** A page nobody has written on: the Dashboards block, then one empty line. */
export function defaultAutomationPage(): NoteNode {
  return { type: "doc", content: [{ type: AUTOMATION_SECTIONS_NODE }, { type: "paragraph" }] }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withAutomationSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, AUTOMATION_SECTIONS_NODE)
}
