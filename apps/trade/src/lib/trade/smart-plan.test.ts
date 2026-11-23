import { describe, expect, it } from "vitest"

import {
  forEachPlanOrderId,
  laddersAndGridsYouPlaced,
  smartOrdersYouPlaced,
  missingPlanFields,
  unknownPlanFields,
  type SmartOrder,
} from "@/lib/trade/smart-plan"
import type { LadderPlan } from "@/lib/trade/dca"

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
  it("shows a paused flow order so it can be resumed", () => {
    const flow = order("ETH", "dca", "run-1")
    flow.plan.paused = true

    expect(smartOrdersYouPlaced([flow]).map((one) => one.id)).toEqual(["ETH"])
  })

  it("never lists a watched price, even a paused one — it is not a strategy", () => {
    const watch = order("BTC", "watch")
    watch.plan.paused = true

    expect(smartOrdersYouPlaced([watch, order("SOL", "grid")])).toHaveLength(1)
    expect(smartOrdersYouPlaced([watch])).toEqual([])
  })
})

describe("ladder order ids", () => {
  it("rewrites an exit-ladder sell id with the other managed order ids", () => {
    const plan = {
      rungs: [],
      exitRungs: [{ status: "waiting", orderId: "pending:exit", armedSz: 2 }],
    } as unknown as LadderPlan

    forEachPlanOrderId("dca", plan, (orderId, set) => {
      if (orderId === "pending:exit") set("exchange-exit")
    })

    expect(plan.exitRungs[0].orderId).toBe("exchange-exit")
  })
})

/**
 * A saved plan with fields this build does not know was written by a newer
 * build. Naming them is what lets the engine leave the row alone instead of
 * saving it back without them — see `leftForANewerBuild`.
 */
describe("unknownPlanFields", () => {
  it("names the fields a newer build added to a grid", () => {
    expect(
      unknownPlanFields("grid", {
        direction: "short",
        levels: [],
        splitsIntoThirds: true,
      })
    ).toEqual(["splitsIntoThirds"])
  })

  it("is empty for a plan this build could have written", () => {
    expect(
      unknownPlanFields("grid", { direction: "short", reverseWhenStopped: false })
    ).toEqual([])
    expect(unknownPlanFields("dca", { rungs: [], aimedSlPx: null })).toEqual([])
    expect(unknownPlanFields("signal", { orderId: "1" })).toEqual([])
    expect(unknownPlanFields("watch", { orderId: "1" })).toEqual([])
  })

  it("has nothing to say about a plan that is not an object", () => {
    expect(unknownPlanFields("grid", null)).toEqual([])
    expect(unknownPlanFields("grid", [1])).toEqual([])
  })
})

/**
 * The other half of the same door. On 4 Sep 2026 an old website saved twelve
 * short grids back without their direction, and the engine that took over
 * read each one as a buying grid. A grid with no direction written down is
 * not anyone's to trade.
 */
describe("missingPlanFields", () => {
  it("names a grid's missing direction", () => {
    expect(missingPlanFields("grid", { levels: [], topPx: 2 })).toEqual([
      "direction",
    ])
  })

  it("is empty once the direction is written down, either way", () => {
    expect(missingPlanFields("grid", { direction: "short" })).toEqual([])
    expect(missingPlanFields("grid", { direction: "long" })).toEqual([])
  })

  it("asks nothing of the other kinds, which have no direction field", () => {
    expect(missingPlanFields("dca", { rungs: [] })).toEqual([])
    expect(missingPlanFields("signal", { orderId: "1" })).toEqual([])
    expect(missingPlanFields("watch", { orderId: "1" })).toEqual([])
  })

  it("has nothing to say about a plan that is not an object", () => {
    expect(missingPlanFields("grid", null)).toEqual([])
    expect(missingPlanFields("grid", [1])).toEqual([])
  })
})
