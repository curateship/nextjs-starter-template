import { describe, expect, it } from "vitest"

import type { WalletOpenOrder, WalletPosition } from "@/lib/protocols/contracts"

import type { LadderPlan } from "./dca"
import {
  gridLadderPairingRefusal,
  gridStopRidesBase,
  ladderBaseRungPx,
  reattributePairedStops,
  type PairedStopRef,
} from "./pairing"

/** The slimmest ladder the base-rung reader accepts. */
function rungs(
  list: Array<{ px: number; status: LadderPlan["rungs"][number]["status"] }>
): Pick<LadderPlan, "rungs" | "leverage"> {
  return {
    leverage: 1,
    rungs: list.map((one) => ({
      px: one.px,
      sz: 1,
      budget: one.px,
      status: one.status,
      orderId: null,
      sellOrderId: null,
      dead: false,
      touched: false,
    })),
  } as Pick<LadderPlan, "rungs" | "leverage">
}

function gridStop(input: {
  mode: "percent" | "fixed"
  px?: number | null
  base?: { underPct: number; reclaimDays: number } | null
  direction?: "long" | "short"
}) {
  return {
    direction: input.direction ?? ("long" as const),
    topPx: 120,
    stopLoss: {
      mode: input.mode,
      underPct: 5,
      px: input.px ?? null,
      base: input.base ?? null,
    },
    bottomPx: 95,
    baseWatch: null,
    leverage: 1,
  }
}

describe("where the ladder starts buying", () => {
  it("is the highest rung that can still trade or has traded", () => {
    expect(
      ladderBaseRungPx(
        rungs([
          { px: 90, status: "waiting" },
          { px: 80, status: "filled" },
          { px: 100, status: "skipped" },
          { px: 95, status: "cancelled" },
        ])
      )
    ).toBe(90)
  })

  it("answers null when no rung can ever buy", () => {
    expect(
      ladderBaseRungPx(
        rungs([
          { px: 90, status: "skipped" },
          { px: 80, status: "cancelled" },
        ])
      )
    ).toBeNull()
  })
})

describe("the pairing rules", () => {
  const ladder = rungs([{ px: 90, status: "waiting" }])

  it("refuses a practice wallet before anything else", () => {
    expect(
      gridLadderPairingRefusal({
        walletKind: "paper",
        protocol: "hyperliquid",
        grid: null,
        ladder: null,
      })
    ).toBe("SMART_PAIR_LIVE_ONLY")
  })

  it("refuses an exchange whose adapter cannot hold a part-size stop", () => {
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "phemex",
        grid: null,
        ladder: null,
      })
    ).toBe("SMART_PAIR_PROTOCOL")
  })

  it("refuses a SELLING grid before anything else it checks", () => {
    // The ladder buys and the grid sells, and the exchange holds one position
    // for the coin, so the ladder's rungs would close the grid's short instead
    // of building anything. Checked first: nothing below it can rescue that.
    expect(
      gridLadderPairingRefusal({
        // A live wallet on a pairable exchange with a perfectly good stop —
        // every other rule passes, and it is still refused.
        walletKind: "live",
        protocol: "hyperliquid",
        grid: gridStop({ mode: "fixed", px: 99, direction: "short" }),
        ladder,
      })
    ).toBe("SMART_PAIR_SHORT_GRID")
  })

  it("refuses a grid without a stop", () => {
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "hyperliquid",
        grid: {
          direction: "long",
          stopLoss: null,
          topPx: 120,
          bottomPx: 95,
          baseWatch: null,
          leverage: 1,
        },
        ladder,
      })
    ).toBe("SMART_PAIR_GRID_STOP_REQUIRED")
  })

  it("refuses a stop that rides the 4h base", () => {
    expect(
      gridStopRidesBase(
        gridStop({ mode: "percent", base: { underPct: 2, reclaimDays: 1 } })
      )
    ).toBe(true)
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "hyperliquid",
        grid: gridStop({
          mode: "percent",
          base: { underPct: 2, reclaimDays: 1 },
        }),
        ladder,
      })
    ).toBe("SMART_PAIR_GRID_STOP_BASE")
  })

  it("refuses a grid stop at or below the ladder's first buy", () => {
    // 5% under a bottom of 95 is 90.25 — above the 90 rung, allowed.
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "hyperliquid",
        grid: gridStop({ mode: "percent" }),
        ladder,
      })
    ).toBeNull()
    // A hand-set stop at the rung itself is refused: "above" means above.
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "hyperliquid",
        grid: gridStop({ mode: "fixed", px: 90 }),
        ladder,
      })
    ).toBe("SMART_PAIR_STOP_BELOW_BASE")
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "hyperliquid",
        grid: gridStop({ mode: "fixed", px: 85 }),
        ladder,
      })
    ).toBe("SMART_PAIR_STOP_BELOW_BASE")
  })

  it("refuses different borrowing on two plans sharing one position", () => {
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "hyperliquid",
        grid: { ...gridStop({ mode: "percent" }), leverage: 3 },
        ladder,
      })
    ).toBe("SMART_PAIR_LEVERAGE")
  })

  it("skips only the checks whose side is not drawn yet", () => {
    // No plans at all: the wallet and exchange rules still answer.
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "kucoin",
        grid: null,
        ladder: null,
      })
    ).toBeNull()
    // A grid with no ladder drawn yet still has its own stop checked.
    expect(
      gridLadderPairingRefusal({
        walletKind: "live",
        protocol: "aster",
        grid: {
          direction: "long",
          stopLoss: null,
          topPx: 120,
          bottomPx: 95,
          baseWatch: null,
          leverage: 1,
        },
        ladder: null,
      })
    ).toBe("SMART_PAIR_GRID_STOP_REQUIRED")
  })
})

