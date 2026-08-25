import { describe, expect, it } from "vitest"

import {
  laddersAndGridsYouPlaced,
  smartOrdersYouPlaced,
  type SmartOrder,
} from "@/lib/trade/smart-plan"

/**
 * What one press stands down.
 *
 * This decides what a real-money button touches, so the two things it must
 * leave alone are worth pinning: a flow's orders, which the flow would place
 * again on its next pass, and a watched price, which is a plain order with its
 * own line on the chart and its own row under Open orders.
 */
function order(
  id: string,
  kind: SmartOrder["kind"],
  flowRunId: string | null = null
): SmartOrder {
  return {
    id,
    walletId: "wallet",
    marketKey: `hyperliquid:mainnet:${id}`,
    status: "active",
    flowRunId,
    createdAt: 1,
    updatedAt: 1,
    // The plan's shape does not matter here; nothing under test reads it.
    kind,
    plan: {},
  } as SmartOrder
}

describe("the ladders and grids one press stands down", () => {
  it("takes the ladders and grids somebody placed themselves", () => {
    const stood = laddersAndGridsYouPlaced([
      order("BTC", "dca"),
      order("ETH", "grid"),
    ])
    expect(stood.map((one) => one.id)).toEqual(["BTC", "ETH"])
  })

  it("leaves a flow's orders alone — the flow would place them again", () => {
    const stood = laddersAndGridsYouPlaced([
      order("BTC", "dca", "run-1"),
      order("ETH", "grid", "run-1"),
      order("SOL", "dca"),
    ])
    expect(stood.map((one) => one.id)).toEqual(["SOL"])
  })

  it("leaves a watched price alone — it is cancelled from its own line", () => {
    const stood = laddersAndGridsYouPlaced([
      order("BTC", "watch"),
      order("ETH", "signal"),
      order("SOL", "grid"),
    ])
    expect(stood.map((one) => one.id)).toEqual(["SOL"])
  })
})

describe("the smart orders panel", () => {
  it("shows a paused watched or flow order so it can be resumed", () => {
    const watch = order("BTC", "watch")
    const flow = order("ETH", "dca", "run-1")
    watch.plan.paused = true
    flow.plan.paused = true

    expect(smartOrdersYouPlaced([watch, flow]).map((one) => one.id)).toEqual([
      "BTC",
      "ETH",
    ])
  })
})
