import { describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import { defaultPaperCosts, type PaperCosts } from "@/lib/trade/paper"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"

/**
 * The replay itself.
 *
 * Three promises are made about a run, and they are the ones that decide
 * whether two results can be compared at all: the same run twice gives the same
 * answer, the order coins are fed in changes nothing, and two coins cannot both
 * spend the same money. Everything else about the strategy is already covered
 * by `smart-orders.test.ts` and `paper.test.ts`, which this build did not edit.
 */

const FOUR_HOURS = 14_400_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: {
      intervalMs: () => FOUR_HOURS,
      // No price grid — every price is allowed, so the arithmetic in the test
      // is the arithmetic the reader can do in their head.
      roundPx: (px: number) => px,
    },
  }),
}))

const rules = { sizeDecimals: 3, maxLeverage: 10, volume24hUsd: 1_000_000_000 }

/**
 * A price that falls from 100 for `fall` bars, then climbs back. Enough for a
 * ladder hung off the click price to fill some rungs and take profit.
 */
function bars(fall: number, rise: number): CandleBar[] {
  const out: CandleBar[] = []
  let price = 100
  for (let index = 0; index < fall + rise; index += 1) {
    const next = index < fall ? price * 0.97 : price * 1.03
    out.push({
      openTime: START + index * FOUR_HOURS,
      open: price,
      high: Math.max(price, next),
      low: Math.min(price, next),
      close: next,
      volume: 1_000,
    })
    price = next
  }
  return out
}

function coin(marketKey: string, shape: CandleBar[]): BacktestCoin {
  return {
    marketKey,
    symbol: marketKey.split(":")[2],
    rules,
    bars: shape,
    // The base rule is not what these cases are about; the ladders below hang
    // off the click price, so no base is needed for one to arm.
    baseBars: [],
  }
}

function params(overrides: Partial<DcaParams> = {}): DcaParams {
  return {
    ...defaultDcaParams(),
    anchor: "click",
    maxPositionPct: 25,
    ...overrides,
  }
}

function inputFor(
  coins: BacktestCoin[],
  overrides: { costs?: PaperCosts; params?: DcaParams; startingUsd?: number } = {}
) {
  return {
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingUsd: overrides.startingUsd ?? 10_000,
    costs: overrides.costs ?? defaultPaperCosts(),
    params: overrides.params ?? params(),
    interval: "4h" as const,
    coins,
    from: START,
    to: START + 200 * FOUR_HOURS,
  }
}

describe("the same run twice", () => {
  it("gives the identical answer", async () => {
    const coins = [
      coin("hyperliquid:mainnet:AAA", bars(10, 10)),
      coin("hyperliquid:mainnet:BBB", bars(8, 12)),
    ]

    const first = await runBacktest(inputFor(coins))
    const second = await runBacktest(inputFor(coins))

    expect(second.endingUsd).toBe(first.endingUsd)
    expect(second.equity).toEqual(first.equity)
    expect(second.coins.map((one) => one.fills.length)).toEqual(
      first.coins.map((one) => one.fills.length)
    )
  })

  it("is unmoved by the order the coins are fed in", async () => {
    // Coins sharing a bar are handled alphabetically, on purpose. Without that
    // written rule two runs of the same flow could spend the same pot in a
    // different order and disagree.
    const aaa = coin("hyperliquid:mainnet:AAA", bars(10, 10))
    const bbb = coin("hyperliquid:mainnet:BBB", bars(8, 12))

    const forwards = await runBacktest(inputFor([aaa, bbb]))
    const backwards = await runBacktest(inputFor([bbb, aaa]))

    expect(backwards.endingUsd).toBe(forwards.endingUsd)
    expect(backwards.equity).toEqual(forwards.equity)
  })
})

describe("one pot", () => {
  it("never lets two coins spend the same money", async () => {
    // Four coins each allowed 40% of the pot cannot all be full: 160% of the
    // money does not exist. The engine has to refuse the ones that arrive
    // after the cash has gone, exactly as it would with real money.
    const coins = ["AAA", "BBB", "CCC", "DDD"].map((symbol) =>
      coin(`hyperliquid:mainnet:${symbol}`, bars(12, 8))
    )

    const outcome = await runBacktest(
      inputFor(coins, { params: params({ maxPositionPct: 40 }) })
    )

    // Nothing ever goes negative, at any moment of the walk.
    expect(Math.min(...outcome.equity.map((point) => point.usd))).toBeGreaterThan(0)
    expect(Math.max(...outcome.inPlay)).toBeLessThanOrEqual(10_000 + 1e-6)
  })

  it("reports the pot as one line, not one line per coin", async () => {
    const coins = [
      coin("hyperliquid:mainnet:AAA", bars(10, 10)),
      coin("hyperliquid:mainnet:BBB", bars(10, 10)),
    ]
    const outcome = await runBacktest(inputFor(coins))

    // One point per bar time, whatever the coin count — the combined pot.
    expect(outcome.equity).toHaveLength(20)
  })
})

