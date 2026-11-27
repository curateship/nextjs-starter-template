import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { noteIsEmpty, type NoteNode } from "@/lib/notes/note-blocks"
import { readPageBody, storedPageBody } from "@/lib/notes/page-body"

/**
 * A project's description, written from the Description row of its ⋮'s General tab in the shared
 * editor (left-column-standards task, part 4; Tyler, 5 Nov 2026:
 * "we aleady have the tip tap rich text editor"). `promo_projects.description`
 * holds the editor's document as JSON, or "" for none; `drizzle/0138` turned
 * each older plain description into one paragraph per line.
 *
 * The AI and the Projects table read it as plain words through
 * `projectDescriptionText`, never the document.
 */

/** Said when a save starts from a page that is no longer the stored one. */
export const PROJECT_DESCRIPTION_MOVED =
  "This description changed somewhere else, in another tab or by a guest. Reload the page to see it, then write again."

/** The most letters a description holds, as before it was written in the editor. */
export const PROJECT_DESCRIPTION_MAX = 4_000

/**
 * The most characters of saved document. Formatting and empty paragraphs hold
 * no letters, so this caps what the letters rule cannot: 4,000 letters as a
 * document of bold words and lists stays well under it.
 */
export const PROJECT_DESCRIPTION_STORED_MAX = 64_000

/*
 * The description held fixed blocks until 27 Nov 2026: Promo's Networks
 * block (titled Promote in Content) and Content's Dashboards, Viral, Content,
 * Research and Videos. They made the project's own left panel. A project now
 * opens under the Projects dashboard's left panel, with Content, Research and
 * Promote as tabs in the middle (Tyler, 27 Nov 2026: "The idea is we move all
 * the blocks per project to the middle panel"), so the description is words
 * and the shell's basic blocks alone. A page saved with a fixed block is read
 * and saved without it, as any block the page does not know.
 */

/**
 * The project's description for the editor: the saved document, cleaned to
 * the words and the basic blocks. A description saved before 12 Nov 2026,
 * words and formatting only, reads the same.
 */
export function projectDescriptionPage(stored: string): string {
  return JSON.stringify(readPageBody(stored))
}

/**
 * What is saved for a page the editor sent: the document cleaned to the
 * words and the basic blocks. "" when it holds no words and no block, so an
 * empty description still reads as none.
 */
export function storedProjectPage(text: string): string {
  const stored = storedPageBody(text)
  if (!stored) return ""
  return noteIsEmpty(JSON.parse(stored) as NoteNode) ? "" : stored
}

/** The saved description as the editor's document; "" is an empty one. */
export function readProjectDescription(stored: string): WrittenPageNode {
  return stored ? cleanWrittenPageBody(JSON.parse(stored)) : emptyWrittenPageBody()
}

/** What is saved for a document: "" when nothing is written, so an empty one reads as none. */
export function storedProjectDescription(body: WrittenPageNode): string {
  return descriptionWords(body).trim() ? JSON.stringify(body) : ""
}

/**
 * The description as plain words, a line per paragraph, heading or list item,
 * for the AI and for the Projects table's search and hover.
 */
export function projectDescriptionText(stored: string): string {
  return descriptionWords(readProjectDescription(stored)).trim()
}

const BLOCKS = new Set<WrittenPageNode["type"]>(["paragraph", "heading", "listItem", "blockquote"])

function descriptionWords(node: WrittenPageNode): string {
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  const children = node.content ?? []
  // A list item holds its own paragraph, so only the innermost block breaks the line.
  const words = children.map(descriptionWords).join(children.some((child) => BLOCKS.has(child.type)) ? "\n" : "")
  return words.replace(/\n{3,}/g, "\n\n")
}
