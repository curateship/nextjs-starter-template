import { describe, expect, it, vi } from "vitest"

import type { CandleBar, FundingRate } from "@/lib/protocols/contracts"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import {
  defaultTradeGridSettings,
  emaGridCleanBars,
} from "@/lib/automations/nodes/trade-grid"
import { emaGridStances } from "@/lib/trade/ema-grid"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import { defaultPaperCosts, type PaperCosts } from "@/lib/trade/paper"
import {
  runBacktest,
  type BacktestCoin,
  type BacktestStrategy,
} from "@/server/trade/backtest/engine"

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
    capabilities: { gridStop: "exchange" },
    markets: {
      intervalMs: () => FOUR_HOURS,
      // No price grid — every price is allowed, so the arithmetic in the test
      // is the arithmetic the reader can do in their head.
      roundPx: (px: number) => px,
    },
  }),
}))

const rules = {
  sizeDecimals: 3,
  priceTick: null,
  maxLeverage: 10,
  volume24hUsd: 1_000_000_000,
}

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

function coin(
  marketKey: string,
  shape: CandleBar[],
  funding: FundingRate[] = []
): BacktestCoin {
  return {
    marketKey,
    symbol: marketKey.split(":")[2],
    rules,
    bars: shape,
    // The base rule is not what these cases are about; the ladders below hang
    // off the click price, so no base is needed for one to arm.
    baseBars: [],
    funding,
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
  overrides: {
    costs?: PaperCosts
    params?: DcaParams
    startingUsd?: number
  } = {}
) {
  return {
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingUsd: overrides.startingUsd ?? 10_000,
    costs: overrides.costs ?? defaultPaperCosts(),
    strategy: { kind: "dca" as const, params: overrides.params ?? params() },
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
    expect(
      Math.min(...outcome.equity.map((point) => point.usd))
    ).toBeGreaterThan(0)
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

describe("an EMA Grid backtest", () => {
  it("changes from a buying grid to a selling grid after the clean wait", async () => {
    const warmup = Array.from({ length: 600 }, (_, index): CandleBar => ({
      openTime: START - (600 - index) * FOUR_HOURS,
      open: 100,
      high: 100.2,
      low: 99.8,
      close: 100,
      volume: 1_000,
    }))
    let last = 100
    const walked: CandleBar[] = []
    const add = (close: number) => {
      walked.push({
        openTime: START + walked.length * FOUR_HOURS,
        open: last,
        high: Math.max(last, close) + 0.2,
        low: Math.min(last, close) - 0.2,
        close,
        volume: 1_000,
      })
      last = close
    }
    for (let index = 1; index <= 18; index += 1) add(100 + index)
    for (let index = 1; index <= 45; index += 1) add(118 - index * 1.5)

    const settings = {
      ...defaultTradeGridSettings(),
      grid: {
        ...defaultTradeGridSettings().grid,
        levels: 4,
        rangePct: 8,
        potPct: 20,
        stopLoss: { underPct: 5 },
      },
    }
    const history = [...warmup, ...walked]
    const stances = emaGridStances(history, {
      emaPeriod: settings.emaPeriod,
      cleanBars: emaGridCleanBars(settings),
    })
    const shortAt = history.findIndex(
      (bar, index) => bar.openTime >= START && stances[index] === "short"
    )
    expect(shortAt).toBeGreaterThanOrEqual(600)

    // The selling grid is now below its range. A rally reaches its sell
    // triggers and the next fall buys those rungs back.
    const shortAnchor = history[shortAt].close
    add(shortAnchor * 1.07)
    add(shortAnchor * 0.9)

    const outcome = await runBacktest({
      protocol: "hyperliquid",
      network: "mainnet",
      startingUsd: 10_000,
      costs: { takerFeeRate: 0, makerFeeRate: 0, slippageRate: 0 },
      strategy: { kind: "emaGrid", settings },
      interval: "4h",
      coins: [
        {
          marketKey: "hyperliquid:mainnet:AAA",
          symbol: "AAA",
          rules,
          bars: walked,
          baseBars: [...warmup, ...walked],
          funding: [],
        },
      ],
      from: START,
      to: START + walked.length * FOUR_HOURS,
    })

    const fills = outcome.coins[0].fills
    const firstShortSignalTime = history[shortAt].openTime
    const shortEntry = fills.find(
      (one) =>
        one.fillTime > firstShortSignalTime &&
        one.side === "sell" &&
        one.rung !== null
    )
    expect(shortEntry).toBeDefined()
    const shortExit = fills.find(
      (one) =>
        one.fillTime >= (shortEntry?.fillTime ?? Infinity) &&
        one.side === "buy" &&
        one.closedPnl > 0
    )
    expect(shortExit).toBeDefined()
    expect(shortExit?.rung).toBe(shortEntry?.rung)
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

  it("charges each historical funding hour with hand-checkable arithmetic", async () => {
    const shape: CandleBar[] = [
      {
        openTime: START,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1,
      },
      {
        openTime: START + FOUR_HOURS,
        open: 100,
        high: 100,
        low: 94,
        close: 94,
        volume: 1,
      },
      {
        openTime: START + 2 * FOUR_HOURS,
        open: 94,
        high: 94,
        low: 94,
        close: 94,
        volume: 1,
      },
    ]
    const firstFunding = START + 2 * FOUR_HOURS
    const funding = [0.001, 0.002, 0.003].map((rate, index) => ({
      time: firstFunding + index * 3_600_000,
      rate,
    }))
    const outcome = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", shape, funding)], {
        costs: { takerFeeRate: 0, makerFeeRate: 0, slippageRate: 0 },
        params: params({
          rungs: [{ deviation: 5 }],
          maxPositionPct: 50,
          takeProfit: { mode: "prevRung", pct: 1 },
        }),
      })
    )

    const buy = outcome.coins[0].fills.find((fill) => fill.side === "buy")
    expect(buy).toBeDefined()
    // Position size × the $94 historical price × (0.1% + 0.2% + 0.3%).
    const checkedByHand = buy!.sz * 94 * 0.006
    expect(outcome.fundingPaid).toBeCloseTo(checkedByHand, 10)
    expect(outcome.coins[0].fundingPaid).toBeCloseTo(checkedByHand, 10)
    expect(outcome.endingUsd).toBeCloseTo(10_000 - checkedByHand - buy!.sz, 6)
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
    await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", bars(10, 10))]),
      {
        onProgress: (fraction) => {
          seen.push(fraction)
        },
      }
    )

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

describe("compound order sizing", () => {
  function cycleBar(
    index: number,
    open: number,
    high: number,
    low: number,
    close: number
  ): CandleBar {
    return {
      openTime: START + index * FOUR_HOURS,
      open,
      high,
      low,
      close,
      volume: 1_000,
    }
  }

  const cycleBars: CandleBar[] = [
    cycleBar(0, 100, 100, 100, 100),
    cycleBar(1, 100, 100, 94, 94),
    cycleBar(2, 94, 101, 94, 100),
    cycleBar(3, 100, 100, 94, 94),
    cycleBar(4, 94, 101, 94, 100),
  ]

  async function buyDollars(compound: boolean) {
    const outcome = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", cycleBars)], {
        costs: { takerFeeRate: 0, makerFeeRate: 0, slippageRate: 0 },
        params: params({
          compound,
          rungs: [{ deviation: 5 }],
          maxPositionPct: 50,
          sizeMultiplier: 1,
          takeProfit: { mode: "prevRung", pct: 1 },
        }),
      })
    )
    return outcome.coins[0].fills
      .filter((fill) => fill.side === "buy")
      .map((fill) => fill.px * fill.sz)
  }

  it("grows later ladders with the pot when compound is on", async () => {
    const buys = await buyDollars(true)

    expect(buys).toHaveLength(2)
    expect(buys[1]).toBeGreaterThan(buys[0])
  })

  it("keeps later ladders on the starting pot when fixed is selected", async () => {
    const buys = await buyDollars(false)

    expect(buys).toHaveLength(2)
    expect(buys[1]).toBeCloseTo(buys[0], 6)
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
      coin(
        `hyperliquid:mainnet:C${String(index).padStart(2, "0")}`,
        bars(6, 20)
      )
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
    for (const one of fills)
      expect(one.fillTime).toBeGreaterThanOrEqual(firstClose)
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
      return coin(
        `hyperliquid:mainnet:C${String(index).padStart(2, "0")}`,
        shape
      )
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
          cascade: {
            fallPct: 50,
            withinHours: 4,
            minCoins: 10,
            holdHours: 4,
            leastLeverage: null,
          },
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
      index === 0 ? one : coin(one.marketKey, bars(12, 100))
    )
    const result = await runBacktest(
      inputFor(market, {
        params: params({
          ...laddered,
          cascade: {
            fallPct: 50,
            withinHours: 4,
            minCoins: 10,
            holdHours: 4,
            leastLeverage: null,
          },
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
      ...inputFor(
        [{ ...coin("hyperliquid:mainnet:AAA", shape), baseBars: shape }],
        {
          params: params({
            anchor: "base",
            baseDetection: {
              searchBars,
              holdBars,
              withTrendOnly: false,
              minBarsApart: 1,
            },
          }),
        }
      ),
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

describe("replaying a signals run", () => {
  /**
   * The replay has to model the chase HONESTLY or not at all.
   *
   * A run that assumed every chased limit filled at the arrow's price would be
   * a run that had invented money — and it would flatter the strategy in
   * exactly the situation the setting exists for, a price running away. So
   * these check the two halves: an order that price came back to fills, and
   * one it left behind does not.
   */
  function signalsFor(over: { stakePct?: number; chaseGiveUp?: number } = {}) {
    const indicators = defaultIndicatorSettings()
    return {
      kind: "signals" as const,
      indicators: {
        ...indicators,
        base: {
          ...indicators.base,
          on: true,
          params: {
            ...indicators.base.params,
            searchBars: 4,
            holdBars: 1,
            minBarsApart: 1,
            withTrendOnly: false,
            showBases: true,
            showCeilings: false,
          },
        },
      },
      stakePct: over.stakePct ?? 25,
      chaseGiveUp: over.chaseGiveUp ?? 0.02,
    }
  }

  /** Bars built straight from a list of lows, so a base confirms where wanted. */
  function fromLows(lows: number[], highOver = 100): CandleBar[] {
    return lows.map((low, index) => ({
      openTime: START + index * FOUR_HOURS,
      open: low + 0.5,
      high: low + highOver,
      low,
      close: low + 0.5,
      volume: 1_000,
    }))
  }

  function runFor(shape: CandleBar[], strategy: BacktestStrategy) {
    return runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy,
      interval: "4h" as const,
      coins: [coin("hyperliquid:mainnet:AAA", shape)],
      from: START,
      to: START + shape.length * FOUR_HOURS,
    })
  }

  it("gives the identical answer twice", async () => {
    const shape = fromLows([10, 9, 8, 7, 5, 6, 7, 6, 5, 6, 7, 8])
    const first = await runFor(shape, signalsFor())
    const second = await runFor(shape, signalsFor())

    expect(second.endingUsd).toBe(first.endingUsd)
    expect(second.equity).toEqual(first.equity)
  })

  it("buys on an arrow when price comes back to the order", async () => {
    // Dips to 5 at bar 4, confirming a base at bar 5. The order is placed on
    // the bar after that, and a bar can only fill an order that already existed
    // when it opened — so price has to stay down for a couple of bars, which is
    // exactly what it does here.
    const shape = fromLows([10, 9, 8, 7, 5, 6, 6, 5.5, 5.2, 6, 7, 8])
    const outcome = await runFor(shape, signalsFor())

    const fills = outcome.coins[0].fills
    expect(fills.length).toBeGreaterThan(0)
    expect(fills[0].side).toBe("buy")
    // And it did not pay the market: the fill is at the price it asked for.
    expect(fills[0].px).toBeLessThanOrEqual(shape[5].close)
  })

  it("cannot act on an arrow before its own candle has closed", async () => {
    // The one lookahead this walk could commit, and the one that would make
    // every signals result too good. An arrow is NAMED by the candle it printed
    // on, so its time equals the previous bar's close — and comparing against
    // the close rather than the open acted on it a whole bar early, at a price
    // the run could not have had. It cost a real bug on the way in.
    //
    // The arrow here confirms on bar 5. Bar 6 is the earliest anything can be
    // ASKED for, and bar 7 the earliest anything can fill.
    const shape = fromLows([10, 9, 8, 7, 5, 6, 6, 5.5, 5.2, 6, 7, 8])
    const outcome = await runFor(shape, signalsFor())

    expect(outcome.coins[0].fills.length).toBeGreaterThan(0)
    expect(outcome.coins[0].fills[0].fillTime).toBeGreaterThanOrEqual(
      START + 7 * FOUR_HOURS
    )
  })

  it("buys nothing at all when price never comes back", async () => {
    // The same base, then straight up and away. The chase follows to its limit
    // and gives up, and a run that reported a fill here would be inventing one.
    const shape = fromLows([10, 9, 8, 7, 5, 6, 20, 40, 80, 160, 320, 640])
    const outcome = await runFor(shape, signalsFor({ chaseGiveUp: 0.02 }))

    expect(outcome.coins[0].fills).toHaveLength(0)
    expect(outcome.endingUsd).toBe(10_000)
  })

  it("sees the window's first bars, using history from before it", async () => {
    // Without a head start an indicator cannot say anything about the window's
    // opening candles — a base searching 4 back has nothing to search until
    // candle 4 — so the run silently tested less than it claimed. With a long
    // search over a short window it tested NOTHING and still printed a result,
    // which reads as "the strategy lost nothing" rather than "it could not see".
    //
    // The window here is six bars: too short to confirm anything on its own,
    // and plenty once the six bars before it are handed over as well.
    // A long fall that bottoms out right at the window's edge, then a window
    // that hovers there. The base confirms on the window's FIRST bar, which is
    // exactly the bar a run with no head start is blind to.
    const window = fromLows([100, 101, 100.5, 99.5, 100.2, 100])
    const before = fromLows([200, 180, 160, 140, 120, 100]).map(
      (bar, index) => ({ ...bar, openTime: START - (6 - index) * FOUR_HOURS })
    )

    const blind = await runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy: signalsFor(),
      interval: "4h" as const,
      coins: [coin("hyperliquid:mainnet:AAA", window)],
      from: START,
      to: START + window.length * FOUR_HOURS,
    })
    expect(blind.coins[0].fills).toHaveLength(0)

    const seeing = await runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy: signalsFor(),
      interval: "4h" as const,
      coins: [
        { ...coin("hyperliquid:mainnet:AAA", window), warmupBars: before },
      ],
      from: START,
      to: START + window.length * FOUR_HOURS,
    })
    expect(seeing.coins[0].fills.length).toBeGreaterThan(0)
  })

  it("never acts on an arrow that printed before the run started", async () => {
    // The head start is so the indicator can SEE, never so the run can trade on
    // it. An arrow from before the window would otherwise buy on the very first
    // bar on the strength of something that happened before the test began.
    // The base confirms on the LAST warm-up bar, before the run starts, and
    // the window itself never confirms one.
    const window = fromLows([300, 310, 320, 330, 340, 350])
    const before = fromLows([200, 180, 160, 140, 120, 120]).map(
      (bar, index) => ({ ...bar, openTime: START - (6 - index) * FOUR_HOURS })
    )

    const outcome = await runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy: signalsFor(),
      interval: "4h" as const,
      coins: [
        { ...coin("hyperliquid:mainnet:AAA", window), warmupBars: before },
      ],
      from: START,
      to: START + window.length * FOUR_HOURS,
    })

    expect(outcome.coins[0].fills).toHaveLength(0)
    expect(outcome.endingUsd).toBe(10_000)
  })

  it("does nothing when no indicator is switched on", async () => {
    const shape = fromLows([10, 9, 8, 7, 5, 6, 5.5, 5.2, 6, 7, 8, 9])
    const outcome = await runFor(shape, {
      kind: "signals" as const,
      indicators: defaultIndicatorSettings(),
      stakePct: 25,
      chaseGiveUp: 0.02,
    })

    expect(outcome.coins[0].fills).toHaveLength(0)
    expect(outcome.endingUsd).toBe(10_000)
  })
})

/**
 * Leverage, and the reason a replay could not measure it before.
 *
 * A backtest runs on Binance history, and Binance reports no leverage limit —
 * so every replay coin arrived with a limit of `1`, and `liquidationPx` refuses
 * a limit of 1. Nothing could ever be closed out. A 2x run therefore reported
 * every winner doubled and not one of the positions the exchange would have
 * taken away, which is not a lenient result but a fictional one.
 *
 * `replayMarketRules` fills that limit in from the venue the money is actually
 * going to. These two prove the engine does something with it.
 */
describe("a ladder that borrows", () => {
  // Falls hard and never comes back, so the position is a long way under water
  // by the end whichever leverage it ran at.
  const sinking = bars(40, 0)

  it("is closed out where a cash ladder is left holding", async () => {
    const coins = [coin("hyperliquid:mainnet:AAA", sinking)]

    const cash = await runBacktest(inputFor(coins, { params: params() }))
    const borrowed = await runBacktest(
      inputFor(coins, { params: params({ leverage: 2 }) })
    )

    const closedOut = (outcome: Awaited<ReturnType<typeof runBacktest>>) =>
      outcome.coins[0].fills.filter((fill) => fill.reason === "liquidated")

    expect(closedOut(cash)).toHaveLength(0)
    expect(closedOut(borrowed).length).toBeGreaterThan(0)
    // Which of the two ends with more money is deliberately not asserted. On a
    // price that never comes back, being closed out early is the KINDER
    // outcome — the loss is cut where the cash ladder rides it to the bottom.
    // The expensive case is the opposite one, a fall that recovers, and that
    // is a question for a real run over real coins rather than for a shape
    // written to make a point.
  })

  it("is left alone on a market that never said what it allows", async () => {
    // No limit means no maintenance margin, so no price at which the exchange
    // steps in. The engine must not invent one — that is not its call. A real
    // run never gets here: `replayMarketRules` fills the limit in first, from
    // Hyperliquid where the coin is listed and from a written-down assumption
    // where it is not, precisely so a borrowed replay cannot be un-closable.
    const coins = [
      {
        ...coin("hyperliquid:mainnet:AAA", sinking),
        rules: { ...rules, maxLeverage: null },
      },
    ]

    const outcome = await runBacktest(
      inputFor(coins, { params: params({ leverage: 2 }) })
    )

    expect(
      outcome.coins[0].fills.filter((fill) => fill.reason === "liquidated")
    ).toHaveLength(0)
  })
})

/**
 * Why a coin never got a ladder.
 *
 * The engine decides this on every bar of every coin and used to throw the
 * answer away, so a coin that did nothing was a blank row — and finding out
 * whether it was waiting for a base, already under one, or simply could not be
 * afforded meant reading the price history by hand against the settings.
 */
describe("a coin the run never armed", () => {
  it("records why, and how many bars it held", async () => {
    // Anchored to a base with no base to be found: `baseBars` is empty, so
    // every bar answers the same way.
    const outcome = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", bars(6, 6))], {
        params: params({ anchor: "base" }),
      })
    )

    const refusals = outcome.coins[0].armRefusals
    expect(refusals[0]?.reason).toBe("SMART_LADDER_NO_BASE")
    expect(refusals[0]?.bars).toBeGreaterThan(1)
    expect(outcome.coins[0].fills).toHaveLength(0)
  })

  it("says nothing about a coin that armed straight away", async () => {
    const outcome = await runBacktest(
      inputFor([coin("hyperliquid:mainnet:AAA", bars(10, 10))])
    )

    expect(outcome.coins[0].fills.length).toBeGreaterThan(0)
    expect(outcome.coins[0].armRefusals).toEqual([])
  })
})
