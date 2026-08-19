import { describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import { defaultPaperCosts } from "@/lib/trade/paper"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"

/**
 * What a ladder does inside one crashing candle — and what it costs.
 *
 * Every case here is the same shape: a market that falls through several rungs
 * within a single bar. That is where this engine has been wrong most often,
 * because everything happens between two prices nobody can see inside, and it
 * is also the shape the whole strategy is built to profit from.
 *
 * What a single candle that falls through several rungs actually buys.
 *
 * A replay has no live price, so a rung is modelled as an order on its own
 * book and a bar's wick trading through it is the only way the run can see
 * "price crossed this". A candle that wicks through five rungs should
 * therefore buy five times — that is the whole model.
 */

const FOUR_HOURS = 14_400_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: { intervalMs: () => FOUR_HOURS, roundPx: (px: number) => px },
  }),
}))

const rules = { sizeDecimals: 3, priceTick: null, maxLeverage: 10, volume24hUsd: 1_000_000_000 }

function bar(i: number, o: number, h: number, l: number, c: number): CandleBar {
  return {
    openTime: START + i * FOUR_HOURS,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1_000,
  }
}

function walk(shape: CandleBar[], params: DcaParams) {
  const coin: BacktestCoin = {
    marketKey: "hyperliquid:mainnet:AAA",
    symbol: "AAA",
    rules,
    bars: shape,
    baseBars: [],
    funding: [],
  }
  return runBacktest({
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingUsd: 100_000,
    costs: defaultPaperCosts(),
    strategy: { kind: "dca" as const, params },
    interval: "4h" as const,
    coins: [coin],
    from: START,
    to: START + shape.length * FOUR_HOURS,
  })
}

function ladder(over: Partial<DcaParams> = {}): DcaParams {
  return { ...defaultDcaParams(), anchor: "click", maxPositionPct: 25, ...over }
}

describe("a candle that wicks through every rung", () => {
  it("buys every one of them", async () => {
    // Five rungs from a click at 100, the deepest near 55.7. One candle drops
    // to 10 — under all of them — and closes there.
    const outcome = await walk(
      [
        bar(0, 100, 101, 99, 100),
        bar(1, 100, 101, 99, 100),
        bar(2, 100, 100.5, 10, 12),
        bar(3, 12, 14, 11, 13),
      ],
      ladder()
    )

    const buys = outcome.coins[0].fills.filter((one) => one.side === "buy")
    expect(buys).toHaveLength(5)
    expect(buys.map((one) => one.rung)).toEqual([0, 1, 2, 3, 4])
  })
})

describe("what the ladder had on the book", () => {
  it("records every rung's state as it changes, and only when it changes", async () => {
    const outcome = await walk(
      [
        bar(0, 100, 101, 99, 100),
        bar(1, 100, 101, 99, 100),
        bar(2, 100, 100.5, 10, 12),
        bar(3, 12, 14, 11, 13),
      ],
      ladder()
    )

    const events = outcome.coins[0].rungEvents
    expect(events.length).toBeGreaterThan(0)
    // Oldest first, so a moment can be read off it in order.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at)
    }
    // Every rung ends up bought on this shape, and each says so exactly once.
    for (let rung = 0; rung < 5; rung += 1) {
      const filled = events.filter(
        (one) => one.rung === rung && one.state === "filled"
      )
      expect(filled).toHaveLength(1)
    }
  })

  it("says nothing about a coin that never had a ladder", async () => {
    // Anchored to a base with no bars to find one in: nothing ever arms, so
    // there is nothing to record.
    const outcome = await walk(
      [bar(0, 100, 101, 99, 100), bar(1, 100, 101, 99, 100)],
      ladder({ anchor: "base" })
    )

    expect(outcome.coins[0].rungEvents).toEqual([])
  })
})

/**
 * A ladder built inside one crashing candle can still be liquidated by it.
 *
 * The position used to be held to the same "existed before this bar" test as an
 * order, so every rung bought during a crash was invisible to the liquidation
 * check until the next bar — and by then the coin had usually bounced. HEI
 * bought seven rungs down the 10 Oct 2025 candle, traded through its own
 * liquidation price three rungs before the end, and was never closed.
 */
