import {
  writtenPageText,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { isListingCard, type PostBody } from "@/lib/posts/post-body"

/**
 * The headings a post's contents list is built from, and the anchor ids the
 * body draws them with.
 *
 * Both sides read this one function, so the link in the sidebar and the id on
 * the heading can never disagree. The id is made from the heading's own words
 * rather than its position, so an address a visitor copied still lands on the
 * same heading after a paragraph is added above it.
 */

export type PostHeading = { id: string; text: string; index: number }

/**
 * The level the shell's renderer actually draws, which is not always the level
 * stored. `written-page-body.tsx` falls back to 2 for anything that is not 3
 * or 4, and the contents list only holds the top level, so it has to agree.
 */
function drawnLevel(node: WrittenPageNode): number {
  return node.attrs?.level === 4 ? 4 : node.attrs?.level === 3 ? 3 : 2
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "section"
}

function uniqueId(text: string, used: Set<string>): string {
  const base = slugify(text)
  let id = base
  let next = 2
  while (used.has(id)) {
    id = `${base}-${next}`
    next += 1
  }
  used.add(id)
  return id
}

function headingText(node: WrittenPageNode): string {
  return writtenPageText(node).replace(/\s+/g, " ").trim()
}

/** The post's top-level headings, in the order they are drawn. */
export function postHeadings(body: PostBody): PostHeading[] {
  const used = new Set<string>()
  const headings: PostHeading[] = []

  for (const [index, block] of (body.content ?? []).entries()) {
    if (isListingCard(block)) continue
    if (block.type !== "heading" || drawnLevel(block) !== 2) continue
    const text = headingText(block)
    if (!text) continue
    headings.push({ id: uniqueId(text, used), text, index })
  }

  return headings
}
