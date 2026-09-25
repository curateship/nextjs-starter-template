import { ListingCard } from "@/components/directory/public/listing-grid"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import type { PublicListingCard } from "@/lib/api/directory/public"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import {
  isListingCard,
  type PostBody as PostBodyValue,
} from "@/lib/posts/post-body"

/**
 * Draws a post's body. The written blocks go through the shell's own renderer,
 * which builds React elements and never a string of markup. Each listing card
 * is the directory's own card, looked up by id in `listingCards`.
 *
 * A card whose listing is not in `listingCards` draws nothing. That is how a
 * listing that became a draft, was deleted, or sits on another site drops out
 * of a post without breaking it.
 */
export function PostBody({
  body,
  listingCards,
}: {
  body: PostBodyValue
  listingCards: PublicListingCard[]
}) {
  const cardsById = new Map(listingCards.map((card) => [card.id, card]))

  // Runs of written blocks are drawn together, so the spacing between two
  // paragraphs is the written-page renderer's own and not this file's.
  const pieces: Array<
    | { kind: "words"; blocks: WrittenPageNode[] }
    | { kind: "card"; card: PublicListingCard }
  > = []
  for (const block of body.content ?? []) {
    if (isListingCard(block)) {
      const card = cardsById.get(block.attrs.listingId)
      if (card) pieces.push({ kind: "card", card })
      continue
    }
    const last = pieces.at(-1)
    if (last?.kind === "words") last.blocks.push(block)
    else pieces.push({ kind: "words", blocks: [block] })
  }

  return (
    <div className="grid gap-4">
      {pieces.map((piece, index) =>
        piece.kind === "card" ? (
          // An inline box inside a plain block, so the card lines up with
          // the site's own text alignment, the same as the words around it.
          <div key={index}>
            <div className="inline-flex w-full sm:max-w-sm">
              <ListingCard listing={piece.card} />
            </div>
          </div>
        ) : (
          <WrittenPageBody
            key={index}
            body={{ type: "doc", content: piece.blocks }}
          />
        )
      )}
    </div>
  )
}
