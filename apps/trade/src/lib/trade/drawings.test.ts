import { describe, expect, it } from "vitest"

import { moveShape, readDrawingShape } from "@/lib/trade/drawings"

describe("reading a saved drawing", () => {
  it("reads a level and a trendline", () => {
    expect(readDrawingShape({ kind: "level", price: 61_500 })).toEqual({
      kind: "level",
      price: 61_500,
    })
    expect(
      readDrawingShape({
        kind: "trendline",
        from: { time: 1_000, price: 10 },
        to: { time: 2_000, price: 20 },
      })
    ).toEqual({
      kind: "trendline",
      from: { time: 1_000, price: 10 },
      to: { time: 2_000, price: 20 },
    })
  })

  it("drops a row it cannot read rather than guessing at it", () => {
    // A kind from a build this one does not know about.
    expect(readDrawingShape({ kind: "rectangle", price: 1 })).toBeNull()
    // A level with no price, and one whose price is not a number.
    expect(readDrawingShape({ kind: "level" })).toBeNull()
    expect(readDrawingShape({ kind: "level", price: "61500" })).toBeNull()
    expect(readDrawingShape({ kind: "level", price: Number.NaN })).toBeNull()
    // A trendline missing an end.
    expect(
      readDrawingShape({ kind: "trendline", from: { time: 1, price: 2 } })
    ).toBeNull()
    // A time before the epoch, and one past the year 2100.
    expect(
      readDrawingShape({
        kind: "trendline",
        from: { time: -1, price: 2 },
        to: { time: 5, price: 3 },
      })
    ).toBeNull()
    expect(
      readDrawingShape({
        kind: "trendline",
        from: { time: 1, price: 2 },
        to: { time: 9_999_999_999_999, price: 3 },
      })
    ).toBeNull()
    expect(readDrawingShape(null)).toBeNull()
    expect(readDrawingShape("level")).toBeNull()
  })
})

describe("moving a drawing", () => {
  it("moves a level by price, and time means nothing to it", () => {
    expect(moveShape({ kind: "level", price: 100 }, 60_000, -8)).toEqual({
      kind: "level",
      price: 92,
    })
  })

  it("moves both ends of a trendline together", () => {
    expect(
      moveShape(
        {
          kind: "trendline",
          from: { time: 1_000, price: 10 },
          to: { time: 3_000, price: 30 },
        },
        500,
        5
      )
    ).toEqual({
      kind: "trendline",
      from: { time: 1_500, price: 15 },
      to: { time: 3_500, price: 35 },
    })
  })

  it("keeps times whole, so what is saved is what can be read back", () => {
    const moved = moveShape(
      {
        kind: "trendline",
        from: { time: 1_000, price: 10 },
        to: { time: 3_000, price: 30 },
      },
      0.4,
      0
    )
    expect(readDrawingShape(moved)).toEqual(moved)
  })
})
