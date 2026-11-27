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
 * "Description page + Networks block"), titled Promote in Content: each
 * network's Posts and Commenting rows. Fixed, as the Dashboards block is: never in the "/"
 * list, never taken off, put back at the top of a page saved without it. It
 * keeps no values; the page draws it from the project.
 */
export const PROJECT_NETWORKS_NODE = "notePromoNetworks"

/**
 * Content's blocks above the Networks block (`workspace/docs/content-app.md`,
 * "A project's own page"), fixed as the Networks block is:
 *
 * - Dashboards (Overview and Projects) and Viral (Vault, Hooks and Formats),
 *   the Projects dashboard's two blocks on the project's page (Tyler, 27 Nov
 *   2026: "lets bring back the dashboard block for project. The only link we
 *   have there is overview, projects, vault, hook and format", and of the
 *   last three, "should be its own block called "Viral"").
 * - Content, the project's videos, carousels and pictures (Tyler, 27 Nov
 *   2026: "put content into its own block").
 * - Research, what Viral found for the project, and Videos, its videos.
 *
 * Promo's Archive block and Content's first Dashboard block, which held
 * Overview and Content, are gone; a page saved with either is cleaned of it,
 * as of any block it does not know.
 */
export const PROJECT_DASHBOARDS_NODE = "contentProjectDashboards"
export const PROJECT_VIRAL_NODE = "contentProjectViral"
export const PROJECT_CONTENT_NODE = "contentProjectContent"
export const PROJECT_RESEARCH_NODE = "contentProjectResearch"
export const PROJECT_VIDEOS_NODE = "contentProjectVideos"

/** The project page's own block names, which the editor and the server both clean a page with. */
export const PROJECT_PAGE_BLOCK_TYPES = [
  PROJECT_DASHBOARDS_NODE,
  PROJECT_VIRAL_NODE,
  PROJECT_CONTENT_NODE,
  PROJECT_RESEARCH_NODE,
  PROJECT_VIDEOS_NODE,
  PROJECT_NETWORKS_NODE,
] as const

/**
 * The page with each of its fixed blocks once. One that is missing goes on
 * top, so a new page reads Dashboards, Viral, Content, Research, Videos, then
 * the networks; one
 * that was moved stays where it was put.
 */
function withProjectBlocks(body: NoteNode): NoteNode {
  return [...PROJECT_PAGE_BLOCK_TYPES].reverse().reduce((page, type) => withFixedBlock(page, type), body)
}

/**
 * The project's page for the editor: the saved description, which since
 * 12 Nov 2026 may hold "/" blocks, with each of its fixed blocks once. A
 * description saved before then, words and formatting only, reads the same.
 */
export function projectDescriptionPage(stored: string): string {
  return JSON.stringify(withProjectBlocks(readPageBody(stored, PROJECT_PAGE_BLOCK_TYPES)))
}

/**
 * What is saved for a page the editor sent: the document cleaned to the
 * words, the basic blocks and the fixed blocks, each kept once. "" when it
 * holds no words and no block but the fixed ones, so an empty description
 * still reads as none.
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
