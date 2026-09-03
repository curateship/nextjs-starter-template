import { describe, expect, it } from "vitest"

import { positionHasStop } from "@/lib/trade/position-stop"
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

describe("positionHasStop", () => {
  it("reads an ordinary stop from the settled position", () => {
    expect(positionHasStop({ ...position, slPx: 90 }, [])).toBe(true)
    expect(positionHasStop(position, [])).toBe(false)
  })

  it("counts the stop held by a running grid plan", () => {
    expect(positionHasStop(position, [gridStop])).toBe(true)
    expect(
      positionHasStop(position, [{ ...gridStop, status: "done" as const }])
    ).toBe(false)
    expect(
      positionHasStop(position, [{ ...gridStop, walletId: "wallet-2" }])
    ).toBe(false)
  })
})
