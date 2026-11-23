import { describe, expect, it } from "vitest"

import { emptyPostBody, type PostBody } from "@/lib/posts/post-body"
import { readMinutes } from "@/lib/posts/read-time"

function bodyOf(words: number): PostBody {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: Array(words).fill("word").join(" ") }],
      },
    ],
  }
}

describe("how long a post takes to read", () => {
  it("counts 200 words to the minute", () => {
    expect(readMinutes(bodyOf(200))).toBe(1)
    expect(readMinutes(bodyOf(800))).toBe(4)
  })

  it("rounds to the nearest minute", () => {
    expect(readMinutes(bodyOf(500))).toBe(3)
    expect(readMinutes(bodyOf(499))).toBe(2)
  })

  it("never says less than a minute", () => {
    expect(readMinutes(emptyPostBody())).toBe(1)
    expect(readMinutes(bodyOf(3))).toBe(1)
  })

  it("does not count the listing cards in a post", () => {
    const withCard: PostBody = {
      type: "doc",
      content: [
        ...(bodyOf(200).content ?? []),
        { type: "listingCard", attrs: { listingId: "listing-1" } },
      ],
    }

    expect(readMinutes(withCard)).toBe(1)
  })
})
