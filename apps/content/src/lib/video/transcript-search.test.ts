import { describe, expect, it } from "vitest"

import { findSaidPlaces, type SaidWord } from "@/lib/video/transcript-search"

/** A talk, one word every 400 milliseconds. */
function talk(text: string): SaidWord[] {
  return text.split(" ").map((word, index) => ({
    text: word,
    startMs: index * 400,
    endMs: index * 400 + 300,
  }))
}

const words = talk(
  "Today we talk about Pricing, then pricing tiers. Our pricing is simple and the price is fair"
)

describe("finding where something was said", () => {
  it("finds each time a word was said, whatever its capitals and punctuation", () => {
    const places = findSaidPlaces(words, "pricing")
    expect(places.map((place) => place.match)).toEqual(["Pricing,", "pricing", "pricing"])
    expect(places.map((place) => place.startMs)).toEqual([4 * 400, 6 * 400, 9 * 400])
  })

  it("finds words said one after another, and only there", () => {
    const places = findSaidPlaces(words, "our pricing")
    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({ index: 8, length: 2, match: "Our pricing" })
  })

  it("finds a word half typed", () => {
    expect(findSaidPlaces(words, "pric")).toHaveLength(4)
  })

  it("shows a few words either side", () => {
    const [first] = findSaidPlaces(words, "pricing")
    expect(first.before).toBe("Today we talk about")
    expect(first.after).toBe("then pricing tiers. Our")
  })

  it("finds nothing for an empty search", () => {
    expect(findSaidPlaces(words, "   ")).toEqual([])
  })

  it("never finds a word already cut from the film", () => {
    const places = findSaidPlaces(words, "pricing", (index) => index === 6)
    expect(places.map((place) => place.index)).toEqual([4, 9])
  })
})
