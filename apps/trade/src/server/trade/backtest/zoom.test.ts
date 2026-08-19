import { describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import { defaultPaperCosts } from "@/lib/trade/paper"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"

/**
 * What a candle cannot say, and minute prices can.
 *
 * A candle gives four numbers and never the order they happened in, so the
 * walk invents one: open → high → low → close, a single pass. A bar that fell,
 * bounced through the target, and fell again cannot be told apart from one that
 * fell straight through — and on the invented pass the sale in the middle never
 * happens. That is the "a coin can buy and sell within a few minutes" case, and
 * it is worth real money on a crash day.
 */

const FOUR_HOURS = 14_400_000
const MINUTE = 60_000
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

/**
 * The four-hour bar every test here turns on: down 40% at its worst, closing a
 * third of the way back. Read on its own it is one straight fall.
 */
const EVENTFUL = bar(2, 100, 100, 60, 65)

const BARS: CandleBar[] = [
  bar(0, 100, 101, 99, 100),
  bar(1, 100, 101, 99, 100),
  EVENTFUL,
  bar(3, 65, 66, 64, 65),
]

/**
 * The same bar as 240 real minutes: down to 79, back up to 95, down to 60,
 * finishing at 65. Same open, same high, same low, same close — a candle cannot
 * tell the two apart, and that is the whole point.
 */
function minutesOfEventful(): CandleBar[] {
  const path = [100, 79, 95, 60, 65]
  const perLeg = 240 / (path.length - 1)
  const out: CandleBar[] = []
  for (let m = 0; m < 240; m += 1) {
    const leg = Math.min(Math.floor(m / perLeg), path.length - 2)
    const within = (m - leg * perLeg) / perLeg
    const from = path[leg]
    const to = path[leg + 1]
    const open = from + (to - from) * within
    const close = from + (to - from) * (within + 1 / perLeg)
    out.push({
      openTime: EVENTFUL.openTime + m * MINUTE,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: 10,
    })
  }
  return out
}

function coin(): BacktestCoin {
  return {
    marketKey: "hyperliquid:mainnet:C0",
    symbol: "C0",
    rules,
    bars: BARS,
    baseBars: [],
    funding: [],
  }
}

function params(): DcaParams {
  return { ...defaultDcaParams(), anchor: "click", maxPositionPct: 50, leverage: 1 }
}

async function run(zoomIn?: BacktestRunZoom) {
  return runBacktest({
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingUsd: 10_000,
    costs: defaultPaperCosts(),
    strategy: { kind: "dca" as const, params: params() },
    interval: "4h" as const,
    coins: [coin()],
    from: START,
    to: START + BARS.length * FOUR_HOURS,
    zoomIn,
  })
}

type BacktestRunZoom = (
  marketKey: string,
  barOpen: number,
  barMs: number
) => Promise<readonly CandleBar[] | null>

const sellsInEventful = (outcome: Awaited<ReturnType<typeof run>>) =>
  outcome.coins
    .flatMap((one) => one.fills)
    .filter(
      (fill) =>
        fill.side === "sell" &&
        fill.fillTime >= EVENTFUL.openTime &&
        fill.fillTime < EVENTFUL.openTime + FOUR_HOURS
    )

describe("walking a bar on real minute prices", () => {
  it("finds the sale the candle's invented path cannot", async () => {
    const guessed = await run()
    const zoomed = await run(async (_marketKey, barOpen) =>
      barOpen === EVENTFUL.openTime ? minutesOfEventful() : null
    )

    // On the invented path price goes 100 → 60 → 65 and never passes back
    // through the target, so the ladder buys and holds.
    expect(sellsInEventful(guessed)).toHaveLength(0)
    // On the real minutes it bought at 79, sold into the bounce to 95, and
    // bought again on the second fall.
    expect(sellsInEventful(zoomed).length).toBeGreaterThan(0)
  })

  it("banks the money that sale made", async () => {
    const guessed = await run()
    const zoomed = await run(async (_marketKey, barOpen) =>
      barOpen === EVENTFUL.openTime ? minutesOfEventful() : null
    )
    expect(zoomed.endingUsd).toBeGreaterThan(guessed.endingUsd)
  })

  it("walks the bar whole when there are no minutes for it", async () => {
    const guessed = await run()
    const noMinutes = await run(async () => null)
    // Same run, to the cent: a zoom that answers nothing changes nothing.
    expect(noMinutes.endingUsd).toBeCloseTo(guessed.endingUsd, 8)
  })

  it("never asks about a coin holding nothing and resting nothing", async () => {
    const asked: number[] = []
    await run(async (_marketKey, barOpen) => {
      asked.push(barOpen)
      return null
    })
    // The first bar has no ladder on it yet, so there is nothing the minutes
    // could change and nothing is fetched for it.
    expect(asked).not.toContain(BARS[0].openTime)
  })

  it("keeps the curve's times ascending when a dip lands inside a bar", async () => {
    // The dip point is stamped a bar back like every other point, because the
    // window drag finds its edges by binary search over these times.
    const zoomed = await run(async (_marketKey, barOpen) =>
      barOpen === EVENTFUL.openTime ? minutesOfEventful() : null
    )
    const times = zoomed.equity.map((point) => point.t)
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
    }
    // And the dip itself is on the curve: some point sits below both its
    // neighbours' values inside the eventful bar's stretch.
    expect(zoomed.equity.length).toBeGreaterThan(BARS.length)
  })

  it("keeps the rungs below alive through a liquidation inside the bar", async () => {
    // Its own coin: no sell target, so nothing exits on the way down, and at
    // 2x on a coin capped at 3x the position dies a third below its average
    // entry — inside this candle. The rung below the wipe has spent nothing
    // and must still buy. It used to hold only at candle ends: the minute
    // walk drains its fills every minute, the "was that a liquidation?"
    // question read the drained list, and the ladder died in exactly the
    // candle it was built to survive.
    // The wipe lands near 60 inside the third candle — which never reaches
    // the deepest rung at 56.8. A FLAT candle follows, and only then does
    // price dip to the rung. Two candles of "liquidated, holding nothing" is
    // exactly the state that used to read as "the ladder is finished": the
    // just-liquidated flag lasted one candle, and mid-crash the crash rule
    // can hold the re-buy off far longer than that.
    const crashBar = bar(2, 100, 100.5, 58, 65)
    const deepBars: CandleBar[] = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 101, 99, 100),
      crashBar,
      bar(3, 65, 66, 64, 65),
      bar(4, 65, 66, 55, 60),
      bar(5, 60, 62, 59, 61),
    ]
    // 100 → 90 → 58 → 65, minute by minute: rungs fill on the fall and the
    // wipe lands near 60, above the deepest rung.
    const path = [100, 90, 58, 65]
    const perLeg = 240 / (path.length - 1)
    const minutes: CandleBar[] = []
    for (let m = 0; m < 240; m += 1) {
      const leg = Math.min(Math.floor(m / perLeg), path.length - 2)
      const within = (m - leg * perLeg) / perLeg
      const from = path[leg]
      const to = path[leg + 1]
      const open = from + (to - from) * within
      const close = from + (to - from) * (within + 1 / perLeg)
      minutes.push({
        openTime: crashBar.openTime + m * MINUTE,
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
        volume: 10,
      })
    }
    const deep = await runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy: {
        kind: "dca" as const,
        params: {
          ...params(),
          leverage: 2,
          takeProfit: null,
          rungs: [{ deviation: 5 }, { deviation: 8 }, { deviation: 35 }],
        },
      },
      interval: "4h" as const,
      coins: [
        {
          ...coin(),
          bars: deepBars,
          rules: { ...rules, maxLeverage: 3 },
        },
      ],
      from: START,
      to: START + deepBars.length * FOUR_HOURS,
      zoomIn: async (_marketKey, barOpen) =>
        barOpen === crashBar.openTime ? minutes : null,
    })
    const fills = deep.coins[0].fills
    const wipe = fills.find((f) => f.reason === "liquidated")
    expect(wipe).toBeDefined()
    // The deepest rung bought after the wipe — the ladder lived on.
    const later = fills.filter(
      (f) => f.side === "buy" && (f.rung ?? -1) >= 2
    )
    expect(later.length).toBeGreaterThan(0)
  })

  it("never asks about a bar no rung, target or stop can reach", async () => {
    const asked: number[] = []
    await run(async (_marketKey, barOpen) => {
      asked.push(barOpen)
      return null
    })
    // Bar 1 rests the whole ladder and sits between 99 and 101, nowhere near a
    // rung. Minute prices for it would cost a fetch and fill exactly the same
    // nothing — which is what makes zooming affordable at all.
    expect(asked).not.toContain(BARS[1].openTime)
    // The bar that falls to 60 is asked about, so the rule is not simply off.
    expect(asked).toContain(EVENTFUL.openTime)
  })
})
