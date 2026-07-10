import { describe, expect, it } from "vitest"

import type { StrategySettings } from "@/lib/strategies/settings"
import {
  INITIAL_TRADE_STATE,
  applySignal,
  exitLevels,
  tickExit,
} from "./trade-manager"

const settings = (overrides: Partial<StrategySettings> = {}): StrategySettings => ({
  direction: "both",
  orderSizeUsd: 100,
  compounding: false,
  flipOnOppositeSignal: true,
  ...overrides,
})

describe("applySignal", () => {
  it("enters from flat in an allowed direction", () => {
    expect(applySignal(INITIAL_TRADE_STATE, settings(), 0, "buy").pendingEntry).toBe("long")
    expect(applySignal(INITIAL_TRADE_STATE, settings(), 0, "sell").pendingEntry).toBe("short")
  })

  it("direction filter blocks disallowed entries from flat", () => {
    expect(applySignal(INITIAL_TRADE_STATE, settings({ direction: "long" }), 0, "sell")).toBe(
      INITIAL_TRADE_STATE
    )
    expect(applySignal(INITIAL_TRADE_STATE, settings({ direction: "short" }), 0, "buy")).toBe(
      INITIAL_TRADE_STATE
    )
  })

  it("ignores same-direction signals while positioned", () => {
    expect(applySignal(INITIAL_TRADE_STATE, settings(), 2, "buy")).toBe(INITIAL_TRADE_STATE)
    expect(applySignal(INITIAL_TRADE_STATE, settings(), -2, "sell")).toBe(INITIAL_TRADE_STATE)
  })

  it("flips on an opposite signal when flip is on", () => {
    const next = applySignal(INITIAL_TRADE_STATE, settings(), 2, "sell")
    expect(next.pendingEntry).toBe("short")
  })

  it("exit-only when flipping into a disallowed direction", () => {
    const next = applySignal(INITIAL_TRADE_STATE, settings({ direction: "long" }), 2, "sell")
    expect(next.pendingEntry).toBeNull()
    expect(next.exitRequested).toBe(true)
  })

  it("ignores opposite signals entirely when flip is off", () => {
    expect(
      applySignal(INITIAL_TRADE_STATE, settings({ flipOnOppositeSignal: false }), 2, "sell")
    ).toBe(INITIAL_TRADE_STATE)
  })
})

describe("exitLevels / tickExit — the one TP/SL implementation", () => {
  const position = (szi: number, entryPx = 100) => ({ szi, entryPx })

  it("computes long TP above and SL below entry (mirrored for shorts)", () => {
    const s = settings({ takeProfitPct: 5, stopLossPct: 2 })
    expect(exitLevels(s, position(1), INITIAL_TRADE_STATE)).toEqual([105, 98])
    expect(exitLevels(s, position(-1), INITIAL_TRADE_STATE)).toEqual([95, 102])
  })

  it("matches the legacy vwap/qqe exitTriggers formula exactly", () => {
    // Legacy: entry * (1 ± sign*pct/100) — worker vwap.ts exitTriggers.
    const s = settings({ takeProfitPct: 3.3, stopLossPct: 1.7 })
    const entry = 77.55
    const sign = 1
    expect(exitLevels(s, position(2, entry), INITIAL_TRADE_STATE)).toEqual([
      entry * (1 + (sign * 3.3) / 100),
      entry * (1 - (sign * 1.7) / 100),
    ])
  })

  it("returns nothing while flat, exit-requested, or without TP/SL", () => {
    const s = settings({ takeProfitPct: 5 })
    expect(exitLevels(s, null, INITIAL_TRADE_STATE)).toEqual([])
    expect(exitLevels(s, position(0), INITIAL_TRADE_STATE)).toEqual([])
    expect(
      exitLevels(s, position(1), { ...INITIAL_TRADE_STATE, exitRequested: true })
    ).toEqual([])
    expect(exitLevels(settings(), position(1), INITIAL_TRADE_STATE)).toEqual([])
  })

  it("tickExit fires tp/sl at and beyond the exact levels, both sides", () => {
    const s = settings({ takeProfitPct: 5, stopLossPct: 2 })
    expect(tickExit(s, position(1), INITIAL_TRADE_STATE, 105)).toBe("tp")
    expect(tickExit(s, position(1), INITIAL_TRADE_STATE, 104.99)).toBeNull()
    expect(tickExit(s, position(1), INITIAL_TRADE_STATE, 98)).toBe("sl")
    expect(tickExit(s, position(-1), INITIAL_TRADE_STATE, 95)).toBe("tp")
    expect(tickExit(s, position(-1), INITIAL_TRADE_STATE, 102)).toBe("sl")
    expect(tickExit(s, position(-1), INITIAL_TRADE_STATE, 100)).toBeNull()
  })
})
