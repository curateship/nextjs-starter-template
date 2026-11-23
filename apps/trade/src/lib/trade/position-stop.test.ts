import { describe, expect, it } from "vitest"

import { positionStopPx } from "@/lib/trade/position-stop"
import type { TradePosition } from "@/lib/trade/paper"

const position: TradePosition = {
  id: "position-1",
  walletId: "wallet-1",
  marketKey: "lighter:mainnet:BTC",
  szi: 1,
  entryPx: 100,
  leverage: 1,
  maxLeverage: 10,
  targets: [],
  tpPx: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 1,
}

const gridStop = {
  kind: "grid" as const,
  status: "active" as const,
  walletId: position.walletId,
  marketKey: position.marketKey,
  plan: {
    direction: "long" as const,
    topPx: 120,
    bottomPx: 80,
    stopLoss: {
      mode: "fixed" as const,
      underPct: 5,
      px: 75,
      base: null,
    },
    baseWatch: null,
  },
}

describe("positionStopPx", () => {
  it("reads an ordinary stop from the settled position", () => {
    expect(positionStopPx({ ...position, slPx: 90 }, [])).toBe(90)
    expect(positionStopPx(position, [])).toBeNull()
  })

  it("reads the stop held by a running grid plan", () => {
    expect(positionStopPx(position, [gridStop])).toBe(75)
    expect(
      positionStopPx(position, [{ ...gridStop, status: "done" as const }])
    ).toBeNull()
    expect(
      positionStopPx(position, [{ ...gridStop, walletId: "wallet-2" }])
    ).toBeNull()
  })

  it("prefers the ordinary stop over the grid's", () => {
    expect(positionStopPx({ ...position, slPx: 90 }, [gridStop])).toBe(90)
  })
})
