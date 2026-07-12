import { describe, expect, it } from "vitest"

import type { AutomationStrategyConfig } from "@/lib/automations/automation"
import type { StrategyCtx } from "../strategies/contract"
import {
  automationTargetOrders,
  createAutomationStrategy,
  type AutomationState,
} from "./automation-strategy"

describe("automationTargetOrders", () => {
  it("opens a flat position to the requested equity percentage", () => {
    expect(
      automationTargetOrders({
        mid: 100,
        equity: 10_000,
        positionSzi: 0,
        action: { action: "buy", targetEquityPct: 25 },
      })
    ).toEqual([
      expect.objectContaining({
        purpose: "auto:target-entry",
        side: "buy",
        sz: "25",
        reduceOnly: false,
      }),
    ])
  })

  it("adds only the missing size to a smaller same-side position", () => {
    const orders = automationTargetOrders({
      mid: 100,
      equity: 10_000,
      positionSzi: 10,
      action: { action: "buy", targetEquityPct: 25 },
    })

    expect(orders).toEqual([
      expect.objectContaining({ side: "buy", sz: "15", reduceOnly: false }),
    ])
  })

  it("reduces an oversized same-side position to the target", () => {
    const orders = automationTargetOrders({
      mid: 100,
      equity: 10_000,
      positionSzi: 30,
      action: { action: "buy", targetEquityPct: 25 },
    })

    expect(orders).toEqual([
      expect.objectContaining({ side: "sell", sz: "5", reduceOnly: true }),
    ])
  })

  it("does nothing when the current position already matches the target", () => {
    expect(
      automationTargetOrders({
        mid: 100,
        equity: 10_000,
        positionSzi: 25,
        action: { action: "buy", targetEquityPct: 25 },
      })
    ).toEqual([])
  })

  it("closes the opposite position before opening the requested target", () => {
    const orders = automationTargetOrders({
      mid: 100,
      equity: 10_000,
      positionSzi: -10,
      action: { action: "buy", targetEquityPct: 25 },
    })

    expect(orders).toEqual([
      expect.objectContaining({
        purpose: "auto:flip-close",
        side: "buy",
        sz: "10",
        reduceOnly: true,
      }),
      expect.objectContaining({
        purpose: "auto:target-entry",
        side: "buy",
        sz: "25",
        reduceOnly: false,
      }),
    ])
  })

  it("closes the full position with a reduce-only order", () => {
    expect(
      automationTargetOrders({
        mid: 100,
        equity: 10_000,
        positionSzi: 12,
        action: { action: "close" },
      })
    ).toEqual([
      expect.objectContaining({
        purpose: "auto:close",
        side: "sell",
        sz: "12",
        reduceOnly: true,
      }),
    ])
  })

  it("reverses a long into a short in one step", () => {
    expect(
      automationTargetOrders({
        mid: 100,
        equity: 10_000,
        positionSzi: 10,
        action: { action: "reverse", targetEquityPct: 25 },
      })
    ).toEqual([
      expect.objectContaining({
        purpose: "auto:flip-close",
        side: "sell",
        sz: "10",
        reduceOnly: true,
      }),
      expect.objectContaining({
        purpose: "auto:target-entry",
        side: "sell",
        sz: "25",
        reduceOnly: false,
      }),
    ])
  })

  it("reverses a short into a long in one step", () => {
    expect(
      automationTargetOrders({
        mid: 100,
        equity: 10_000,
        positionSzi: -10,
        action: { action: "reverse", targetEquityPct: 25 },
      })
    ).toEqual([
      expect.objectContaining({
        purpose: "auto:flip-close",
        side: "buy",
        sz: "10",
        reduceOnly: true,
      }),
      expect.objectContaining({
        purpose: "auto:target-entry",
        side: "buy",
        sz: "25",
        reduceOnly: false,
      }),
    ])
  })

  it("does nothing when reversing with no open position", () => {
    expect(
      automationTargetOrders({
        mid: 100,
        equity: 10_000,
        positionSzi: 0,
        action: { action: "reverse", targetEquityPct: 25 },
      })
    ).toEqual([])
  })
})

describe("createAutomationStrategy", () => {
  const config: AutomationStrategyConfig = {
    v: 2,
    kind: "automation",
    interval: "15m",
    protection: { takeProfitPct: 5, stopLossPct: 2 },
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

  const candles = [
    { t: 0, T: 0, o: "9", h: "10", l: "8", c: "9", v: "1", i: "15m" },
    { t: 1, T: 1, o: "9", h: "11", l: "9", c: "10", v: "1", i: "15m" },
    { t: 2, T: 2, o: "10", h: "12", l: "10", c: "11", v: "1", i: "15m" },
    { t: 3, T: 3, o: "11", h: "14", l: "11", c: "13", v: "1", i: "15m" },
  ]

  function context(position: { szi: string; entryPx: string } | null = null) {
    let state: AutomationState = {
      pendingAction: null,
      exitRequested: false,
      lastEvaluatedCandleTime: null,
    }
    const events: string[] = []
    const ctx: StrategyCtx<AutomationState> = {
      market: "TEST",
      mid: "13",
      candles: () => candles as never,
      position,
      equity: "10000",
      startingEquity: "10000",
      get state() {
        return state
      },
      setState: (next) => {
        state = next
      },
      emit: (type) => events.push(type),
      now: 4,
    }
    return { ctx, events, state: () => state }
  }

  it("turns the last candle action into one percentage-target order", () => {
    const strategy = createAutomationStrategy(config)
    const { ctx, events, state } = context()

    strategy.onCandleClose?.(ctx, undefined as never, candles[3] as never)
    expect(state().pendingAction).toEqual({
      action: "buy",
      targetEquityPct: 25,
    })
    expect(events).toContain("automation_action")
    expect(strategy.desiredOrders(ctx, undefined as never)[0]).toEqual(
      expect.objectContaining({ side: "buy", reduceOnly: false })
    )
    expect(state().pendingAction).toBeNull()

    strategy.onCandleClose?.(ctx, undefined as never, candles[3] as never)
    expect(state().pendingAction).toBeNull()
    expect(
      events.filter((event) => event === "automation_action")
    ).toHaveLength(1)
  })

  it("uses shared take-profit and stop-loss levels", () => {
    const strategy = createAutomationStrategy(config)
    const { ctx } = context({ szi: "1", entryPx: "100" })
    expect(strategy.exitTriggers?.(ctx, undefined as never)).toEqual([105, 98])
  })
})
