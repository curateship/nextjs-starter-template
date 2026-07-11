import { describe, expect, it } from "vitest"

import type { SignalStrategyConfig } from "@/lib/strategies/strategy-config"
import type { StrategyCtx } from "../strategies/contract"
import { createSignalStrategy } from "./signal-strategy"
import type { TradeState } from "./trade-manager"

/**
 * The engine over a synthetic EMA cross: candles rise steadily (fast > slow),
 * then fall. Signals must translate into pending entries, orders, and
 * exitTriggers exactly as the trade manager dictates.
 */

const config = (
  overrides?: Partial<SignalStrategyConfig["settings"]>
): SignalStrategyConfig => ({
  v: 2,
  kind: "signal",
  interval: "15m",
  indicator: { type: "ema_cross", params: { fast: 3, slow: 5 } },
  settings: {
    direction: "both",
    orderSizeUsd: 100,
    compounding: false,
    takeProfitPct: 5,
    stopLossPct: 2,
    flipOnOppositeSignal: true,
    ...overrides,
  },
})

type WsCandle = { t: number; T: number; o: string; h: string; l: string; c: string; v: string; i: string }

/** Down-leg then up-leg so the fast EMA crosses above the slow near the turn. */
function crossingCandles(n = 40): WsCandle[] {
  const out: WsCandle[] = []
  const start = Date.parse("2026-01-01T00:00:00Z")
  for (let i = 0; i < n; i += 1) {
    const price = i < n / 2 ? 100 - i : 100 - n / 2 + (i - n / 2) * 2
    out.push({
      t: start + i * 900_000,
      T: start + i * 900_000 + 899_999,
      o: String(price),
      h: String(price + 0.5),
      l: String(price - 0.5),
      c: String(price),
      v: "1000",
      i: "15m",
    })
  }
  return out
}

function makeCtx(
  candles: WsCandle[],
  position: { szi: string; entryPx: string } | null
): { ctx: StrategyCtx<TradeState>; events: string[]; state: () => TradeState } {
  let state: TradeState = { pendingEntry: null, exitRequested: false }
  const events: string[] = []
  const last = candles[candles.length - 1]
  const ctx: StrategyCtx<TradeState> = {
    market: "TEST",
    mid: last.c,
    candles: (_interval, n) => candles.slice(-n) as never,
    position,
    equity: "1000",
    startingEquity: "1000",
    get state() {
      return state
    },
    setState: (next) => {
      state = next
    },
    emit: (type) => events.push(type),
    now: last.T + 1,
  }
  return { ctx, events, state: () => state }
}

describe("createSignalStrategy", () => {
  it("turns the indicator's last-bar signal into a pending entry and an order", () => {
    const strategy = createSignalStrategy(config())
    const candles = crossingCandles()
    // Find the bar where the cross lands: feed prefixes until a signal fires.
    let entered = false
    for (let end = 10; end <= candles.length; end += 1) {
      const window = candles.slice(0, end)
      const { ctx, state } = makeCtx(window, null)
      strategy.onCandleClose?.(ctx, undefined as never, window[window.length - 1] as never)
      if (state().pendingEntry === "long") {
        const orders = strategy.desiredOrders(ctx, undefined as never)
        expect(orders).toHaveLength(1)
        expect(orders[0].purpose).toBe("sig:entry")
        expect(orders[0].side).toBe("buy")
        expect(orders[0].reduceOnly).toBe(false)
        entered = true
        break
      }
    }
    expect(entered).toBe(true)
  })

  it("exitTriggers come from the shared trade manager", () => {
    const strategy = createSignalStrategy(config())
    const { ctx } = makeCtx(crossingCandles(), { szi: "1", entryPx: "100" })
    expect(strategy.exitTriggers?.(ctx, undefined as never)).toEqual([105, 98])
  })

  it("onTick requests an exit at the stop and desiredOrders emits reduce-only", () => {
    const strategy = createSignalStrategy(config())
    const candles = crossingCandles()
    candles[candles.length - 1] = { ...candles[candles.length - 1], c: "97" }
    const { ctx, state, events } = makeCtx(candles, { szi: "1", entryPx: "100" })
    strategy.onTick?.(ctx, undefined as never)
    expect(state().exitRequested).toBe(true)
    expect(events).toContain("exit")
    const orders = strategy.desiredOrders(ctx, undefined as never)
    expect(orders).toHaveLength(1)
    expect(orders[0].purpose).toBe("sig:exit")
    expect(orders[0].reduceOnly).toBe(true)
  })

  it("onFill resets state once flat", () => {
    const strategy = createSignalStrategy(config())
    const { ctx, state } = makeCtx(crossingCandles(), null)
    ctx.setState({ pendingEntry: null, exitRequested: true })
    strategy.onFill?.(ctx, undefined as never, {} as never)
    expect(state()).toEqual({ pendingEntry: null, exitRequested: false })
  })

  it("direction filter blocks disallowed entries end-to-end", () => {
    const strategy = createSignalStrategy(config({ direction: "short" }))
    const candles = crossingCandles()
    for (let end = 10; end <= candles.length; end += 1) {
      const window = candles.slice(0, end)
      const { ctx, state } = makeCtx(window, null)
      strategy.onCandleClose?.(ctx, undefined as never, window[window.length - 1] as never)
      // The up-cross is a buy — direction "short" must never enter long.
      expect(state().pendingEntry).not.toBe("long")
    }
  })
})
