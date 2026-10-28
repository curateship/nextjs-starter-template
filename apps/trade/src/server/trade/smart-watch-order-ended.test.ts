import { beforeEach, describe, expect, it, vi } from "vitest"

import type { WatchPlan } from "@/lib/trade/watch-order"
import type { WalletBook } from "@/server/trade/paper-replay"
import type { LadderEngineDeps } from "@/server/trade/smart-engine"

/**
 * A waiting-only close whose order the exchange expired the moment it arrived.
 *
 * What happened to SNDK on Aster on 28 Oct 2026: a 0.4 SNDK close went out at
 * $1,365.67, a buyer was already paying that, and Aster expired it with
 * nothing sold. The order vanished from the open-orders list, and because a
 * missing waiting-only order is never let go on absence alone, the close sat
 * on "Placing order..." for good. Asking the exchange about that one order by
 * its number is what lets it go, and only when the position already shows
 * whatever the order traded.
 */

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: { roundPx: (px: number) => Math.round(px * 100) / 100 },
  }),
}))

const { advanceWatch, resetWatchChaseGate } = await import(
  "@/server/trade/smart-watch"
)

const SNDK = "aster:mainnet:SNDKUSDT"
const PLACED_AT = 1_000_000

function closePlan(over: Partial<WatchPlan> = {}): WatchPlan {
  return {
    triggerPx: 1367.24,
    side: "sell",
    sz: 0.4,
    leverage: 2,
    maxLeverage: 1,
    sizeDecimals: 2,
    minOrderSize: 0.01,
    minOrderValueUsd: 5,
    priceTick: 0.01,
    tpPx: null,
    slPx: null,
    reduceOnly: true,
    riskSized: false,
    maker: true,
    heldAtStart: 0.4,
    chaseGiveUp: 0,
    phase: "taking",
    sent: true,
    orderId: "410698304",
    orderPx: 1365.67,
    missingSince: PLACED_AT,
    heldWhenPlaced: 0.4,
    ownSz: null,
    ownStop: null,
    chasedAt: PLACED_AT,
    chases: 1,
    startedAt: PLACED_AT,
    paused: false,
    pauseReason: null,
    refusalStreak: 0,
    ...over,
  } as WatchPlan
}

/** A book that holds `held` SNDK and lists no open orders at all. */
function bookHolding(held: number): WalletBook {
  return {
    wallet: { id: "aster-1", protocol: "aster", kind: "live" },
    positions: new Map(held > 0 ? [[SNDK, { marketKey: SNDK, szi: held }]] : []),
    orders: [],
    ordersVersion: 0,
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
  } as unknown as WalletBook
}

function depsAnswering(
  answer: { ended: boolean; filledSz: number } | null
): LadderEngineDeps & {
  placed: Array<{ side: string; sz: number; reduceOnly: boolean }>
  asked: string[]
} {
  const placed: Array<{ side: string; sz: number; reduceOnly: boolean }> = []
  const asked: string[] = []
  return {
    placed,
    asked,
    fill: () => {},
    dropOrder: () => {},
    buysLandNextPass: true,
    freeCash: () => 0,
    orderEnded: async (_marketKey: string, orderId: string) => {
      asked.push(orderId)
      return answer
    },
    insertOrder: async (input: {
      side: string
      sz: number
      reduceOnly: boolean
    }) => {
      placed.push({
        side: input.side,
        sz: input.sz,
        reduceOnly: input.reduceOnly,
      })
      return "pending:00000000-0000-0000-0000-000000000001"
    },
    saveLadder: async () => {},
  } as unknown as LadderEngineDeps & {
    placed: Array<{ side: string; sz: number; reduceOnly: boolean }>
    asked: string[]
  }
}

async function pass(
  plan: WatchPlan,
  book: WalletBook,
  deps: LadderEngineDeps,
  now: number
) {
  await advanceWatch(
    {
      book,
      marks: new Map([[SNDK, 1366.4]]),
      ladderBars: new Map(),
      now,
    } as never,
    deps,
    { id: "w-sndk", marketKey: SNDK, plan }
  )
}

beforeEach(() => {
  resetWatchChaseGate()
})

describe("a waiting-only close the exchange expired at once", () => {
  it("lets the expired order go and sends a fresh sell for what is held", async () => {
    const plan = closePlan()
    const deps = depsAnswering({ ended: true, filledSz: 0 })

    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 3_000)

    expect(deps.asked).toEqual(["410698304"])
    expect(deps.placed).toEqual([{ side: "sell", sz: 0.4, reduceOnly: true }])
    expect(plan.orderId).toMatch(/^pending:/)
  })

  it("keeps waiting while the exchange says the order is still working", async () => {
    const plan = closePlan()
    const deps = depsAnswering({ ended: false, filledSz: 0 })

    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 3_000)

    expect(deps.placed).toEqual([])
    expect(plan.orderId).toBe("410698304")
  })

  it("keeps waiting when the exchange gives no clear answer", async () => {
    const plan = closePlan()
    const deps = depsAnswering(null)

    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 3_000)

    expect(deps.placed).toEqual([])
    expect(plan.orderId).toBe("410698304")
  })

  it("waits for the position to show what the order sold before replacing it", async () => {
    // 0.1 sold before the order ended, and the position read still says 0.4.
    // A replacement sized off that read would sell 0.1 more than was asked.
    const plan = closePlan()
    const deps = depsAnswering({ ended: true, filledSz: 0.1 })

    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 3_000)
    expect(deps.placed).toEqual([])
    expect(plan.orderId).toBe("410698304")

    // The read catches up: 0.3 left, so 0.3 goes out and not 0.4.
    await pass(plan, bookHolding(0.3), deps, PLACED_AT + 9_000)
    expect(deps.placed).toEqual([{ side: "sell", sz: 0.3, reduceOnly: true }])
  })

  it("does not ask while the open-orders list may still be catching up", async () => {
    const plan = closePlan()
    const deps = depsAnswering({ ended: true, filledSz: 0 })

    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 1_000)

    expect(deps.asked).toEqual([])
    expect(deps.placed).toEqual([])
  })

  it("asks about one missing order at most once every five seconds", async () => {
    const plan = closePlan()
    const deps = depsAnswering({ ended: false, filledSz: 0 })

    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 3_000)
    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 4_000)
    await pass(plan, bookHolding(0.4), deps, PLACED_AT + 8_000)

    expect(deps.asked).toHaveLength(2)
  })
})
