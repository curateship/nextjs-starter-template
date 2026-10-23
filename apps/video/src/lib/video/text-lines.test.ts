import { describe, expect, it } from "vitest"

import { lineWidthRatio, requireTextFont } from "./text-fonts"
import { guessLineWidth, wrapTextLines } from "./text-lines"

describe("breaking text into lines", () => {
  // Ten pixels a letter, spaces included, so the sums are easy to check.
  const tenEach = (words: string) => words.length * 10

  it("breaks before the word that would pass the width", () => {
    expect(wrapTextLines("one two three four", 90, tenEach)).toEqual([
      "one two",
      "three",
      "four",
    ])
  })

  it("always breaks where a newline was typed, and keeps a long word whole", () => {
    expect(wrapTextLines("a\nunbreakableword", 50, tenEach)).toEqual([
      "a",
      "unbreakableword",
    ])
  })

  it("guesses words all in capitals wider than small letters", () => {
    const inter = requireTextFont("inter")
    expect(lineWidthRatio(inter, "SAID OUT LOUD")).toBe(inter.capitalsWidthRatio)
    expect(lineWidthRatio(inter, "Said out loud")).toBe(inter.widthRatio)
    expect(lineWidthRatio(inter, "123 456")).toBe(inter.widthRatio)
    const guess = guessLineWidth(inter, 100)
    expect(guess("ABC")).toBeGreaterThan(guess("abc"))
  })
})
