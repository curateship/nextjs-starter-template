import { describe, expect, it } from "vitest"

import { LISTING_CARD_NODE, type PostBody } from "@/lib/posts/post-body"
import { postHeadings } from "@/lib/posts/post-headings"

function words(text: string) {
  return [{ type: "text" as const, text }]
}

function body(content: PostBody["content"]): PostBody {
  return { type: "doc", content }
}

describe("postHeadings", () => {
  it("lists the top-level headings with an id made from their words", () => {
    expect(
      postHeadings(
        body([
          { type: "paragraph", content: words("Before.") },
          {
            type: "heading",
            attrs: { level: 2 },
            content: words("Best bakeries"),
          },
          { type: "paragraph", content: words("After.") },
        ])
      )
    ).toEqual([{ id: "best-bakeries", text: "Best bakeries", index: 1 }])
  })

  it("skips the deeper headings, so the list holds one level only", () => {
    const headings = postHeadings(
      body([
        { type: "heading", attrs: { level: 2 }, content: words("Top") },
        { type: "heading", attrs: { level: 3 }, content: words("Under it") },
        { type: "heading", attrs: { level: 4 }, content: words("Deeper") },
      ])
    )
    expect(headings.map((heading) => heading.text)).toEqual(["Top"])
  })

  it("numbers a repeated heading, so two links never point at one id", () => {
    const headings = postHeadings(
      body([
        { type: "heading", attrs: { level: 2 }, content: words("Coffee") },
        { type: "heading", attrs: { level: 2 }, content: words("Coffee") },
      ])
    )
    expect(headings.map((heading) => heading.id)).toEqual([
      "coffee",
      "coffee-2",
    ])
  })

  it("keeps the index of a heading that sits after a listing card", () => {
    const headings = postHeadings(
      body([
        { type: LISTING_CARD_NODE, attrs: { listingId: "a" } },
        { type: "heading", attrs: { level: 2 }, content: words("Where to go") },
      ])
    )
    expect(headings).toEqual([
      { id: "where-to-go", text: "Where to go", index: 1 },
    ])
  })

  it("drops a heading with no words, which has nothing to show or link to", () => {
    expect(
      postHeadings(
        body([{ type: "heading", attrs: { level: 2 }, content: [] }])
      )
    ).toEqual([])
  })
})
