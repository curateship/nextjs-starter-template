import { describe, expect, it } from "vitest"

import {
  diffPositions,
  type PositionSnapshot,
} from "./diff-positions"

function snapshot(overrides: Partial<PositionSnapshot>): PositionSnapshot {
  return {
    coin: "BTC",
    szi: 1,
    entryPx: 100_000,
    notional: 100_000,
    leverage: 5,
    unrealizedPnl: 0,
    ...overrides,
  }
}

function toMap(...positions: PositionSnapshot[]) {
  return new Map(positions.map((position) => [position.coin, position]))
}

describe("diffPositions", () => {
  it("detects opened positions", () => {
    const changes = diffPositions(toMap(), toMap(snapshot({})))
    expect(changes).toMatchObject([{ coin: "BTC", type: "opened" }])
  })

  it("detects closed positions", () => {
    const changes = diffPositions(toMap(snapshot({})), toMap())
    expect(changes).toMatchObject([{ coin: "BTC", type: "closed" }])
  })

  it("detects flips before size comparison", () => {
    const changes = diffPositions(
      toMap(snapshot({ szi: 2, notional: 200_000 })),
      toMap(snapshot({ szi: -1, notional: 100_000 }))
    )
    expect(changes).toMatchObject([{ coin: "BTC", type: "flipped" }])
  })

  it("detects increases and reductions above the thresholds", () => {
    expect(
      diffPositions(
        toMap(snapshot({ szi: 1, notional: 100_000 })),
        toMap(snapshot({ szi: 2, notional: 200_000 }))
      )
    ).toMatchObject([{ coin: "BTC", type: "increased" }])
    expect(
      diffPositions(
        toMap(snapshot({ szi: 2, notional: 200_000 })),
        toMap(snapshot({ szi: 1, notional: 100_000 }))
      )
    ).toMatchObject([{ coin: "BTC", type: "reduced" }])
  })

  it("ignores dust-level drift", () => {
    expect(
      diffPositions(
        toMap(snapshot({ szi: 1, notional: 100_000 })),
        toMap(snapshot({ szi: 1.01, notional: 101_000 }))
      )
    ).toEqual([])
  })

  it("ignores small-notional opens and closes", () => {
    expect(
      diffPositions(toMap(), toMap(snapshot({ szi: 0.01, notional: 1_000 })))
    ).toEqual([])
    expect(
      diffPositions(toMap(snapshot({ szi: 0.01, notional: 1_000 })), toMap())
    ).toEqual([])
  })

  it("handles independent coins in one diff", () => {
    const changes = diffPositions(
      toMap(snapshot({ coin: "BTC" })),
      toMap(snapshot({ coin: "ETH", notional: 50_000 }))
    )
    const types = Object.fromEntries(changes.map((c) => [c.coin, c.type]))
    expect(types).toEqual({ BTC: "closed", ETH: "opened" })
  })
})
