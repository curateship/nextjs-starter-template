import { ListingCard } from "@/components/directory/public/listing-grid"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import type { PublicListingCard } from "@/lib/api/directory/public"
import { usePublicHeader } from "@/lib/branding"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import {
  isListingCard,
  type PostBody as PostBodyValue,
} from "@/lib/posts/post-body"
import { postHeadings } from "@/lib/posts/post-headings"

/**
 * Draws a post's body. The written blocks go through the shell's own renderer,
 * which builds React elements and never a string of markup. Each listing card
 * is the directory's own card, looked up by id in `listingCards`.
 *
 * A card whose listing is not in `listingCards` draws nothing. That is how a
 * listing that became a draft, was deleted, or sits on another site drops out
 * of a post without breaking it.
 *
 * A top-level heading is drawn on its own, inside a box carrying the id the
 * contents list on the right links to. The heading itself still goes through
 * the shell's renderer, so its size and weight are the shell's and this file
 * holds no second copy of them.
 */
export function PostBody({
  body,
  listingCards,
}: {
  body: PostBodyValue
  listingCards: PublicListingCard[]
}) {
  const cardsById = new Map(listingCards.map((card) => [card.id, card]))
  // A heading jumped to from the contents list stops below the header
  // rather than behind it, and the header is only in the way on a site that
  // keeps it on screen while the page scrolls.
  const headingStop = usePublicHeader().sticky ? "scroll-mt-24" : "scroll-mt-4"
  const anchorByIndex = new Map(
    postHeadings(body).map((heading) => [heading.index, heading.id])
  )

  // Runs of written blocks are drawn together, so the spacing between two
  // paragraphs is the written-page renderer's own and not this file's.
  const pieces: Array<
    | { kind: "words"; blocks: WrittenPageNode[] }
    | { kind: "heading"; block: WrittenPageNode; id: string }
    | { kind: "card"; card: PublicListingCard }
  > = []
  for (const [index, block] of (body.content ?? []).entries()) {
    if (isListingCard(block)) {
      const card = cardsById.get(block.attrs.listingId)
      if (card) pieces.push({ kind: "card", card })
      continue
    }
    const anchor = anchorByIndex.get(index)
    if (anchor) {
      pieces.push({ kind: "heading", block, id: anchor })
      continue
    }
    const last = pieces.at(-1)
    if (last?.kind === "words") last.blocks.push(block)
    else pieces.push({ kind: "words", blocks: [block] })
  }

  return (
    <div className="grid gap-4">
      {pieces.map((piece, index) => {
        if (piece.kind === "card") {
          return (
            // An inline box inside a plain block, so the card lines up with
            // the site's own text alignment, the same as the words around it.
            <div key={index}>
              <div className="inline-flex w-full sm:max-w-sm">
                <ListingCard listing={piece.card} />
              </div>
            </div>
          )
        }

        if (piece.kind === "heading") {
          return (
            <div key={index} id={piece.id} className={headingStop}>
              <WrittenPageBody body={{ type: "doc", content: [piece.block] }} />
            </div>
          )
        }

        return (
          <WrittenPageBody
            key={index}
            body={{ type: "doc", content: piece.blocks }}
          />
        )
      })}
    </div>
  )
}
