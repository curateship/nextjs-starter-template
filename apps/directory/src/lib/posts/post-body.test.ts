import { describe, expect, it } from "vitest"

import {
  cleanPostBody,
  MAX_POST_LISTING_CARDS,
  postBodyText,
  postListingIds,
} from "@/lib/posts/post-body"

const LISTING = "0b7c6a52-1c1e-4f7e-9a0b-2d3c4e5f6a7b"

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] }
}

describe("what a post body may hold", () => {
  it("keeps a listing card as the listing's id and nothing else", () => {
    const body = cleanPostBody({
      type: "doc",
      content: [
        paragraph("Before"),
        {
          type: "listingCard",
          attrs: { listingId: LISTING, title: "Stale name", onclick: "x" },
        },
        paragraph("After"),
      ],
    })

    expect(body.content).toEqual([
      paragraph("Before"),
      { type: "listingCard", attrs: { listingId: LISTING } },
      paragraph("After"),
    ])
  })

  it("drops a card whose id cannot be a listing's", () => {
    const body = cleanPostBody({
      type: "doc",
      content: [
        { type: "listingCard", attrs: { listingId: "<script>" } },
        { type: "listingCard", attrs: {} },
      ],
    })
    expect(body.content).toEqual([])
  })

  it("drops a card anywhere but the top level, and anything a page may not hold", () => {
    const body = cleanPostBody({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "listingCard", attrs: { listingId: LISTING } },
                paragraph("Kept"),
              ],
            },
          ],
        },
        { type: "image", attrs: { src: "https://example.com/x.png" } },
      ],
    })

    expect(body.content).toEqual([
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("Kept")] }],
      },
    ])
  })

  it("caps the number of cards one post may hold", () => {
    const body = cleanPostBody({
      type: "doc",
      content: Array.from({ length: MAX_POST_LISTING_CARDS + 5 }, () => ({
        type: "listingCard",
        attrs: { listingId: LISTING },
      })),
    })
    expect(body.content).toHaveLength(MAX_POST_LISTING_CARDS)
  })

  it("turns anything that is not a document into an empty one", () => {
    expect(cleanPostBody("<p>hi</p>")).toEqual({ type: "doc", content: [] })
    expect(cleanPostBody(null)).toEqual({ type: "doc", content: [] })
    expect(cleanPostBody({ type: "paragraph" })).toEqual({
      type: "doc",
      content: [],
    })
  })

  it("lists each card's listing once and reads only the written words", () => {
    const body = cleanPostBody({
      type: "doc",
      content: [
        paragraph("One"),
        { type: "listingCard", attrs: { listingId: LISTING } },
        { type: "listingCard", attrs: { listingId: LISTING } },
        paragraph("Two"),
      ],
    })
    expect(postListingIds(body)).toEqual([LISTING])
    expect(postBodyText(body)).toBe("One Two")
  })
})
