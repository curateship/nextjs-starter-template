import { describe, expect, it } from "vitest"

import { resolveProtection } from "@/lib/strategies/settings"
import { automationWarmupBars } from "@/lib/strategies/kinds/automation"
import { sessionOpenPrice } from "@/lib/trading/sessions"

import {
  automationGraphSchema,
  compileAutomationGraph,
  SESSION_STOP_WINDOW_BARS,
  type AutomationEdge,
  type AutomationNode,
} from "./automation"
import { automationNodeConnectionError } from "./node-registry"

/**
 * A stop that sits at the session open, and a take profit measured as a
 * multiple of whatever the stop turned out to be. Fixtures use the Crypto
 * London block (08:00–16:00 UTC daily), so session boundaries are fixed clock
 * times with no holiday calendar or daylight-saving shift in the way.
 */

const HOUR_MS = 60 * 60 * 1000
const OPEN_MS = Date.parse("2026-07-06T08:00:00Z")

const sessions = (id: string, session = "utcLondon"): AutomationNode => ({
  id,
  kind: "indicator",
  x: 0,
  y: 0,
  indicator: { type: "session", params: { session, wickBodyRatio: 2 } },
})

const action = (id: string, actionType: "buy" | "short"): AutomationNode => ({
  id,
  kind: "action",
  action: actionType,
  targetEquityPct: 10,
  x: 0,
  y: 0,
})

const stopLoss = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "stopLoss" }>> = {}
): AutomationNode => ({
  id,
  kind: "stopLoss",
  pct: 1,
  x: 0,
  y: 0,
  ...overrides,
})

const takeProfit = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "takeProfit" }>> = {}
): AutomationNode => ({
  id,
  kind: "takeProfit",
  pct: 2,
  x: 0,
  y: 0,
  ...overrides,
})

const edge = (
  id: string,
  from: string,
  sourcePort: "bullish" | "bearish" | "trend" | "tp" | "sl",
  to: string
): AutomationEdge => ({ id, from, sourcePort, to })

