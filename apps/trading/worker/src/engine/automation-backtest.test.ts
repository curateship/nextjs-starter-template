import { describe, expect, it } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { HistoryCandle } from "@/server/backtest/history"

import { runBacktest } from "../backtest/runner"
import { resolveStrategy } from "../strategies/registry"

const config: AutomationConfig = {
  v: 2,
  kind: "automation",
  interval: "15m",
  protection: { long: { takeProfitPct: 5, stopLossPct: 2 } },
  rules: [
    {
      id: "buy",
      action: "buy",
      targetEquityPct: 25,
      condition: {
        kind: "trigger",
        nodeId: "breakout",
        indicator: { type: "breakout", params: { lookback: 3 } },
        side: "buy",
      },
    },
  ],
}

const STEP = 900_000
const candles: HistoryCandle[] = [
  { t: 0, T: STEP - 1, o: 9, h: 10, l: 8, c: 9, v: 1, n: 1 },
  { t: STEP, T: STEP * 2 - 1, o: 9, h: 11, l: 9, c: 10, v: 1, n: 1 },
  { t: STEP * 2, T: STEP * 3 - 1, o: 10, h: 12, l: 10, c: 11, v: 1, n: 1 },
  { t: STEP * 3, T: STEP * 4 - 1, o: 11, h: 14, l: 11, c: 13, v: 1, n: 1 },
  { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 14.5, l: 12.9, c: 14, v: 1, n: 1 },
]

function run(configToRun: AutomationConfig, history: HistoryCandle[]) {
  const strategy = resolveStrategy(configToRun)
  if (!strategy) throw new Error("Automation strategy did not resolve")
  return runBacktest({
    strategy,
    params: configToRun,
    candles: history,
    simStartMs: 0,
    startingEquity: 10_000,
    market: "TEST",
    interval: "15m",
    costs: DEFAULT_BACKTEST_COSTS,
  })
}