describe("what trading costs", () => {
  it("leaves less behind when the fees are higher", async () => {
    const coins = [coin("hyperliquid:mainnet:AAA", bars(10, 10))]

    const cheap = await runBacktest(inputFor(coins))
    const dear = await runBacktest(
      inputFor(coins, {
        costs: { takerFeeRate: 0.01, makerFeeRate: 0.01, slippageRate: 0 },
      })
    )

    expect(dear.endingUsd).toBeLessThan(cheap.endingUsd)
  })

  it("makes slippage cost money rather than earn it", async () => {
    // Getting the sign wrong here would make a backtest *better* the more it
    // slipped, which is the one direction it must never go.
    const coins = [coin("hyperliquid:mainnet:AAA", bars(14, 6))]

    const none = await runBacktest(
      inputFor(coins, {
        params: params({ stopLoss: { pct: 5, base: null } }),
      })
    )
    const slipping = await runBacktest(
      inputFor(coins, {
        params: params({ stopLoss: { pct: 5, base: null } }),
        costs: { ...defaultPaperCosts(), slippageRate: 0.01 },
      })
    )

    expect(slipping.endingUsd).toBeLessThanOrEqual(none.endingUsd)
  })
})

describe("stopping", () => {
  it("ends the walk where it is and says so", async () => {
    const coins = [coin("hyperliquid:mainnet:AAA", bars(100, 100))]
    let asked = 0

    const outcome = await runBacktest(inputFor(coins), {
      shouldStop: () => {
        asked += 1
        return asked > 1
      },
    })

    expect(outcome.stoppedEarly).toBe(true)
    expect(outcome.reachedTo).toBeLessThan(START + 200 * FOUR_HOURS)
  })

  it("reports how far through it got as it goes", async () => {
    const seen: number[] = []
    await runBacktest(inputFor([coin("hyperliquid:mainnet:AAA", bars(10, 10))]), {
      onProgress: (fraction) => {
        seen.push(fraction)
      },
    })

    expect(seen[0]).toBe(0)
    expect(seen[seen.length - 1]).toBe(1)
  })
})

describe("a coin with no bars in the window", () => {
  it("takes no part rather than taking the pot down", async () => {
    const outcome = await runBacktest(
      inputFor([
        coin("hyperliquid:mainnet:AAA", bars(10, 10)),
        coin("hyperliquid:mainnet:ZZZ", []),
      ])
    )

    const empty = outcome.coins.find((one) => one.marketKey.endsWith("ZZZ"))
    expect(empty?.fills).toEqual([])
    expect(empty?.lastPx).toBeNull()
  })
})

describe("the ladder really runs", () => {
  it("buys the fall and banks the rise", async () => {
    const outcome = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", bars(10, 10))])
    )
    const fills = outcome.coins[0].fills

    expect(fills.filter((one) => one.side === "buy").length).toBeGreaterThan(0)
    expect(fills.filter((one) => one.side === "sell").length).toBeGreaterThan(0)
  })

  it("never reads the real clock", async () => {
    // Every moment inside a run has to come from a bar's own time. One `now()`
    // in the wrong place and re-running the same test next week would answer
    // differently — the buy-back's day counter is the obvious way in.
    const outcome = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", bars(10, 10))])
    )

    for (const trade of outcome.coins[0].fills) {
      expect(trade.fillTime).toBeGreaterThanOrEqual(START)
      expect(trade.fillTime).toBeLessThanOrEqual(START + 21 * FOUR_HOURS)
    }
  })
})

describe("a run with many coins", () => {
  it("does not stop trading at the practice wallet's fifty orders", async () => {
    // The real defect this covers: a hand-driven practice wallet may hold fifty
    // resting orders, and a replay was held to the same fifty. Fourteen coins
    // with eight rungs each filled it, so every coin after them was refused for
    // the WHOLE run — and because coins are walked in name order, that meant
    // the alphabet decided who got tested. A live run showed trades on 0G, 2Z,
    // AAVE … ARB and nothing at all on the other 154.
    const coins = Array.from({ length: 40 }, (_, index) =>
      coin(`hyperliquid:mainnet:C${String(index).padStart(2, "0")}`, bars(6, 20))
    )
    const result = await runBacktest(
      inputFor(coins, { startingUsd: 5_000_000 }),
      {}
    )

    const traded = result.coins.filter((one) => one.fills.length > 0)
    // Not "most of them" — every coin is fed the same shape, so anything less
    // than all of them means something is still turning coins away.
    expect(traded).toHaveLength(coins.length)
  })
})

