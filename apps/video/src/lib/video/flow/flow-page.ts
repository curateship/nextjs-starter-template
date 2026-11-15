import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

import { FLOW_TABS, type FlowTab } from "./flow-search"

/**
 * The Flow dashboard's left page, one per person, beside every section (the
 * Admin 3 panel design, as Automations' page is: `automation-page.ts`).
 *
 * The Dashboards block is fixed: it is never offered in the "/" list, the
 * editor refuses to take it off, the server puts it back at the top of a
 * page saved without it, and its ⋮ moves it up and down.
 */
export const FLOW_SECTIONS_NODE = "noteVideoFlowSections"

/**
 * Every block node the page may hold beyond the shell's basic ones. The
 * editor and the server both clean a page with it, so a block missing here
 * is dropped on save.
 */
export function flowPageBlockTypes(): readonly string[] {
  return [FLOW_SECTIONS_NODE]
}

/** A page nobody has written on: the Dashboards block, then one empty line. */
export function defaultFlowPage(): NoteNode {
  return { type: "doc", content: [{ type: FLOW_SECTIONS_NODE }, { type: "paragraph" }] }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withFlowSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, FLOW_SECTIONS_NODE)
}

/** Only real section names, each once: what a hidden list or an order may hold. */
export function cleanFlowSections(value: unknown): FlowTab[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((one): one is FlowTab => (FLOW_TABS as readonly string[]).includes(one)))]
}
