import { describe, expect, it } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
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
  const config: AutomationConfig = {
    v: 2,
    kind: "automation",
    interval: "15m",
    protection: {
      long: { takeProfitPct: 5, stopLossPct: 2 },
      short: { takeProfitPct: 4, stopLossPct: 3 },
    },
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

  it("uses the long side's levels for a long position", () => {
    const strategy = createAutomationStrategy(config)
    const { ctx } = context({ szi: "1", entryPx: "100" })
    // +5% TP = 105, -2% SL = 98.
    expect(strategy.exitTriggers?.(ctx, undefined as never)).toEqual([105, 98])
  })

  it("uses the short side's (different) levels for a short position", () => {
    const strategy = createAutomationStrategy(config)
    const { ctx } = context({ szi: "-1", entryPx: "100" })
    // Short 4% TP = 96, 3% SL = 103 — distinct from the long side.
    expect(strategy.exitTriggers?.(ctx, undefined as never)).toEqual([96, 103])
  })

  const wallConfig: AutomationConfig = {
    v: 2,
    kind: "automation",
    interval: "15m",
    protection: {},
    rules: [
      {
        id: "long",
        action: "buy",
        targetEquityPct: 10,
        condition: {
          kind: "liveWall",
          nodeId: "wall",
          side: "bid",
          minUsd: 500_000,
          relativeSize: 5,
          maxDistancePct: 0.5,
          confirmationMs: 2_000,
        },
      },
      {
        id: "short",
        action: "short",
        targetEquityPct: 10,
        condition: {
          kind: "liveWall",
          nodeId: "wall",
          side: "ask",
          minUsd: 500_000,
          relativeSize: 5,
          maxDistancePct: 0.5,
          confirmationMs: 2_000,
        },
      },
    ],
  }

  function book(options: { bidIndex?: number; askIndex?: number } = {}) {
    const bids = Array.from({ length: 5 }, (_, index) => ({
      px: String(99.9 - index * 0.1),
      sz: String(index === options.bidIndex ? 6_000 : 100),
      n: 1,
    }))
    const asks = Array.from({ length: 5 }, (_, index) => ({
      px: String(100.1 + index * 0.1),
      sz: String(index === options.askIndex ? 6_000 : 100),
      n: 1,
    }))
    return { coin: "TEST", time: 0, levels: [bids, asks] } as never
  }

  function wallContext() {
    const strategy = createAutomationStrategy(wallConfig)
    let state = strategy.init(undefined as never)
    let currentPosition: { szi: string; entryPx: string } | null = null
    const events: string[] = []
    const ctx: StrategyCtx<AutomationState> = {
      market: "TEST",
      mid: "100",
      candles: () => [],
      get position() {
        return currentPosition
      },
      equity: "10000",
      startingEquity: "10000",
      get state() {
        return state
      },
      setState: (next) => {
        state = next
      },
      emit: (type) => events.push(type),
      now: 0,
    }
    return {
      strategy,
      ctx,
      events,
      state: () => state,
      setPosition: (position: typeof currentPosition) => {
        currentPosition = position
      },
    }
  }

  it("confirms one exact wall for two seconds before resting post-only", () => {
    const { strategy, ctx, state } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([])

    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    expect(state().wall?.active?.wall.px).toBeCloseTo(99.8)
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([
      expect.objectContaining({
        purpose: "auto:wall-entry",
        side: "buy",
        px: "99.801",
        tif: "Alo",
      }),
    ])
  })

  it("keeps the broker-rounded entry size after the order starts resting", () => {
    const { strategy, ctx } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    const entry = strategy.desiredOrders(ctx, undefined as never)[0]
    strategy.onOrderPlaced?.(
      ctx,
      undefined as never,
      { ...entry, sz: "10.01" },
      "resting",
      "6.01"
    )

    expect(strategy.desiredOrders(ctx, undefined as never)[0]).toEqual(
      expect.objectContaining({ sz: "6.01", sizeIsRemaining: true })
    )
  })

  it("places no entry while both sides have qualifying walls", () => {
    const { strategy, ctx } = wallContext()
    strategy.onBook?.(
      ctx,
      undefined as never,
      book({ bidIndex: 1, askIndex: 1 }),
      { szDecimals: 2 }
    )
    ctx.now = 2_000
    strategy.onBook?.(
      ctx,
      undefined as never,
      book({ bidIndex: 1, askIndex: 1 }),
      { szDecimals: 2 }
    )
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([])
  })

  it("cancels on wall movement and force-closes a partial fill", () => {
    const { strategy, ctx, events, setPosition } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    setPosition({ szi: "4", entryPx: "99.81" })
    strategy.onFill?.(ctx, undefined as never, {
      side: "buy",
      px: "99.81",
      sz: "4",
      fee: "0",
      closedPnl: "0",
      time: 2_100,
      cloid: "wall",
      oid: null,
      hlTid: null,
      purpose: "auto:wall-entry",
      remainingSz: "6",
      orderStatus: "partially_filled",
    })
    ctx.now = 2_500
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 3 }), {
      szDecimals: 2,
    })

    expect(events).toContain("wall_entry_partial_fill")
    expect(events).toContain("wall_invalidated")
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([
      expect.objectContaining({
        purpose: "auto:wall-forced-exit",
        side: "sell",
        sz: "4",
        reduceOnly: true,
      }),
    ])
  })

  it("keeps only the unfilled remainder after a partial entry fill", () => {
    const { strategy, ctx, setPosition } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    const entry = strategy.desiredOrders(ctx, undefined as never)[0]
    strategy.onOrderPlaced?.(
      ctx,
      undefined as never,
      entry,
      "resting",
      entry.sz
    )
    setPosition({ szi: "4", entryPx: "99.801" })
    strategy.onFill?.(ctx, undefined as never, {
      side: "buy",
      px: "99.801",
      sz: "4",
      fee: "0",
      closedPnl: "0",
      time: 2_100,
      cloid: "wall",
      oid: null,
      hlTid: null,
      purpose: "auto:wall-entry",
      remainingSz: "6.02",
      orderStatus: "partially_filled",
    })

    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([
      expect.objectContaining({
        purpose: "auto:wall-entry",
        sz: "6.02",
        sizeIsRemaining: true,
      }),
    ])
  })

  it("restarts confirmation after a stale unfilled entry is cancelled", () => {
    const { strategy, ctx } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    const entry = strategy.desiredOrders(ctx, undefined as never)[0]

    ctx.now = 4_000
    strategy.onTick?.(ctx, undefined as never)
    strategy.onOrderCancelled?.(ctx, undefined as never, entry, true)
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([])

    ctx.now = 6_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    expect(strategy.desiredOrders(ctx, undefined as never)).toHaveLength(1)
  })

  it("treats a partial exchange order update as an owned position", () => {
    const { strategy, ctx, events, state } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    const entry = strategy.desiredOrders(ctx, undefined as never)[0]
    strategy.onOrderUpdate?.(
      ctx,
      undefined as never,
      entry,
      "partially_filled",
      "6"
    )

    expect(state().wall?.active).toEqual(
      expect.objectContaining({ ownsPosition: true, remainingSz: 6 })
    )
    expect(events).toContain("wall_entry_partial_fill")

    strategy.onFill?.(ctx, undefined as never, {
      side: "buy",
      px: "99.801",
      sz: "4",
      fee: "0",
      closedPnl: "0",
      time: 2_100,
      cloid: "wall",
      oid: null,
      hlTid: null,
      purpose: "auto:wall-entry",
      remainingSz: "6",
      orderStatus: "partially_filled",
    })
    expect(
      events.filter((event) => event === "wall_entry_partial_fill")
    ).toHaveLength(1)
  })

  it("force-closes a fill that wins a cancellation race", () => {
    const { strategy, ctx, events, setPosition } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    const entry = strategy.desiredOrders(ctx, undefined as never)[0]
    ctx.now = 2_500
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 3 }), {
      szDecimals: 2,
    })
    strategy.onOrderCancelled?.(ctx, undefined as never, entry, false)
    setPosition({ szi: "2", entryPx: "99.801" })
    strategy.onFill?.(ctx, undefined as never, {
      side: "buy",
      px: "99.801",
      sz: "2",
      fee: "0",
      closedPnl: "0",
      time: 2_501,
      cloid: "wall",
      oid: null,
      hlTid: null,
      purpose: "auto:wall-entry",
      remainingSz: "0",
      orderStatus: "filled",
    })

    expect(events).toContain("wall_cancellation_race_fill")
    expect(strategy.desiredOrders(ctx, undefined as never)[0]).toEqual(
      expect.objectContaining({
        purpose: "auto:wall-forced-exit",
        side: "sell",
        sz: "2",
      })
    )
  })

  it("waits for a new book after rejection and rearms only after wall change", () => {
    const { strategy, ctx, setPosition } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    const entry = strategy.desiredOrders(ctx, undefined as never)[0]
    strategy.onOrderRejected?.(
      ctx,
      undefined as never,
      entry,
      "post-only order would cross"
    )
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([])
    ctx.now = 2_500
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    expect(strategy.desiredOrders(ctx, undefined as never)).toHaveLength(1)

    setPosition({ szi: "10", entryPx: "99.81" })
    strategy.onFill?.(ctx, undefined as never, {
      side: "buy",
      px: "99.81",
      sz: "10",
      fee: "0",
      closedPnl: "0",
      time: 2_600,
      cloid: "wall",
      oid: null,
      hlTid: null,
      purpose: "auto:wall-entry",
      remainingSz: "0",
      orderStatus: "filled",
    })
    setPosition(null)
    strategy.onFill?.(ctx, undefined as never, {
      side: "sell",
      px: "101",
      sz: "10",
      fee: "0",
      closedPnl: "10",
      time: 3_000,
      cloid: "exit",
      oid: null,
      hlTid: null,
      purpose: "auto:close",
      remainingSz: "0",
      orderStatus: "filled",
    })
    ctx.now = 5_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([])

    ctx.now = 5_500
    strategy.onBook?.(ctx, undefined as never, book(), { szDecimals: 2 })
    ctx.now = 6_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 3 }), {
      szDecimals: 2,
    })
    ctx.now = 8_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 3 }), {
      szDecimals: 2,
    })
    expect(strategy.desiredOrders(ctx, undefined as never)).toHaveLength(1)
  })

  it("requires a flat new start and repeatedly exits owned recovery after five stale seconds", () => {
    const fresh = wallContext()
    fresh.setPosition({ szi: "1", entryPx: "100" })
    expect(() =>
      fresh.strategy.onStart?.(fresh.ctx, undefined as never)
    ).toThrow("must start flat")

    const { strategy, ctx, setPosition } = wallContext()
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    ctx.now = 2_000
    strategy.onBook?.(ctx, undefined as never, book({ bidIndex: 1 }), {
      szDecimals: 2,
    })
    setPosition({ szi: "3", entryPx: "99.801" })
    strategy.onFill?.(ctx, undefined as never, {
      side: "buy",
      px: "99.801",
      sz: "3",
      fee: "0",
      closedPnl: "0",
      time: 2_100,
      cloid: "wall",
      oid: null,
      hlTid: null,
      purpose: "auto:wall-entry",
      remainingSz: "0",
      orderStatus: "filled",
    })

    ctx.now = 3_000
    strategy.onStart?.(ctx, undefined as never)
    ctx.now = 8_000
    strategy.onTick?.(ctx, undefined as never)
    expect(strategy.desiredOrders(ctx, undefined as never)).toHaveLength(1)
    ctx.now = 8_500
    expect(strategy.desiredOrders(ctx, undefined as never)).toEqual([])
    ctx.now = 9_000
    expect(strategy.desiredOrders(ctx, undefined as never)).toHaveLength(1)
  })
})
