import { describe, expect, it } from "vitest"

import {
  drawingAlertArmed,
  extendedRight,
  moveShape,
  priceAtTime,
  readDrawingAlert,
  readDrawingShape,
} from "@/lib/trade/drawings"

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

  it("reads a trendline drawn on to the right, and an older row without the flag as not", () => {
    const line = {
      kind: "trendline" as const,
      from: { time: 1_000, price: 10 },
      to: { time: 2_000, price: 20 },
    }
    expect(readDrawingShape({ ...line, extendRight: true })).toEqual({
      ...line,
      extendRight: true,
    })
    expect(readDrawingShape(line)?.kind === "trendline" && readDrawingShape(line)).not.toHaveProperty("extendRight")
    expect(readDrawingShape({ ...line, extendRight: "yes" })).toBeNull()
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

  it("keeps a line drawn on to the right that way when it moves", () => {
    const moved = moveShape(
      {
        kind: "trendline",
        from: { time: 1_000, price: 10 },
        to: { time: 3_000, price: 30 },
        extendRight: true,
      },
      500,
      5
    )
    expect(moved).toEqual({
      kind: "trendline",
      from: { time: 1_500, price: 15 },
      to: { time: 3_500, price: 35 },
      extendRight: true,
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

describe("where a drawing is at one moment", () => {
  const line = {
    kind: "trendline" as const,
    from: { time: 1_000, price: 10 },
    to: { time: 3_000, price: 30 },
  }

  it("reads a trendline before, between and after its two ends", () => {
    expect(priceAtTime(line, 0)).toBe(0)
    expect(priceAtTime(line, 2_000)).toBe(20)
    expect(priceAtTime(line, 5_000)).toBe(50)
  })

  it("reads a level as the same price at every moment", () => {
    expect(priceAtTime({ kind: "level", price: 7 }, 0)).toBe(7)
    expect(priceAtTime({ kind: "level", price: 7 }, 9_999)).toBe(7)
  })

  it("has no one price for a line straight up and down", () => {
    expect(
      priceAtTime({ ...line, to: { time: 1_000, price: 30 } }, 1_000)
    ).toBeNull()
  })
})

describe("drawing a line on to the right", () => {
  const line = {
    kind: "trendline" as const,
    from: { time: 1_000, price: 10 },
    to: { time: 3_000, price: 30 },
  }

  it("switches the flag on, and leaves a line that already has it alone", () => {
    expect(extendedRight(line)).toEqual({ ...line, extendRight: true })
    const already = { ...line, extendRight: true }
    expect(extendedRight(already)).toBe(already)
  })

  it("leaves a level alone, because it already runs the whole width", () => {
    const level = { kind: "level" as const, price: 7 }
    expect(extendedRight(level)).toBe(level)
  })
})

describe("reading a saved alert", () => {
  it("reads an armed and a fired record, and nothing as no alert", () => {
    expect(
      readDrawingAlert({ direction: "above", armedAt: 5, firedAt: null })
    ).toEqual({ direction: "above", armedAt: 5, firedAt: null })
    expect(
      drawingAlertArmed(
        readDrawingAlert({ direction: "below", armedAt: 5, firedAt: 9 })
      )
    ).toBe(false)
    expect(
      drawingAlertArmed(
        readDrawingAlert({ direction: "below", armedAt: 5, firedAt: null })
      )
    ).toBe(true)
    expect(readDrawingAlert(null)).toBeNull()
    expect(readDrawingAlert(undefined)).toBeNull()
    expect(readDrawingAlert({ direction: "sideways", armedAt: 5 })).toBeNull()
  })
})