describe("a ladder that watches candles", () => {
  it("never buys on bars from before it existed", async () => {
    // The defect: with nowhere to record when it started, a ladder's first
    // watching pass read the WHOLE feed and bought a rung on each of the
    // earliest bars — months before it was created. On a chart that is a
    // column of buys in one spot with its rungs out of order.
    const shape = bars(6, 40)
    const result = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", shape)]),
      {}
    )

    const fills = result.coins[0].fills
    expect(fills.length).toBeGreaterThan(0)
    // Nothing may be stamped before the run's own first bar closed, and no two
    // rungs may buy on the same bar — one candle, one rung.
    const firstClose = shape[0].openTime + FOUR_HOURS
    for (const one of fills) expect(one.fillTime).toBeGreaterThanOrEqual(firstClose)
    const buyTimes = fills
      .filter((one) => one.side === "buy")
      .map((one) => one.fillTime)
    expect(new Set(buyTimes).size).toBe(buyTimes.length)
  })
})

describe("a crash that bounces inside one candle", () => {
  it("sells the rungs it bought without waiting for the candle to end", async () => {
    // KAS, 10 October 2025: 7.1c down to 0.9c and back to 5.5c, all inside one
    // four-hour candle. Every rung bought on the way down. The exits used to be
    // placed by the ladder AFTERWARDS, and by then price was back above four of
    // them — so those four were never sold, and sat there until a stop months
    // later. A real exchange has the exit resting the instant the buy fills.
    const shape: CandleBar[] = []
    for (let index = 0; index < 4; index += 1) {
      shape.push({
        openTime: START + index * FOUR_HOURS,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1_000_000,
      })
    }
    const crash = {
      openTime: START + 4 * FOUR_HOURS,
      open: 100,
      high: 100,
      low: 10,
      close: 78,
      volume: 1_000_000,
    }
    shape.push(crash)
    for (let index = 5; index < 20; index += 1) {
      shape.push({
        openTime: START + index * FOUR_HOURS,
        open: 78,
        high: 79,
        low: 77,
        close: 78,
        volume: 1_000_000,
      })
    }

    const result = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", shape)], {
        params: params({ takeProfit: { mode: "prevRung", pct: 2 } }),
      })
    )

    const fills = result.coins[0].fills
    // A fill is stamped with the OPEN of the bar it happened in — the moment
    // that names that candle everywhere else in the app. It used to carry the
    // bar's close, which is the same instant as the next candle's open, so
    // every trade read four hours later than it happened.
    const boughtInCrash = fills.filter(
      (one) => one.side === "buy" && one.fillTime === crash.openTime
    )
    const soldInCrash = fills.filter(
      (one) => one.side === "sell" && one.fillTime === crash.openTime
    )

    expect(boughtInCrash.length).toBeGreaterThan(1)
    // The bounce carried price back over the exits of the deepest rungs, so
    // those rungs sold in the same candle that bought them.
    expect(soldInCrash.length).toBeGreaterThan(0)
    for (const sale of soldInCrash) {
      expect(sale.px).toBeGreaterThan(crash.low)
    }
  })
})