/** A long entry fired by the Sessions node, with the exits passed in. */
const compile = (nodes: AutomationNode[], edges: AutomationEdge[]) =>
  compileAutomationGraph({
    interval: "15m",
    graph: {
      nodes: [sessions("sess"), action("long", "buy"), ...nodes],
      edges: [edge("entry", "sess", "bullish", "long"), ...edges],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  })

describe("wiring a session into a stop", () => {
  it("lets Sessions reach a Stop Loss, and no other indicator", () => {
    const stop = stopLoss("sl")
    expect(
      automationNodeConnectionError(sessions("sess"), "trend", stop)
    ).toBeNull()
    const qqe: AutomationNode = {
      id: "qqe",
      kind: "indicator",
      x: 0,
      y: 0,
      indicator: { type: "qqe", params: {} },
    }
    expect(automationNodeConnectionError(qqe, "trend", stop)).toBe(
      "The Trend output can only connect to an indicator, Look Back, Timeframe, or DCA node."
    )
  })

  it("still refuses Sessions into a Take Profit", () => {
    expect(
      automationNodeConnectionError(sessions("sess"), "trend", takeProfit("tp"))
    ).toContain("can only connect to")
  })
})

const baseNode = (
  id: string,
  basePeriods = 36,
  pumpPeriods = 8
): AutomationNode => ({
  id,
  kind: "indicator",
  x: 0,
  y: 0,
  indicator: { type: "base", params: { basePeriods, pumpPeriods } },
})

describe("stop loss at the confirmed base", () => {
  it("carries the wired Base node's detection settings onto the side it guards", () => {
    // The stop has to find the SAME level the chart paints, so the base's own
    // settings ride along rather than being guessed at runtime.
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          baseNode("base", 24, 5),
          action("long", "buy"),
          stopLoss("sl", { level: "confirmedBase" }),
        ],
        edges: [
          edge("entry", "base", "bullish", "long"),
          edge("hook", "long", "sl", "sl"),
          edge("wire", "base", "trend", "sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.errors).toEqual([])
    expect(result.config?.protection.long).toEqual({
      stopLossPct: 1,
      stopLossLevel: { kind: "confirmedBase", basePeriods: 24, pumpPeriods: 5 },
    })
  })

  it("loads a retired stop level as a plain percent, not a parse failure", () => {
    // "belowRung" reached a running dev server before being replaced. A saved
    // automation carrying it must still OPEN — an unknown level degrades to the
    // percent stop rather than making the whole automation unloadable.
    const saved = automationGraphSchema.parse({
      nodes: [action("long", "buy"), { ...stopLoss("sl"), level: "belowRung" }],
      edges: [edge("hook", "long", "sl", "sl")],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    const stop = saved.nodes.find((node) => node.kind === "stopLoss")
    expect(stop?.kind === "stopLoss" && stop.level).toBe("percent")
  })

  it("finds the Base through the entry the stop guards — no second wire", () => {
    // The ordinary ladder graph: Base -> DCA -> Stop Loss. The Base is already
    // wired into the ladder, so the stop must not demand its own wire to it.
    const result = compileAutomationGraph({
      interval: "1h",
      graph: {
        nodes: [
          baseNode("base", 30, 6),
          {
            id: "dca",
            kind: "dca",
            rungs: [{ deviation: 5 }],
            maxPositionPct: 25,
            sizeMultiplier: 1,
            compound: true,
            rungEntry: "market",
            requireTwoGreen: false,
            trendFilterEnabled: false,
            trendMaBars: 200,
            exitOnTrendBreak: false,
            x: 0,
            y: 0,
          },
          stopLoss("sl", { level: "confirmedBase" }),
        ],
        edges: [
          edge("entry", "base", "bullish", "dca"),
          edge("hook", "dca", "sl", "sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.errors).toEqual([])
    expect(result.config?.protection.long?.stopLossLevel).toEqual({
      kind: "confirmedBase",
      basePeriods: 30,
      pumpPeriods: 6,
    })
  })

  it("needs a Base node wired in", () => {
    const result = compile(
      [stopLoss("sl", { level: "confirmedBase" })],
      [edge("hook", "long", "sl", "sl")]
    )
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.message)).toContain(
      "Stop Loss is set at the confirmed base — wire a Base node into this stop or into the entry it guards, so it knows which base to sit at."
    )
  })

  it("cannot also trail — the base is one fixed price", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          baseNode("base"),
          action("long", "buy"),
          stopLoss("sl", { level: "confirmedBase", mode: "trailing" }),
        ],
        edges: [
          edge("entry", "base", "bullish", "long"),
          edge("hook", "long", "sl", "sl"),
          edge("wire", "base", "trend", "sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_protection"
    )
  })

  it("lets a Base node reach a Stop Loss", () => {
    expect(
      automationNodeConnectionError(baseNode("base"), "trend", stopLoss("sl"))
    ).toBeNull()
  })

  it("turns the base price into the stop's percent, both sides", () => {
    const level = {
      kind: "confirmedBase" as const,
      basePeriods: 36,
      pumpPeriods: 8,
    }
    // Long entered at 100 with the base at 95: the stop is 5% away, not the 1%
    // fallback. The fallback only stands when there is no base to sit on.
    expect(
      resolveProtection(
        { stopLossPct: 1, stopLossLevel: level },
        { szi: 1, entryPx: 100 },
        95
      ).stopLossPct
    ).toBeCloseTo(5, 6)
    // Short entered at 100 with the ceiling at 104: the level sits ABOVE.
    expect(
      resolveProtection(
        { stopLossPct: 1, stopLossLevel: level },
        { szi: -1, entryPx: 100 },
        104
      ).stopLossPct
    ).toBeCloseTo(4, 6)
    // No base confirmed yet -> the configured percent stands. There is always a stop.
    expect(
      resolveProtection(
        { stopLossPct: 1, stopLossLevel: level },
        { szi: 1, entryPx: 100 },
        0
      ).stopLossPct
    ).toBe(1)
  })
})

describe("stop loss at the session open", () => {
  it("carries the wired Sessions node's session onto the side it guards", () => {
    const result = compile(
      [stopLoss("sl", { level: "sessionOpen" })],
      [edge("hook", "long", "sl", "sl"), edge("wire", "sess", "trend", "sl")]
    )
    expect(result.errors).toEqual([])
    expect(result.config?.protection.long).toEqual({
      stopLossPct: 1,
      stopLossLevel: { kind: "sessionOpen", session: "utcLondon" },
    })
  })

  it("needs a Sessions node wired in", () => {
    const result = compile(
      [stopLoss("sl", { level: "sessionOpen" })],
      [edge("hook", "long", "sl", "sl")]
    )
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.message)).toContain(
      "Stop Loss is set to the session open — wire a Sessions node into it so it knows which session to use."
    )
  })

  it("cannot also trail — the session open is one fixed price", () => {
    const result = compile(
      [stopLoss("sl", { level: "sessionOpen", mode: "trailing" })],
      [edge("hook", "long", "sl", "sl"), edge("wire", "sess", "trend", "sl")]
    )
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_protection"
    )
  })

  it("leaves the Sessions node feeding it counted as connected", () => {
    // The wire runs entry → stop, which ancestor-marking never walks, so a
    // Sessions node used ONLY for the stop must still not read as dangling.
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          sessions("sess"),
          sessions("stopSess", "nyse"),
          action("long", "buy"),
          stopLoss("sl", { level: "sessionOpen" }),
        ],
        edges: [
          edge("entry", "sess", "bullish", "long"),
          edge("hook", "long", "sl", "sl"),
          edge("wire", "stopSess", "trend", "sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.errors).toEqual([])
    expect(result.config?.protection.long?.stopLossLevel).toEqual({
      kind: "sessionOpen",
      session: "nyse",
    })
  })

  it("makes the engine hold enough candles to reach the session open", () => {
    const result = compile(
      [stopLoss("sl", { level: "sessionOpen" })],
      [edge("hook", "long", "sl", "sl"), edge("wire", "sess", "trend", "sl")]
    )
    expect(automationWarmupBars(result.config!)).toBeGreaterThanOrEqual(
      SESSION_STOP_WINDOW_BARS
    )
  })

  it("refuses two stops on one entry that disagree about where the stop sits", () => {
    // Same percent, different level: silently upgrading the percent stop to a
    // session one would move a level the user set deliberately.
    const result = compile(
      [stopLoss("slPct"), stopLoss("slSession", { level: "sessionOpen" })],
      [
        edge("hookA", "long", "sl", "slPct"),
        edge("hookB", "long", "sl", "slSession"),
        edge("wire", "sess", "trend", "slSession"),
      ]
    )
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.message)).toContain(
      "Long stop-loss is set twice with different levels (a percent, a session open, the confirmed base, or two different sessions)."
    )
  })

  it("stays out of the config when the stop is a plain percent", () => {
    const result = compile([stopLoss("sl")], [edge("hook", "long", "sl", "sl")])
    expect(result.config?.protection.long).toEqual({ stopLossPct: 1 })
  })
})

describe("risk-reward take profit", () => {
  it("turns the ratio into a percent against a plain percent stop", () => {
    const result = compile(
      [stopLoss("sl", { pct: 2 }), takeProfit("tp", { rrRatio: 1 })],
      [edge("slHook", "long", "sl", "sl"), edge("tpHook", "long", "tp", "tp")]
    )
    expect(result.errors).toEqual([])
    // 1:1 on a 2% stop is a 2% target, and nothing downstream has to know
    // a ratio was ever involved.
    expect(result.config?.protection.long).toEqual({
      stopLossPct: 2,
      takeProfitPct: 2,
    })
  })

  it("multiplies the stop by the ratio", () => {
    const result = compile(
      [stopLoss("sl", { pct: 1.5 }), takeProfit("tp", { rrRatio: 2.5 })],
      [edge("slHook", "long", "sl", "sl"), edge("tpHook", "long", "tp", "tp")]
    )
    expect(result.config?.protection.long?.takeProfitPct).toBe(3.75)
  })

  it("needs a stop on the same entry to measure against", () => {
    const result = compile(
      [takeProfit("tp", { rrRatio: 2 })],
      [edge("tpHook", "long", "tp", "tp")]
    )
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.message)).toContain(
      "A risk-reward take profit measures against the stop, so the long entry needs a Stop Loss too."
    )
  })

  it("keeps the ratio for the engine when the stop is a session open", () => {
    const result = compile(
      [
        stopLoss("sl", { pct: 1, level: "sessionOpen" }),
        takeProfit("tp", { rrRatio: 3 }),
      ],
      [
        edge("slHook", "long", "sl", "sl"),
        edge("tpHook", "long", "tp", "tp"),
        edge("wire", "sess", "trend", "sl"),
      ]
    )
    expect(result.errors).toEqual([])
    // The distance isn't known until a trade opens, so the ratio rides along
    // and the percent beside it is the outside-session fallback (1% × 3).
    expect(result.config?.protection.long).toEqual({
      stopLossPct: 1,
      stopLossLevel: { kind: "sessionOpen", session: "utcLondon" },
      takeProfitPct: 3,
      takeProfitRr: 3,
    })
  })

  it("rejects a ratio that overshoots the take-profit cap", () => {
    const result = compile(
      [stopLoss("sl", { pct: 90 }), takeProfit("tp", { rrRatio: 15 })],
      [edge("slHook", "long", "sl", "sl"), edge("tpHook", "long", "tp", "tp")]
    )
    expect(result.config).toBeNull()
    expect(result.errors[0]?.message).toContain("1000% take-profit cap")
  })

  it("guards each side on its own", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          sessions("sess"),
          action("long", "buy"),
          action("short", "short"),
          stopLoss("slLong", { pct: 2 }),
          takeProfit("tpLong", { rrRatio: 2 }),
          stopLoss("slShort", { pct: 4 }),
          takeProfit("tpShort", { pct: 1 }),
        ],
        edges: [
          edge("entryLong", "sess", "bullish", "long"),
          edge("entryShort", "sess", "bearish", "short"),
          edge("a", "long", "sl", "slLong"),
          edge("b", "long", "tp", "tpLong"),
          edge("c", "short", "sl", "slShort"),
          edge("d", "short", "tp", "tpShort"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.errors).toEqual([])
    expect(result.config?.protection.long?.takeProfitPct).toBe(4)
    expect(result.config?.protection.short?.takeProfitPct).toBe(1)
  })
})

