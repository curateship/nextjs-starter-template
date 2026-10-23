import {
  cleanWrittenPageBody,
  writtenPageText,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * What a post's body may hold: everything a written page may, plus listing
 * cards.
 *
 * The written-page rules belong to the shell and stay closed, so this file
 * does not widen them. It walks the top level of the document itself, keeps a
 * listing card as nothing but the listing's id, and hands every other block to
 * `cleanWrittenPageBody`. A card can only sit at the top level, between
 * paragraphs, never inside a list or a quote.
 *
 * The card stores the id alone on purpose. The title, photo and rating are read
 * from the listing when the page is drawn, so a renamed listing shows its new
 * name and a listing that became a draft or was deleted simply is not drawn.
 */

export const LISTING_CARD_NODE = "listingCard"

export type ListingCardNode = {
  type: typeof LISTING_CARD_NODE
  attrs: { listingId: string }
}

export type PostBlock = WrittenPageNode | ListingCardNode

export type PostBody = { type: "doc"; content?: PostBlock[] }

/** How many listing cards one post may hold. */
export const MAX_POST_LISTING_CARDS = 50

/** A listing id is a uuid; anything else cannot be one and is dropped. */
const LISTING_ID = /^[a-zA-Z0-9-]{1,36}$/

export function emptyPostBody(): PostBody {
  return { type: "doc", content: [] }
}

export function isListingCard(block: PostBlock): block is ListingCardNode {
  return block.type === LISTING_CARD_NODE
}

/**
 * Takes whatever arrived and returns only the shapes a post allows. Dropping
 * rather than rejecting, for the same reason written pages do: a missing
 * paragraph is something an admin can see and fix, and a refused save is not.
 */
export function cleanPostBody(value: unknown): PostBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyPostBody()
  }
  const raw = value as { type?: unknown; content?: unknown }
  if (raw.type !== "doc") return emptyPostBody()

  const content: PostBlock[] = []
  let cards = 0
  for (const child of Array.isArray(raw.content) ? raw.content : []) {
    const card = cleanListingCard(child)
    if (card) {
      if (cards >= MAX_POST_LISTING_CARDS) continue
      cards += 1
      content.push(card)
      continue
    }
    const [block] =
      cleanWrittenPageBody({ type: "doc", content: [child] }).content ?? []
    if (block) content.push(block)
  }
  return { type: "doc", content }
}

function cleanListingCard(value: unknown): ListingCardNode | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { type?: unknown; attrs?: { listingId?: unknown } }
  if (raw.type !== LISTING_CARD_NODE) return null
  const id = raw.attrs?.listingId
  if (typeof id !== "string" || !LISTING_ID.test(id)) return null
  return { type: LISTING_CARD_NODE, attrs: { listingId: id } }
}

/** Every listing a post points at, in the order the cards appear, once each. */
export function postListingIds(body: PostBody): string[] {
  const ids = (body.content ?? [])
    .filter(isListingCard)
    .map((card) => card.attrs.listingId)
  return [...new Set(ids)]
}

/** The post's words as plain text, for search and summaries. Cards have none. */
export function postBodyText(body: PostBody): string {
  return (body.content ?? [])
    .filter((block): block is WrittenPageNode => !isListingCard(block))
    .map(writtenPageText)
    .join(" ")
}