describe("handing each stop back to its owner", () => {
  const position = (over: Partial<WalletPosition> = {}): WalletPosition => ({
    marketId: "BTC",
    szi: 3,
    entryPx: 100,
    leverage: 1,
    marginUsed: 300,
    liquidationPx: null,
    targets: [],
    tpPx: null,
    tpSz: null,
    slPx: 92,
    tpOrderId: null,
    slOrderId: "11",
    protectionOrderIds: ["11", "22"],
    ...over,
  })
  const order = (over: Partial<WalletOpenOrder>): WalletOpenOrder => ({
    orderId: "22",
    marketId: "BTC",
    side: "sell",
    px: 80,
    sz: 3,
    reduceOnly: true,
    trigger: true,
    ...over,
  })
  const grid: PairedStopRef = {
    orderId: "11",
    px: 92,
    sz: 1,
    ladderAimedSlPx: 80,
  }

  it("swaps the slots when the grid's leg was named the position's stop", () => {
    const out = reattributePairedStops(
      { positions: [position()], orders: [order({})] },
      new Map([["BTC", grid]])
    )
    expect(out.positions[0].slPx).toBe(80)
    expect(out.positions[0].slOrderId).toBe("22")
    // The grid's leg is now an ordinary trigger row the chart hides by price.
    const gridLeg = out.orders.find((one) => one.orderId === "11")
    expect(gridLeg).toMatchObject({ px: 92, sz: 1, reduceOnly: true })
    expect(out.orders.some((one) => one.orderId === "22")).toBe(false)
  })

  it("leaves a market with no paired grid untouched", () => {
    const folio = { positions: [position()], orders: [order({})] }
    expect(reattributePairedStops(folio, new Map())).toBe(folio)
  })

  it("leaves the read alone when the ladder's own leg already won the slot", () => {
    const out = reattributePairedStops(
      {
        positions: [position({ slPx: 80, slOrderId: "22" })],
        orders: [order({ orderId: "33", px: 92 })],
      },
      new Map([["BTC", grid]])
    )
    expect(out.positions[0].slPx).toBe(80)
    expect(out.positions[0].slOrderId).toBe("22")
  })

  it("empties the slot when the ladder has no stop yet", () => {
    const out = reattributePairedStops(
      { positions: [position({ protectionOrderIds: ["11"] })], orders: [] },
      new Map([["BTC", { ...grid, ladderAimedSlPx: null }]])
    )
    expect(out.positions[0].slPx).toBeNull()
    expect(out.positions[0].slOrderId).toBeNull()
    expect(out.orders.some((one) => one.orderId === "11")).toBe(true)
  })

  it("never mistakes a spare target above the grid's stop for the ladder's stop", () => {
    const out = reattributePairedStops(
      {
        positions: [position()],
        orders: [order({ orderId: "44", px: 120 })],
      },
      new Map([["BTC", { ...grid, ladderAimedSlPx: null }]])
    )
    expect(out.positions[0].slPx).toBeNull()
    expect(out.orders.some((one) => one.orderId === "44")).toBe(true)
  })
})
