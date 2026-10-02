import { describe, expect, it } from "vitest"

import { postArrivedCut } from "@/lib/trade/social/post-text"

/**
 * The real shapes, taken from the live database on 2 Oct 2026. A post that
 * arrived cut is the only case the window adds a line for, so a false positive
 * costs a reader a warning about a post that is perfectly whole.
 */
const CUT =
  "no other new memecoin launched in the past year has pulled numbers like Super Inu / $SI\n\nnot a single one\n\nto put it in perspective, $SI achieved:\n\n• 60,000 holders within one week of launch\n• 30,000+ new holders in a single day\n• $110M+ onchain volume yesterday + the day https://t.co/JHB64TVIrQ"

describe("spotting a post X would not serve whole", () => {
  it("knows the cut shape: long, and ending on a t.co link", () => {
    expect(CUT.length).toBeGreaterThan(240)
    expect(postArrivedCut(CUT)).toBe(true)
  })

  it("leaves a short post ending in a link alone", () => {
    expect(postArrivedCut("gm https://t.co/abc123")).toBe(false)
  })

  it("leaves a long post that simply ends in words alone", () => {
    expect(postArrivedCut("word ".repeat(80).trim())).toBe(false)
  })

  it("wants the link at the very end, not in the middle", () => {
    const middle = `${"word ".repeat(60)}https://t.co/abc123 and then more words`
    expect(middle.length).toBeGreaterThan(240)
    expect(postArrivedCut(middle)).toBe(false)
  })

  it("ignores trailing whitespace around the link", () => {
    expect(postArrivedCut(`${CUT}\n\n  `)).toBe(true)
  })

  it("says nothing about an empty post", () => {
    expect(postArrivedCut("")).toBe(false)
  })
})
