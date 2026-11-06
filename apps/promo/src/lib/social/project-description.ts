import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * A project's description, written in place at the top of its left column in
 * the shared editor (left-column-standards task, part 4; Tyler, 5 Nov 2026:
 * "we aleady have the tip tap rich text editor"). `promo_projects.description`
 * holds the editor's document as JSON, or "" for none; `drizzle/0138` turned
 * each older plain description into one paragraph per line.
 *
 * The AI and the Projects table read it as plain words through
 * `projectDescriptionText`, never the document.
 */

/** The most letters a description holds, as before it was written in the editor. */
export const PROJECT_DESCRIPTION_MAX = 4_000

/**
 * The most characters of saved document. Formatting and empty paragraphs hold
 * no letters, so this caps what the letters rule cannot: 4,000 letters as a
 * document of bold words and lists stays well under it.
 */
export const PROJECT_DESCRIPTION_STORED_MAX = 64_000

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
