import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { withFixedBlock } from "@/lib/notes/fixed-block"
import { noteIsEmpty, type NoteNode } from "@/lib/notes/note-blocks"
import { readPageBody, storedPageBody } from "@/lib/notes/page-body"

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

/**
 * The Networks block at the top of a project's page (Tyler, 12 Nov 2026:
 * "Description page + Networks block"): each network's Posts and Commenting
 * rows, then the Archive. Fixed, as the Dashboards block is: never in the "/"
 * list, never taken off, put back at the top of a page saved without it. It
 * keeps no values; the page draws it from the project.
 */
export const PROJECT_NETWORKS_NODE = "notePromoNetworks"

/**
 * The Archive block, under the Networks block: the project's videos,
 * carousels and pictures, opening them in the middle and right panels (Tyler,
 * 12 Nov 2026: "move the archive to its own block"). Fixed too, so no page
 * loses its way to the Archive; a page saved without it gets it back under
 * the Networks block.
 */
export const PROJECT_ARCHIVE_NODE = "notePromoArchive"

/** The project page's own block names, which the editor and the server both clean a page with. */
export const PROJECT_PAGE_BLOCK_TYPES = [PROJECT_NETWORKS_NODE, PROJECT_ARCHIVE_NODE] as const

/** The page with its one Networks block, and its one Archive block, under Networks when it was missing. */
function withProjectBlocks(body: NoteNode): NoteNode {
  const withNetworks = withFixedBlock(body, PROJECT_NETWORKS_NODE)
  const content = withNetworks.content ?? []
  if (content.some((node) => node.type === PROJECT_ARCHIVE_NODE)) return withFixedBlock(withNetworks, PROJECT_ARCHIVE_NODE)
  const at = content.findIndex((node) => node.type === PROJECT_NETWORKS_NODE) + 1
  return { ...withNetworks, content: [...content.slice(0, at), { type: PROJECT_ARCHIVE_NODE }, ...content.slice(at)] }
}

/**
 * The project's page for the editor: the saved description, which since
 * 12 Nov 2026 may hold "/" blocks, with its one Networks block on top and
 * its one Archive block. A
 * description saved before then, words and formatting only, reads the same.
 */
export function projectDescriptionPage(stored: string): string {
  return JSON.stringify(withProjectBlocks(readPageBody(stored, PROJECT_PAGE_BLOCK_TYPES)))
}

/**
 * What is saved for a page the editor sent: the document cleaned to the
 * words, the basic blocks and the Networks and Archive blocks, each kept
 * once. "" when it holds no words and no block but Networks, so an empty
 * description still reads as none.
 */
export function storedProjectPage(text: string): string {
  const stored = storedPageBody(text, PROJECT_PAGE_BLOCK_TYPES)
  if (!stored) return ""
  const body = withProjectBlocks(JSON.parse(stored) as NoteNode)
  // Without app names, only words and the basic blocks count as something written.
  return noteIsEmpty(body) ? "" : JSON.stringify(body)
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
