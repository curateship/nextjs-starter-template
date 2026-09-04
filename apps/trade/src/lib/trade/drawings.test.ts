import { describe, expect, it } from "vitest"

import {
  alertFirePrice,
  bufferedAlert,
  describeDrawing,
  describeDrawingInline,
  drawingAlertArmed,
  extendedRight,
  moveShape,
  namedShape,
  priceAtTime,
  readDrawingAlert,
  readDrawingBuffer,
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

describe("describing a line", () => {
  const line = {
    kind: "trendline" as const,
    from: { time: 1_000, price: 10 },
    to: { time: 3_000, price: 30 },
  }

  it("keeps a trimmed name, and drops the key when the name is taken away", () => {
    expect(namedShape(line, "  4h base  ")).toEqual({ ...line, name: "4h base" })
    expect(namedShape({ ...line, name: "4h base" }, "   ")).toEqual(line)
    expect(namedShape({ ...line, name: "4h base" }, "   ")).not.toHaveProperty(
      "name"
    )
    // Nothing to change means the same object, so no save follows.
    expect(namedShape(line, "")).toBe(line)
  })

  it("keeps the name on a level and through a move", () => {
    const level = { kind: "level" as const, price: 100, name: "weekly low" }
    expect(namedShape(level, "weekly low")).toEqual(level)
    expect(moveShape(level, 0, 5)).toEqual({ ...level, price: 105 })
    expect(moveShape({ ...line, name: "4h base" }, 500, 5).name).toBe("4h base")
  })

  it("reads a saved description, and refuses one too long to have been typed", () => {
    expect(readDrawingShape({ ...line, name: "4h base" })).toEqual({
      ...line,
      name: "4h base",
    })
    expect(
      readDrawingShape({ kind: "level", price: 1, name: "x".repeat(240) })
    ).not.toBeNull()
    expect(
      readDrawingShape({ kind: "level", price: 1, name: "x".repeat(241) })
    ).toBeNull()
    expect(readDrawingShape({ kind: "level", price: 1, name: "" })).toBeNull()
  })

  it("puts the name first for a screen reader, with the typed capitals kept", () => {
    const price = (value: number) => `$${value}`
    expect(describeDrawing({ ...line, name: "4h base" }, price)).toBe(
      "4h base, trendline from $10 to $30"
    )
    expect(describeDrawing(line, price)).toBe("Trendline from $10 to $30")
    expect(
      describeDrawing({ kind: "level", price: 100, name: "weekly low" }, price)
    ).toBe("weekly low, level at $100")
    // The whole sentence used to be lowered to fit the name in front of it,
    // which lowered the name somebody typed along with it.
    expect(describeDrawing({ ...line, name: "This is a test" }, price)).toBe(
      "This is a test, trendline from $10 to $30"
    )
    expect(
      describeDrawingInline({ ...line, name: "This is a test" }, price)
    ).toBe("This is a test, trendline from $10 to $30")
    expect(describeDrawingInline(line, price)).toBe(
      "trendline from $10 to $30"
    )
  })

  it("refuses a name that is nothing but spaces", () => {
    expect(readDrawingShape({ kind: "level", price: 1, name: "   " })).toBeNull()
    expect(readDrawingShape({ kind: "level", price: 1, name: " a " })).toEqual({
      kind: "level",
      price: 1,
      name: "a",
    })
  })
})

describe("the break buffer", () => {
  const armed = {
    direction: "above" as const,
    armedAt: 1,
    firedAt: null,
  }

  it("reads a percentage typed in, and blank as none", () => {
    expect(readDrawingBuffer("")).toBeNull()
    expect(readDrawingBuffer("   ")).toBeNull()
    expect(readDrawingBuffer("0.1")).toBe(0.1)
    // The percent sign is what a person types.
    expect(readDrawingBuffer("0.1%")).toBe(0.1)
    expect(readDrawingBuffer(" 50 % ")).toBe(50)
  })

  it("refuses anything that is not a percentage above zero", () => {
    expect(readDrawingBuffer("abc")).toBe(false)
    expect(readDrawingBuffer("0")).toBe(false)
    expect(readDrawingBuffer("-5")).toBe(false)
    expect(readDrawingBuffer("101")).toBe(false)
  })

  it("fires that percentage past the line, on the side it waits for", () => {
    expect(alertFirePrice(60_000, "above", 0.1)).toBe(60_060)
    expect(alertFirePrice(60_000, "below", 0.1)).toBe(59_940)
    // No buffer is the line itself, whichever way it waits.
    expect(alertFirePrice(60_000, "above", null)).toBe(60_000)
    expect(alertFirePrice(60_000, "below", undefined)).toBe(60_000)
  })

  it("means the same thing on a coin worth twenty cents", () => {
    // The reason it is a percentage. A fixed number of dollars that is a
    // sensible break on Bitcoin can never be reached on a cheap coin.
    expect(alertFirePrice(0.21, "above", 1)).toBeCloseTo(0.2121, 6)
    expect(alertFirePrice(0.21, "below", 1)).toBeCloseTo(0.2079, 6)
  })

  it("moves the way the words say even on a line dragged below zero", () => {
    expect(alertFirePrice(-100, "above", 10)).toBe(-90)
    expect(alertFirePrice(-100, "below", 10)).toBe(-110)
  })

  it("sets a buffer and drops the key when it is cleared", () => {
    expect(bufferedAlert(armed, 0.1)).toEqual({ ...armed, buffer: 0.1 })
    expect(bufferedAlert({ ...armed, buffer: 0.1 }, null)).toEqual(armed)
    expect(bufferedAlert({ ...armed, buffer: 0.1 }, null)).not.toHaveProperty(
      "buffer"
    )
    // Nothing to change means the same record, so no save follows.
    expect(bufferedAlert(armed, null)).toBe(armed)
  })

  it("reads a stored buffer, and refuses one no field could have typed", () => {
    expect(readDrawingAlert({ ...armed, buffer: 0.1 })).toEqual({
      ...armed,
      buffer: 0.1,
    })
    expect(readDrawingAlert({ ...armed, buffer: 0 })).toBeNull()
    expect(readDrawingAlert({ ...armed, buffer: -1 })).toBeNull()
    expect(readDrawingAlert({ ...armed, buffer: 101 })).toBeNull()
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

  it("reads where a fired alert went off, and an older record without it", () => {
    expect(
      readDrawingAlert({
        direction: "above",
        armedAt: 5,
        firedAt: 9,
        firedPrice: 61_200,
      })
    ).toEqual({ direction: "above", armedAt: 5, firedAt: 9, firedPrice: 61_200 })
    expect(
      readDrawingAlert({ direction: "above", armedAt: 5, firedAt: 9 })
    ).not.toHaveProperty("firedPrice")
  })
})
