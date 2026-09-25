import { describe, expect, it } from "vitest"

import {
  openPositionIsRunning,
  splitRunTrades,
  tradeRunId,
} from "./attribution"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"

/**
 * Telling one run's trades from everything else on the same wallet.
 *
 * The rule under test is the one that decides whose money a figure is about,
 * so every case here is a way of getting that wrong: a stop the exchange
 * fired, a hand trade on the same coin the same minute, and a coin one run
 * left held that a later run added to.
 */

function fill(patch: Partial<LiveFill> = {}): LiveFill {
  return {
    fillId: "f1",
    orderId: "o1",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    side: "buy",
    px: 100,
    sz: 1,
    at: 1_000,
    closedPnl: 0,
    fee: 0,
    dir: "Open Long",
    liquidation: false,
    ...patch,
  }
}

function trade(fills: LiveFill[]): LiveTrade {
  return {
    id: "t1",
    walletId: "w1",
    marketKey: fills[0].marketKey,
    live: true,
    direction: "long",
    openedAt: fills[0].at,
    closedAt: fills[fills.length - 1].at,
    heldMs: 0,
    entryPx: 100,
    exitPx: 110,
    sz: 1,
    amountUsd: 100,
    pnl: 10,
    returnPct: 10,
    ending: "closed",
    stopPx: null,
    fills,
  }
}

describe("tradeRunId", () => {
  it("claims a trade whose opening order was the flow's", () => {
    const owners = new Map([["o1", "run-a"]])
    expect(tradeRunId(trade([fill()]), owners)).toBe("run-a")
  })

  it("keeps an exit the exchange fired under an order we never sent", () => {
    // The whole reason attribution is per round trip. A stop or a liquidation
    // comes back with an order id this app has never heard of.
    const owners = new Map([["o1", "run-a"]])
    const stopped = trade([
      fill(),
      fill({ fillId: "f2", orderId: "exchange-stop", side: "sell", at: 2_000 }),
    ])
    expect(tradeRunId(stopped, owners)).toBe("run-a")
  })

  it("leaves a hand trade on the same coin alone", () => {
    const owners = new Map([["o1", "run-a"]])
    const byHand = trade([fill({ fillId: "f9", orderId: "by-hand", at: 1_050 })])
    expect(tradeRunId(byHand, owners)).toBeNull()
  })

  it("gives a trade two runs touched to the one that opened it", () => {
    const owners = new Map([
      ["o1", "run-a"],
      ["o2", "run-b"],
    ])
    const shared = trade([
      fill(),
      fill({ fillId: "f2", orderId: "o2", at: 2_000 }),
    ])
    expect(tradeRunId(shared, owners)).toBe("run-a")
  })
})

describe("splitRunTrades", () => {
  it("counts what was not this run's rather than hiding it", () => {
    const owners = new Map([["o1", "run-a"]])
    const mine = trade([fill()])
    const theirs = { ...trade([fill({ orderId: "by-hand" })]), id: "t2" }
    const split = splitRunTrades([mine, theirs], "run-a", owners)
    expect(split.mine.map((one) => one.id)).toEqual(["t1"])
    expect(split.notMine).toBe(1)
  })

  it("counts another run's trades as not this one's", () => {
    const owners = new Map([["o2", "run-b"]])
    const split = splitRunTrades(
      [trade([fill({ orderId: "o2" })])],
      "run-a",
      owners
    )
    expect(split.mine).toHaveLength(0)
    expect(split.notMine).toBe(1)
  })
})

describe("openPositionIsRunning", () => {
  it("reads the earliest fill, whatever order they arrive in", () => {
    // Open fills come back newest first, so a naive read would answer off the
    // last add rather than off the buy that opened the position.
    const owners = new Map([["o1", "run-a"]])
    const open = [
      fill({ fillId: "f2", orderId: "by-hand", at: 3_000 }),
      fill({ fillId: "f1", orderId: "o1", at: 1_000 }),
    ]
    expect(
      openPositionIsRunning(open, "hyperliquid:mainnet:BTC", "run-a", owners)
    ).toBe(true)
  })

  it("says no when nothing is held on that coin", () => {
    expect(
      openPositionIsRunning([], "hyperliquid:mainnet:BTC", "run-a", new Map())
    ).toBe(false)
  })
})