describe("resolving both at entry", () => {
  const level = { kind: "sessionOpen", session: "utcLondon" } as const

  it("turns the session-open price into the stop percent", () => {
    // Long entered at 102 with the session open at 100: the stop is 2% away,
    // and a 2:1 target is 4%.
    const resolved = resolveProtection(
      { stopLossPct: 5, stopLossLevel: level, takeProfitRr: 2 },
      { szi: 1, entryPx: 102 },
      100
    )
    expect(resolved.stopLossPct).toBeCloseTo(1.9608, 4)
    expect(resolved.takeProfitPct).toBeCloseTo(3.9216, 4)
  })

  it("mirrors for a short — the level sits above the entry", () => {
    const resolved = resolveProtection(
      { stopLossPct: 5, stopLossLevel: level },
      { szi: -1, entryPx: 98 },
      100
    )
    expect(resolved.stopLossPct).toBeCloseTo(2.0408, 4)
  })

  it("falls back to the percent when the trade opened outside the session", () => {
    // 0 is the engine's record of "looked, and no session was running".
    expect(
      resolveProtection(
        { stopLossPct: 5, stopLossLevel: level, takeProfitRr: 2 },
        { szi: 1, entryPx: 102 },
        0
      )
    ).toMatchObject({ stopLossPct: 5, takeProfitPct: 10 })
  })

  it("falls back when the level is on the wrong side of the entry", () => {
    // A long that got in BELOW the session open: the level is a target, not a
    // stop, so the configured percent stands rather than a stop above entry.
    expect(
      resolveProtection(
        { stopLossPct: 5, stopLossLevel: level },
        { szi: 1, entryPx: 98 },
        100
      ).stopLossPct
    ).toBe(5)
  })

  it("leaves plain percent settings untouched", () => {
    const settings = { stopLossPct: 2, takeProfitPct: 3 }
    expect(resolveProtection(settings, { szi: 1, entryPx: 100 }, null)).toBe(
      settings
    )
  })
})

describe("sessionOpenPrice", () => {
  const candles = Array.from({ length: 12 }, (_, i) => ({
    t: OPEN_MS - 2 * HOUR_MS + i * HOUR_MS,
    o: 100 + i,
  }))

  it("reads the open of the session's first candle", () => {
    // Candles start two hours before the 08:00 open, so the session's first
    // candle is index 2 — opening at 102.
    expect(sessionOpenPrice("utcLondon", candles, OPEN_MS + 3 * HOUR_MS)).toBe(
      102
    )
  })

  it("is null outside the session's hours", () => {
    expect(sessionOpenPrice("utcLondon", candles, OPEN_MS - HOUR_MS)).toBeNull()
    expect(
      sessionOpenPrice("utcLondon", candles, OPEN_MS + 9 * HOUR_MS)
    ).toBeNull()
  })

  it("is null when the candles don't reach back to the open", () => {
    // Starting AT the open is fine; starting after it is not — the earliest
    // candle would just be where the data begins.
    expect(sessionOpenPrice("utcLondon", candles.slice(2), OPEN_MS)).toBe(102)
    expect(
      sessionOpenPrice("utcLondon", candles.slice(3), OPEN_MS + HOUR_MS)
    ).toBeNull()
  })
})
