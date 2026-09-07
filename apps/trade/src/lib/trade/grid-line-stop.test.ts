import { describe, expect, it } from "vitest"
import {
  eligibleGridStopLines,
  gridLineStopSchema,
  matchesGridStopLine,
} from "./grid-line-stop"
import type { Drawing } from "./drawings"

const line: Drawing = {
  id: "0c939807-385f-45f1-8ce2-ec7a545ac7f7",
  shape: { kind: "level", price: 100 },
  alert: { armedAt: 100, firedAt: null, direction: "below" },
}

describe("grid stop drawing choices", () => {
  it("offers active horizontal and sloping lines only", () => {
    const slope: Drawing = {
      ...line,
      id: "slope",
      shape: {
        kind: "trendline",
        from: { time: 0, price: 100 },
        to: { time: 1_000, price: 90 },
      },
    }
    const vertical: Drawing = {
      ...slope,
      id: "vertical",
      shape: {
        kind: "trendline",
        from: { time: 0, price: 100 },
        to: { time: 0, price: 90 },
      },
    }
    expect(
      eligibleGridStopLines(
        [
          line,
          slope,
          vertical,
          { ...line, alert: null },
          { ...line, alert: { ...line.alert!, firedAt: 200 } },
          {
            ...slope,
            shape: { ...slope.shape, kind: "fib" } as Drawing["shape"],
          },
        ],
        false,
        2_000
      )
    ).toEqual([line, slope])
    expect(eligibleGridStopLines([line], true)).toEqual([])
  })
  it("does not reuse an old link when the drawing is enabled again", () => {
    const stop = { drawingId: line.id, armedAt: 100 }
    expect(matchesGridStopLine(line, stop)).toBe(true)
    expect(
      matchesGridStopLine(
        { ...line, alert: { ...line.alert!, armedAt: 101 } },
        stop
      )
    ).toBe(false)
    expect(
      gridLineStopSchema.safeParse({ ...stop, armedAt: Infinity }).success
    ).toBe(false)
    expect(
      gridLineStopSchema.safeParse({ ...stop, drawingId: "" }).success
    ).toBe(false)
  })
})