describe("a borrowed ladder that buys its way down one candle", () => {
  it("is closed out by that same candle when it goes through its floor", async () => {
    // Falls far enough that the blended average is left well above the low,
    // and never comes back, so nothing else can explain the ending.
    const shape = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 101, 99, 100),
      bar(2, 100, 100.5, 8, 9),
      bar(3, 9, 10, 8, 9),
    ]

    const borrowed = await walk(shape, ladder({ leverage: 3 }))
    const cash = await walk(shape, ladder())

    const closedOut = (o: Awaited<ReturnType<typeof walk>>) =>
      o.coins[0].fills.filter((one) => one.reason === "liquidated")

    // Cash cannot be liquidated at all: nothing is borrowed.
    expect(closedOut(cash)).toHaveLength(0)
    // Borrowed is taken by the exchange, on the crash bar itself.
    const taken = closedOut(borrowed)
    expect(taken).toHaveLength(1)
    // **On the same candle that bought it.** A fill inside a bar is stamped at
    // that bar's close, so sharing a timestamp with the buys is the whole
    // point: the position was built during this candle and taken by it. The
    // old code could only liquidate a position that predated the bar, so a
    // ladder rode its own crash down untouched and was fine by morning.
    const crashBar = taken[0].fillTime
    const boughtOnCrashBar = borrowed.coins[0].fills.filter(
      (one) => one.side === "buy" && one.fillTime === crashBar
    )
    expect(boughtOnCrashBar.length).toBeGreaterThan(1)
    // And it was taken BELOW everything it bought, not above — it really did
    // ride the fall before the exchange stepped in.
    for (const buy of boughtOnCrashBar) {
      expect(taken[0].px).toBeLessThan(buy.px)
    }
  })
})

/**
 * A position opened AFTER a stop still carries the ladder's leverage.
 *
 * A stop closes the position, so the next rung to fire opens a fresh one, and a
 * position keeps the leverage of the order that opened it. Get that wrong and a
 * ladder trades borrowed until its first stop and cash for ever after — which
 * makes every borrowed run look far safer than it is, since a position that is
 * not borrowed cannot be liquidated at all.
 *
 * **This covers the rungs armed at placement, not the ones put back by
 * `reviveRungs`.** Reaching that path needs the base stop to step the ladder
 * down, which needs a confirmed base in the scripted history; it is not covered
 * here and the fix in `reviveRungs` rests on reading the code. Worth closing if
 * the leverage figures ever look wrong again.
 */
describe("a rung armed again after a stop", () => {
  it("opens the fresh position at the ladder's leverage", async () => {
    const shape = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 101, 99, 100),
      // Rung 1 (95) buys. Average 95, so the 10% stop sits at 85.5.
      bar(2, 100, 100.5, 94, 94.5),
      // Through the stop: the position closes and the ladder steps down.
      bar(3, 94.5, 95, 84, 84.5),
      // A deeper rung buys, opening a brand new position that is still open
      // when the walk ends — so its leverage can be read straight off it.
      bar(4, 84.5, 85, 76, 76.5),
    ]
    const stopped = ladder({ stopLoss: { pct: 10, base: null } })

    const borrowed = await walk(shape, { ...stopped, leverage: 3 })
    const cash = await walk(shape, stopped)

    // The stop really did fire, or this is testing nothing.
    expect(
      borrowed.coins[0].fills.some((one) => one.reason === "stop_loss")
    ).toBe(true)
    // And a rung bought again afterwards, below where the stop took it.
    expect(
      borrowed.coins[0].fills.some((one) => one.side === "buy" && one.px < 85)
    ).toBe(true)

    expect(borrowed.coins[0].openAtEnd?.leverage).toBe(3)
    expect(cash.coins[0].openAtEnd?.leverage).toBe(1)
  })
})

/**
 * The pot cannot trade money it does not have.
 *
 * A liquidation has to actually take the loss out of the wallet. If it only
 * removed the position, a borrowed run would keep buying with money it had
 * already lost, and every figure after the first liquidation would be built on
 * cash that was never there.
 */
describe("what a liquidation does to the pot", () => {
  it("takes the money out, and the run never spends below nothing", async () => {
    const shape = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 101, 99, 100),
      bar(2, 100, 100.5, 8, 9),
      bar(3, 9, 10, 8, 9),
      bar(4, 9, 12, 8, 11),
      bar(5, 11, 13, 10, 12),
    ]

    const borrowed = await walk(shape, ladder({ leverage: 3 }))

    const closedOut = borrowed.coins[0].fills.filter(
      (one) => one.reason === "liquidated"
    )
    expect(closedOut.length).toBeGreaterThan(0)

    // The pot really is smaller afterwards — the loss was paid, not waived.
    const last = borrowed.equity[borrowed.equity.length - 1].usd
    expect(last).toBeLessThan(100_000)

    // And it never went below nothing on the way. A wallet that dips negative
    // has spent money it did not have.
    for (const point of borrowed.equity) {
      expect(point.usd).toBeGreaterThan(0)
    }
    expect(borrowed.endingUsd).toBeCloseTo(last, 9)
  })
})
