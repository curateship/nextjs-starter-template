import { describe, expect, it } from "vitest"

import type { LiveFill } from "@/lib/trade/live-trades"
import { openFillMarks } from "@/lib/trade/live-trades"
import {
  stampExactGridRungs,
  stampGridRungs,
} from "@/server/trade/grid-fills"

const fill = (over: Partial<LiveFill>): LiveFill => ({
  fillId: "fill",
  orderId: "order",
  walletId: "wallet",
  marketKey: "kucoin:mainnet:FLOCKUSDTM",
  side: "sell",
  px: 1,
  sz: 1,
  at: 1,
  closedPnl: 0,
  fee: 0,
  dir: "Sell",
  liquidation: false,
  ...over,
})

describe("grid fill rungs", () => {
  it("recovers the FLOCK rung from its saved dollar budget", () => {
    const fills = stampGridRungs(
      [
        fill({
          fillId: "first-short",
          orderId: "first-short-order",
          px: 0.05229149,
          sz: 1_340,
          at: 1,
          fee: 0.04204236,
        }),
        fill({
          fillId: "second-short",
          orderId: "second-short-order",
          px: 0.05554482,
          sz: 1_930,
          at: 2,
          fee: 0.0643209,
        }),
        fill({
          fillId: "buy-back",
          orderId: "buy-back-order",
          side: "buy",
          px: 0.05254477,
          sz: 1_930,
          at: 3,
          fee: 0.06084684,
          dir: "Buy",
        }),
      ],
      {
        direction: "short",
        levels: [
          { buyPx: 0.05018, sz: 699, budget: 35.08155 },
          { buyPx: 0.05225, sz: 1_342, budget: 70.16457 },
          { buyPx: 0.05439, sz: 1_934, budget: 105.2436 },
          { buyPx: 0.05663, sz: 2_478, budget: 140.37606 },
        ],
        carriedLevels: [],
      }
    )

    expect(fills.map((one) => one.gridRung)).toEqual([2, 3, undefined])
    expect(openFillMarks(fills).map((mark) => mark.label)).toEqual([
      "Enter rung 2 - for $70.07",
      "Enter rung 3 - for $107.20",
      "Exit rung 3 - profit $5.66",
    ])
  })

  it("uses the whole order when one rung fills in pieces", () => {
    const fills = stampGridRungs(
      [
        fill({ fillId: "piece-a", orderId: "rung", sz: 600, px: 0.0522 }),
        fill({ fillId: "piece-b", orderId: "rung", sz: 740, px: 0.0523 }),
      ],
      {
        direction: "short",
        levels: [
          { buyPx: 0.05018, sz: 699, budget: 35.08155 },
          { buyPx: 0.05225, sz: 1_342, budget: 70.16457 },
        ],
        carriedLevels: [],
      }
    )

    expect(fills.map((one) => one.gridRung)).toEqual([2, 2])
  })

  it("keeps the exact rung recorded when the order was sent", () => {
    const [stamped] = stampExactGridRungs(
      [fill({ orderId: "known-order", gridRung: 2 })],
      [
        {
          walletId: "wallet",
          orderId: "known-order",
          direction: "short",
          rung: 4,
        },
      ]
    )

    expect(stamped).toMatchObject({
      grid: true,
      gridDirection: "short",
      gridRung: 4,
    })
  })
})