describe("holding through a market-wide crash", () => {
  /**
   * Twelve coins that sit flat, all collapse 80% inside the same four-hour
   * candle, and are back near where they started by the next one. That is the
   * shape of 10 October 2025, and the shape the rule exists for.
   */
  function crashingMarket(): BacktestCoin[] {
    return Array.from({ length: 12 }, (_, index) => {
      const shape: CandleBar[] = []
      for (let bar = 0; bar < 3; bar += 1) {
        shape.push({
          openTime: START + bar * FOUR_HOURS,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1_000_000,
        })
      }
      // The crash: opens at 100, wipes out to 20, closes back at 95.
      shape.push({
        openTime: START + 3 * FOUR_HOURS,
        open: 100,
        high: 100,
        low: 20,
        close: 95,
        volume: 5_000_000,
      })
      for (let bar = 4; bar < 12; bar += 1) {
        shape.push({
          openTime: START + bar * FOUR_HOURS,
          open: 95,
          high: 100,
          low: 94,
          close: 98,
          volume: 1_000_000,
        })
      }
      return coin(`hyperliquid:mainnet:C${String(index).padStart(2, "0")}`, shape)
    })
  }

  const laddered = { takeProfit: { mode: "prevRung" as const, pct: 2 } }

  it("sells the deepest rung at the rung above it when the rule is off", async () => {
    const result = await runBacktest(
      inputFor(crashingMarket(), { params: params(laddered) })
    )
    const fills = result.coins[0].fills
    const buys = fills.filter((one) => one.side === "buy")
    expect(buys.length).toBeGreaterThan(1)

    // The deepest buy is the biggest one, and it gets sold in the same candle
    // for barely more than it paid. That is the behaviour being changed.
    const deepest = buys.reduce((low, one) => (one.px < low.px ? one : low))
    const sold = fills.find(
      (one) => one.side === "sell" && Math.abs(one.sz - deepest.sz) < 1e-9
    )
    expect(sold).toBeDefined()
    expect(sold!.fillTime).toBe(deepest.fillTime)
  })

  it("does not sell the deepest rung into the crash when the rule is on", async () => {
    const result = await runBacktest(
      inputFor(crashingMarket(), {
        params: params({
          ...laddered,
          cascade: { fallPct: 50, withinHours: 4, minCoins: 10, holdHours: 4 },
        }),
      })
    )
    const fills = result.coins[0].fills
    const buys = fills.filter((one) => one.side === "buy")
    expect(buys.length).toBeGreaterThan(1)

    const deepest = buys.reduce((low, one) => (one.px < low.px ? one : low))
    const sameCandle = fills.filter(
      (one) =>
        one.side === "sell" &&
        one.fillTime === deepest.fillTime &&
        Math.abs(one.sz - deepest.sz) < 1e-9
    )
    expect(sameCandle).toHaveLength(0)
  })

  it("leaves an ordinary one-coin crash alone", async () => {
    // The same 80% collapse, but only this coin has it. One coin falling is a
    // catastrophe that may never come back; the rule must not touch it.
    const market = crashingMarket().map((one, index) =>
      index === 0
        ? one
        : coin(one.marketKey, bars(12, 100))
    )
    const result = await runBacktest(
      inputFor(market, {
        params: params({
          ...laddered,
          cascade: { fallPct: 50, withinHours: 4, minCoins: 10, holdHours: 4 },
        }),
      })
    )
    const fills = result.coins[0].fills
    const buys = fills.filter((one) => one.side === "buy")
    const deepest = buys.reduce((low, one) => (one.px < low.px ? one : low))
    const sold = fills.find(
      (one) => one.side === "sell" && Math.abs(one.sz - deepest.sz) < 1e-9
    )
    expect(sold).toBeDefined()
    expect(sold!.fillTime).toBe(deepest.fillTime)
  })
})

describe("what counts as a base", () => {
  /**
   * The two numbers that decide where the floor is have to come from the FLOW,
   * not from the indicator's factory pair.
   *
   * They used to be neither settable nor testable: fixed at 36 and 8 inside the
   * code, so every backtest ever run tested one definition of a base and there
   * was no way to try another. A strategy that hangs every rung off "the base"
   * cannot be tested at all if what a base is cannot be moved.
   *
   * A long, choppy fall gives the two settings something to disagree about: a
   * short search finds a new low every few bars, a long one holds out for a
   * deeper one.
   */
  function staircase(): CandleBar[] {
    const out: CandleBar[] = []
    let price = 100
    for (let index = 0; index < 300; index += 1) {
      // A step down every tenth bar, dead flat in between. Each shelf is a new
      // low that then STANDS, which is exactly what a base is — and it stands
      // for nine bars, so a short wait confirms one and a long wait never does.
      const next = index > 0 && index % 10 === 0 ? price * 0.95 : price
      out.push({
        openTime: START + index * FOUR_HOURS,
        open: price,
        high: Math.max(price, next),
        low: Math.min(price, next),
        close: next,
        volume: 1_000,
      })
      price = next
    }
    return out
  }

  async function runWith(searchBars: number, holdBars: number) {
    const shape = staircase()
    return runBacktest({
      ...inputFor([{ ...coin("hyperliquid:mainnet:AAA", shape), baseBars: shape }], {
        params: params({
          anchor: "base",
          baseDetection: {
            searchBars,
            holdBars,
            withTrendOnly: false,
            minBarsApart: 1,
          },
        }),
      }),
      to: START + 300 * FOUR_HOURS,
    })
  }

  it("changes what the run does when the numbers change", async () => {
    const quick = await runWith(8, 2)
    const patient = await runWith(120, 40)

    // Not a claim about which is better — only that the setting reaches the
    // run at all. Before this it did not, and both of these were the same run.
    expect(quick.coins[0].fills.length).not.toBe(patient.coins[0].fills.length)
  })

  it("is carried by the ladder, so two runs of one flow still match", async () => {
    const once = await runWith(8, 2)
    const twice = await runWith(8, 2)

    expect(once.endingUsd).toBe(twice.endingUsd)
    expect(once.coins[0].fills.length).toBe(twice.coins[0].fills.length)
  })
})
