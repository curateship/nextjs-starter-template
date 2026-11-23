import { describe, expect, it } from "vitest"

import {
  ascending,
  firstOpenAfter,
  firstOpenAtOrAfter,
  lastClosedIndex,
} from "@/lib/trade/candle-window"
import type { CandleBar } from "@/lib/protocols/contracts"

const BAR = 3_600_000

function bars(times: number[]): CandleBar[] {
  return times.map((openTime) => ({
    openTime,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 10,
  }))
}

const inOrder = bars([0, BAR, BAR * 2, BAR * 3, BAR * 4])

describe("putting a run of candles in order", () => {
  it("hands back the very same list when it was already in order", () => {
    // Identity, not just equality. What a run of candles means is remembered
    // against the list itself, so a fresh copy each time would remember
    // nothing and the whole saving would go.
    expect(ascending(inOrder)).toBe(inOrder)
  })

  it("sorts one that was not, and gives the same answer twice", () => {
    const jumbled = bars([BAR * 2, 0, BAR * 4, BAR, BAR * 3])
    const sorted = ascending(jumbled)

    expect(sorted.map((bar) => bar.openTime)).toEqual([
      0,
      BAR,
      BAR * 2,
      BAR * 3,
      BAR * 4,
    ])
    expect(ascending(jumbled)).toBe(sorted)
    // And asking about the sorted copy is a dead end rather than another sort.
    expect(ascending(sorted)).toBe(sorted)
  })
})

describe("finding the candle a moment lands in", () => {
  it("names the newest candle that had already finished", () => {
    // A candle is named by the moment it OPENED, so the one opening at 2h has
    // finished at 3h and not a moment before.
    expect(lastClosedIndex(inOrder, BAR, BAR * 3)).toBe(2)
    expect(lastClosedIndex(inOrder, BAR, BAR * 3 - 1)).toBe(1)
    expect(lastClosedIndex(inOrder, BAR, BAR * 99)).toBe(4)
  })

  it("says -1 when nothing had finished yet", () => {
    expect(lastClosedIndex(inOrder, BAR, 0)).toBe(-1)
    expect(lastClosedIndex(inOrder, BAR, BAR - 1)).toBe(-1)
    expect(lastClosedIndex(bars([]), BAR, BAR * 99)).toBe(-1)
  })

  it("names where a pass should pick up from", () => {
    expect(firstOpenAfter(inOrder, BAR)).toBe(2)
    expect(firstOpenAtOrAfter(inOrder, BAR)).toBe(1)
    expect(firstOpenAfter(inOrder, -1)).toBe(0)
    // Past the end means there is nothing to walk, and the loop it feeds ends
    // straight away rather than reading off the end of the list.
    expect(firstOpenAfter(inOrder, BAR * 99)).toBe(inOrder.length)
  })

  it("agrees with walking the whole list, at every moment", () => {
    for (let step = -2; step <= 12; step += 1) {
      const now = (step * BAR) / 2
      const walked = inOrder.filter((bar) => bar.openTime + BAR <= now).length - 1
      expect(lastClosedIndex(inOrder, BAR, now)).toBe(walked)
      expect(firstOpenAfter(inOrder, now)).toBe(
        inOrder.filter((bar) => bar.openTime <= now).length
      )
    }
  })
})