describe("Automation through the real backtest runner", () => {
  it("enters at the portfolio target and exits at the exact take-profit", () => {
    const result = run(config, candles)
    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    const exit = result.fills.find((fill) => fill.purpose === "auto:close")

    expect(entry).toBeDefined()
    expect(entry!.px * entry!.sz).toBeCloseTo(2_500, 6)
    expect(exit).toBeDefined()
    expect(exit!.px).toBeCloseTo(entry!.px * 1.05, 8)
    expect(result.stats.fees).toBeGreaterThan(0)
  })

  it("a trailing stop exits at the exact ratcheted level, above the fixed stop", () => {
    const trailingConfig: AutomationConfig = {
      ...config,
      protection: { long: { stopLossPct: 5, stopLossMode: "trailing" } },
    }
    // Entry near 13, bar 4 ratchets the high-water mark to 14.5, bar 5 pulls
    // back through 14.5 · 0.95 = 13.775 — the honest intrabar pause price.
    const history: HistoryCandle[] = [
      ...candles,
      {
        t: STEP * 5,
        T: STEP * 6 - 1,
        o: 14,
        h: 14.2,
        l: 13.2,
        c: 13.4,
        v: 1,
        n: 1,
      },
    ]
    const result = run(trailingConfig, history)
    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    const exit = result.fills.find((fill) => fill.purpose === "auto:close")

    expect(entry).toBeDefined()
    expect(exit).toBeDefined()
    expect(exit!.px).toBeCloseTo(14.5 * 0.95, 8)
    // The ratchet locked in profit far above the entry-based fixed stop.
    expect(exit!.px).toBeGreaterThan(entry!.px * 0.95)
  })

  it("an unmet activation threshold keeps the trailing stop at the fixed level", () => {
    const gatedConfig: AutomationConfig = {
      ...config,
      protection: {
        long: {
          stopLossPct: 5,
          stopLossMode: "trailing",
          trailActivationPct: 20,
        },
      },
    }
    // Same tape as above: the best move (~11.5% from entry) never reaches
    // +20%, so the stop stays at entry · 0.95 and the pullback cannot hit it.
    const history: HistoryCandle[] = [
      ...candles,
      {
        t: STEP * 5,
        T: STEP * 6 - 1,
        o: 14,
        h: 14.2,
        l: 13.2,
        c: 13.4,
        v: 1,
        n: 1,
      },
    ]
    const result = run(gatedConfig, history)
    expect(
      result.fills.find((fill) => fill.purpose === "auto:close")
    ).toBeUndefined()
  })

  it("a stop at the session open exits at that exact price, and its target follows", () => {
    // The Crypto London block runs 08:00–16:00 UTC, so a tape starting at
    // 08:00 opens the session at 9 — the price the stop must sit at.
    const OPEN = Date.parse("2026-07-06T08:00:00Z")
    const sessionConfig: AutomationConfig = {
      ...config,
      protection: {
        long: {
          // Deliberately far from the level: 50% of 13 is 6.5, so an exit at 9
          // can only have come from the session open, never the fallback.
          stopLossPct: 50,
          stopLossLevel: { kind: "sessionOpen", session: "utcLondon" },
          takeProfitRr: 1,
          takeProfitPct: 50,
        },
      },
    }
    const history: HistoryCandle[] = [
      ...candles.map((candle) => ({
        ...candle,
        t: OPEN + candle.t,
        T: OPEN + candle.T,
      })),
      {
        t: OPEN + STEP * 5,
        T: OPEN + STEP * 6 - 1,
        o: 13,
        h: 13,
        l: 8,
        c: 8.5,
        v: 1,
        n: 1,
      },
    ]
    const result = run(sessionConfig, history)
    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    const exit = result.fills.find((fill) => fill.purpose === "auto:close")
    expect(entry).toBeDefined()
    expect(exit).toBeDefined()
    expect(exit!.px).toBeCloseTo(9, 8)
    // 1:1 against a stop that turned out to be 4 wide puts the target at 17,
    // which this tape never reaches — so the stop is what fired.
    expect(exit!.px).toBeLessThan(entry!.px)
  })

  it("gates entries with a higher-timeframe filter, without lookahead", () => {
    const H1 = 3_600_000
    const htfConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        {
          id: "buy",
          action: "buy",
          targetEquityPct: 25,
          condition: {
            kind: "trigger",
            nodeId: "entry",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "buy",
            filters: [
              {
                nodeId: "gate",
                indicator: { type: "breakout", params: { lookback: 3 } },
                interval: "1h",
              },
            ],
          },
        },
      ],
    }
    // Strictly rising 15m closes: the entry breakout fires on every bar ≥ 3.
    const base: HistoryCandle[] = Array.from({ length: 40 }, (_, i) => ({
      t: i * STEP,
      T: (i + 1) * STEP - 1,
      o: 100 + i,
      h: 100 + i,
      l: 100 + i,
      c: 100 + i,
      v: 1,
      n: 1,
    }))
    // Flat 1h candles until candle 6 breaks out (opens 6h, closes 7h). The
    // series deliberately includes candles beyond the base window — the
    // runner must never surface one before its close.
    const htf: HistoryCandle[] = Array.from({ length: 10 }, (_, k) => {
      const value = k < 6 ? 50 : 60
      return {
        t: k * H1,
        T: (k + 1) * H1 - 1,
        o: value,
        h: value,
        l: value,
        c: value,
        v: 1,
        n: 1,
      }
    })

    const strategy = resolveStrategy(htfConfig)
    if (!strategy) throw new Error("Automation strategy did not resolve")
    const result = runBacktest({
      strategy,
      params: htfConfig,
      candles: base,
      simStartMs: 0,
      startingEquity: 10_000,
      market: "TEST",
      interval: "15m",
      costs: DEFAULT_BACKTEST_COSTS,
      htfCandles: { interval: "1h", candles: htf },
    })

    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    expect(entry).toBeDefined()
    // The 1h breakout closes at 7h; the first gated base bar OPENS at 7h
    // (bar 28) and fills at that bar's close price, 128 — one bar earlier
    // would mean the engine saw the 1h candle before it closed.
    expect(entry!.px).toBe(128)
  })

  it("live candle path gates on the same bar as the backtest (HTF parity)", () => {
    const H1 = 3_600_000
    const htfConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        {
          id: "buy",
          action: "buy",
          targetEquityPct: 25,
          condition: {
            kind: "trigger",
            nodeId: "entry",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "buy",
            filters: [
              {
                nodeId: "gate",
                indicator: { type: "breakout", params: { lookback: 3 } },
                interval: "1h",
              },
            ],
          },
        },
      ],
    }
    const strategy = resolveStrategy(htfConfig)
    if (!strategy?.onCandleClose) throw new Error("Strategy did not resolve")
    expect(strategy.warmup(htfConfig as never).candleIntervals).toEqual([
      "15m",
      "1h",
    ])

    const baseWs = Array.from({ length: 40 }, (_, i) => ({
      t: i * STEP,
      T: (i + 1) * STEP - 1,
      s: "TEST",
      i: "15m",
      o: String(100 + i),
      h: String(100 + i),
      l: String(100 + i),
      c: String(100 + i),
      v: "1",
      n: 1,
    }))
    const htfWs = Array.from({ length: 10 }, (_, k) => {
      const value = String(k < 6 ? 50 : 60)
      return {
        t: k * H1,
        T: (k + 1) * H1 - 1,
        s: "TEST",
        i: "1h",
        o: value,
        h: value,
        l: value,
        c: value,
        v: "1",
        n: 1,
      }
    })

    // Drive the LIVE candle-close path bar by bar, the hub serving whatever
    // exists at each moment (the strategy clips to closed candles itself).
    let state = strategy.init(htfConfig as never)
    const actionBars: number[] = []
    for (let barIndex = 3; barIndex < 40; barIndex += 1) {
      const now = (barIndex + 1) * STEP - 1
      const ctx = {
        market: "TEST",
        mid: String(100 + barIndex),
        candles: (interval: string, n: number) => {
          const source = interval === "1h" ? htfWs : baseWs
          const visible = source.filter((candle) => candle.t <= now)
          return visible.slice(Math.max(0, visible.length - n), visible.length)
        },
        position: null,
        equity: "10000",
        startingEquity: "10000",
        get state() {
          return state
        },
        setState: (next: typeof state) => {
          state = next
        },
        emit: () => {},
        now,
      }
      strategy.onCandleClose(ctx as never, htfConfig as never, undefined as never)
      if ((state as { pendingAction: unknown }).pendingAction) {
        actionBars.push(barIndex)
        break
      }
    }
    // Same bar the backtest entered on: the first 15m candle opening at the
    // 1h close (bar 28). Live and simulated evaluation agree exactly.
    expect(actionBars).toEqual([28])
  })

  it("live tick path exits a trailing stop at the same price as the backtest", () => {
    const trailingConfig: AutomationConfig = {
      ...config,
      protection: { long: { stopLossPct: 5, stopLossMode: "trailing" } },
    }
    const strategy = resolveStrategy(trailingConfig)
    if (!strategy?.onTick) throw new Error("Automation strategy did not resolve")

    let state = strategy.init()
    const exits: number[] = []
    let mid = "13"
    const ctx = {
      market: "TEST",
      get mid() {
        return mid
      },
      candles: () => [],
      position: { szi: "1", entryPx: "13" },
      equity: "10000",
      startingEquity: "10000",
      get state() {
        return state
      },
      setState: (next: typeof state) => {
        state = next
      },
      emit: (type: string) => {
        if (type === "exit") exits.push(Number(mid))
      },
      now: 0,
    }

    // The same price path the backtest's intrabar walk visits for bars 4–5:
    // open, low, high, close, next open, then the ratcheted stop level.
    for (const px of [13, 12.9, 14.5, 14, 14, 14.5 * 0.95]) {
      mid = String(px)
      strategy.onTick(ctx as never, undefined as never)
    }
    expect(exits).toEqual([14.5 * 0.95])
  })

  it("exits at the exact stop-loss trigger", () => {
    const stopHistory = [
      ...candles.slice(0, 4),
      {
        t: STEP * 4,
        T: STEP * 5 - 1,
        o: 13,
        h: 13.1,
        l: 12,
        c: 12.5,
        v: 1,
        n: 1,
      },
    ]
    const result = run(config, stopHistory)
    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    const exit = result.fills.find((fill) => fill.purpose === "auto:close")

    expect(entry).toBeDefined()
    expect(exit).toBeDefined()
    expect(exit!.px).toBeCloseTo(entry!.px * 0.98, 8)
  })

  it("flips from its long target into a larger short target", () => {
    const flipConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "short",
          action: "short",
          targetEquityPct: 40,
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "sell",
          },
        },
      ],
    }
    const history = [
      ...candles.slice(0, 4),
      { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 13.5, l: 7, c: 8, v: 1, n: 1 },
    ]
    const result = run(flipConfig, history)

    expect(result.fills.map((fill) => fill.purpose)).toEqual([
      "auto:target-entry",
      "auto:flip-close",
      "auto:target-entry",
    ])
    expect(result.openPosition?.side).toBe("short")
    expect(
      Math.abs(result.openPosition!.szi * result.openPosition!.entryPx)
    ).toBeCloseTo((10_000 + result.stats.netPnl) * 0.4, -1)
  })

  it("reverses a long into a short in one step when a Reverse rule matches", () => {
    const reverseConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "reverse",
          action: "reverse",
          targetEquityPct: 40,
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "sell",
          },
        },
      ],
    }
    const history = [
      ...candles.slice(0, 4),
      { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 13.5, l: 7, c: 8, v: 1, n: 1 },
    ]
    const result = run(reverseConfig, history)

    expect(result.fills.map((fill) => fill.purpose)).toEqual([
      "auto:target-entry",
      "auto:flip-close",
      "auto:target-entry",
    ])
    expect(result.openPosition?.side).toBe("short")
    expect(
      Math.abs(result.openPosition!.szi * result.openPosition!.entryPx)
    ).toBeCloseTo((10_000 + result.stats.netPnl) * 0.4, -1)
  })

  it("does not reverse when flat — the first entry still needs its own signal", () => {
    const reverseOnlyConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        {
          id: "reverse",
          action: "reverse",
          targetEquityPct: 40,
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "buy",
          },
        },
      ],
    }
    // Breakout buys fire on the rising candles, but with no open position a
    // Reverse has nothing to flip, so no orders are ever placed.
    expect(run(reverseOnlyConfig, candles).fills).toEqual([])
  })

  it("closes a position when a Close rule matches", () => {
    const closeConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "close",
          action: "close",
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "sell",
          },
        },
      ],
    }
    const history = [
      ...candles.slice(0, 4),
      { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 13.5, l: 7, c: 8, v: 1, n: 1 },
    ]
    const result = run(closeConfig, history)

    expect(result.fills.at(-1)?.purpose).toBe("auto:close")
    expect(result.openPosition).toBeNull()
  })

  it("rebalances a repeated signal instead of stacking another target entry", () => {
    const rebalanceConfig = { ...config, protection: {} }
    const history = [
      ...candles.slice(0, 4),
      {
        t: STEP * 4,
        T: STEP * 5 - 1,
        o: 13,
        h: 16,
        l: 12.9,
        c: 15,
        v: 1,
        n: 1,
      },
    ]
    const result = run(rebalanceConfig, history)

    expect(
      result.fills.filter((fill) => fill.purpose === "auto:target-entry")
    ).toHaveLength(1)
    expect(
      result.fills.some((fill) => fill.purpose === "auto:target-reduce")
    ).toBe(true)
  })

  it("places no order when Buy and Short conflict on one candle", () => {
    const conflictConfig: AutomationConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "short",
          action: "short",
          targetEquityPct: 40,
          condition: { ...config.rules[0].condition },
        },
      ],
    }

    expect(run(conflictConfig, candles.slice(0, 4)).fills).toEqual([])
  })
})
