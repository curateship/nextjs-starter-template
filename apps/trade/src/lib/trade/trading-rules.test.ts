import { describe, expect, it } from "vitest"

import type { Drawing } from "./drawings"
import {
  checkTradingRules,
  countLinesAroundPrice,
  DEFAULT_TRADING_RULES,
  describeDuration,
  overrodeNames,
  overrodeNote,
  overrodeSchema,
  readTradingRules,
  unmetRulesHeading,
  type TradingRules,
  type TradingRulesCheck,
} from "./trading-rules"

const NOW = 1_800_000_000_000
const HOUR = 3_600_000

function level(price: number, id = `level-${price}`): Drawing {
  return { id, shape: { kind: "level", price }, alert: null }
}

function trendline(from: number, to: number, id = `trend-${from}`): Drawing {
  return {
    id,
    shape: {
      kind: "trendline",
      from: { time: NOW - HOUR, price: from },
      to: { time: NOW, price: to },
    },
    alert: null,
  }
}

function vertical(price: number): Drawing {
  return {
    id: "vertical",
    shape: {
      kind: "trendline",
      from: { time: NOW, price },
      to: { time: NOW, price: price + 10 },
    },
    alert: null,
  }
}

function rules(overrides: Partial<TradingRules> = {}): TradingRules {
  return { ...DEFAULT_TRADING_RULES, ...overrides }
}

/** Every rule met: four lines, an hour on the chart, a stop, no last order. */
function met(overrides: Partial<TradingRulesCheck> = {}): TradingRulesCheck {
  return {
    rules: DEFAULT_TRADING_RULES,
    side: "sell",
    drawings: [level(62_000), level(63_000), level(58_000), level(57_000)],
    price: 60_000,
    onChartForMs: HOUR,
    lastOrderAt: null,
    now: NOW,
    ...overrides,
  }
}

describe("reading saved trading rules", () => {
  it("starts with every rule off and the numbers the task named", () => {
    expect(readTradingRules(null)).toEqual(DEFAULT_TRADING_RULES)
    expect(DEFAULT_TRADING_RULES.lines.count).toBe(2)
    expect(DEFAULT_TRADING_RULES.timeOnChart.minutes).toBe(3)
    expect(DEFAULT_TRADING_RULES.timeSinceLastOrder.minutes).toBe(5)
  })

  it("reads a row that still carries the removed stop-loss rule", () => {
    const saved = readTradingRules({
      ...DEFAULT_TRADING_RULES,
      stopLoss: { on: true, applies: "both" },
    })
    expect(saved).toEqual(DEFAULT_TRADING_RULES)
  })

  it("keeps the rules it understands and fills the missing one", () => {
    const saved = readTradingRules({
      lines: { on: true, count: 3, kinds: "level", applies: "shorts" },
    })
    expect(saved.lines).toEqual({
      on: true,
      count: 3,
      kinds: "level",
      applies: "shorts",
    })
    expect(saved.timeOnChart).toEqual(DEFAULT_TRADING_RULES.timeOnChart)
  })

  it("falls back to every rule off when a rule is unreadable", () => {
    expect(readTradingRules({ lines: { on: "yes", count: 2 } })).toEqual(
      DEFAULT_TRADING_RULES
    )
  })
})

describe("checking the rules before an entry", () => {
  it("answers nothing when every rule is off, whatever the chart shows", () => {
    expect(
      checkTradingRules(
        met({
          drawings: [],
          onChartForMs: 0,
          lastOrderAt: NOW - 1000,
        })
      )
    ).toEqual([])
  })

  it("answers nothing when every switched-on rule is met", () => {
    const all = rules({
      lines: { on: true, count: 2, kinds: "either", applies: "both" },
      timeOnChart: { on: true, minutes: 3, applies: "both" },
      timeSinceLastOrder: { on: true, minutes: 5, applies: "both" },
    })
    expect(checkTradingRules(met({ rules: all }))).toEqual([])
  })

  it("counts lines above and below the price, in the task's worked example", () => {
    const unmet = checkTradingRules(
      met({
        rules: rules({
          lines: { on: true, count: 2, kinds: "either", applies: "both" },
          timeOnChart: { on: true, minutes: 3, applies: "both" },
        }),
        drawings: [trendline(61_000, 62_000)],
        onChartForMs: 40_000,
      })
    )
    expect(unmet.map((rule) => rule.name)).toEqual([
      "lines on the chart",
      "time on this chart",
    ])
    expect(unmet[0].sentence).toBe(
      "Lines on the chart: you asked for 2 above and 2 below. You have 1 above and 0 below."
    )
    expect(unmet[0].title).toBe("Lines on the chart")
    expect(unmet[0].asked).toBe("2 above and 2 below.")
    expect(unmet[0].now).toBe("You have 1 above and 0 below.")
    expect(unmet[1].sentence).toBe(
      "Time on this chart: you asked for 3 minutes before a short. You have been here 40 seconds."
    )
  })

  it("counts only the kind of line the rule asks for", () => {
    const drawings = [
      level(62_000),
      level(63_000),
      trendline(57_000, 58_000),
      trendline(56_000, 57_000, "trend-2"),
    ]
    expect(countLinesAroundPrice(drawings, "either", 60_000, NOW)).toEqual({
      above: 2,
      below: 2,
      onPrice: 0,
    })
    expect(countLinesAroundPrice(drawings, "level", 60_000, NOW)).toEqual({
      above: 2,
      below: 0,
      onPrice: 0,
    })
    expect(countLinesAroundPrice(drawings, "trendline", 60_000, NOW)).toEqual({
      above: 0,
      below: 2,
      onPrice: 0,
    })
    const unmet = checkTradingRules(
      met({
        rules: rules({
          lines: { on: true, count: 2, kinds: "level", applies: "both" },
        }),
        drawings,
      })
    )
    expect(unmet[0].sentence).toBe(
      "Levels on the chart: you asked for 2 above and 2 below. You have 2 above and 0 below."
    )
  })

  it("reads a trendline at its price right now, not where it was drawn", () => {
    // Drawn rising from 59,000 an hour ago to 61,000 now: above the price.
    expect(
      countLinesAroundPrice([trendline(59_000, 61_000)], "either", 60_000, NOW)
    ).toEqual({ above: 1, below: 0, onPrice: 0 })
  })

  it("counts a vertical line for neither side", () => {
    expect(
      countLinesAroundPrice([vertical(60_000)], "either", 60_000, NOW)
    ).toEqual({ above: 0, below: 0, onPrice: 0 })
  })

  it("says so when a line sits exactly on the price", () => {
    const unmet = checkTradingRules(
      met({
        rules: rules({
          lines: { on: true, count: 1, kinds: "either", applies: "both" },
        }),
        drawings: [level(60_000), level(61_000)],
      })
    )
    expect(unmet[0].sentence).toBe(
      "Lines on the chart: you asked for 1 above and 1 below. You have 1 above and 0 below. 1 line sits on the price."
    )
  })

  it("applies a rule to one side only when asked", () => {
    const shortsOnly = rules({
      timeOnChart: { on: true, minutes: 3, applies: "shorts" },
    })
    expect(
      checkTradingRules(
        met({ rules: shortsOnly, side: "buy", onChartForMs: 30_000 })
      )
    ).toEqual([])
    const unmet = checkTradingRules(
      met({ rules: shortsOnly, side: "sell", onChartForMs: 30_000 })
    )
    expect(unmet).toHaveLength(1)
    expect(unmet[0].sentence).toContain("You have been here 30 seconds.")

    const longsOnly = rules({
      timeSinceLastOrder: { on: true, minutes: 5, applies: "longs" },
    })
    expect(
      checkTradingRules(
        met({ rules: longsOnly, side: "sell", lastOrderAt: NOW - 1000 })
      )
    ).toEqual([])
    expect(
      checkTradingRules(
        met({ rules: longsOnly, side: "buy", lastOrderAt: NOW - 1000 })
      )
    ).toHaveLength(1)
  })

  it("waits between orders on a coin, and never on the first order", () => {
    const withGap = rules({
      timeSinceLastOrder: { on: true, minutes: 5, applies: "both" },
    })
    expect(
      checkTradingRules(met({ rules: withGap, lastOrderAt: null }))
    ).toEqual([])
    expect(
      checkTradingRules(met({ rules: withGap, lastOrderAt: NOW - 6 * 60_000 }))
    ).toEqual([])
    const unmet = checkTradingRules(
      met({ rules: withGap, lastOrderAt: NOW - 150_000 })
    )
    expect(unmet[0].sentence).toBe(
      "Time since the last order: you asked for 5 minutes between orders on a coin. Your last order on this coin was 2 minutes 30 seconds ago."
    )
  })

  it("says the chart has no price yet rather than counting against nothing", () => {
    const unmet = checkTradingRules(
      met({
        rules: rules({
          lines: { on: true, count: 2, kinds: "either", applies: "both" },
        }),
        price: null,
      })
    )
    expect(unmet[0].sentence).toContain("The chart has no price yet")
  })
})

describe("the words around the check", () => {
  it("describes a wait in seconds, minutes and hours", () => {
    expect(describeDuration(0)).toBe("0 seconds")
    expect(describeDuration(40_000)).toBe("40 seconds")
    expect(describeDuration(60_000)).toBe("1 minute")
    expect(describeDuration(150_000)).toBe("2 minutes 30 seconds")
    expect(describeDuration(HOUR)).toBe("1 hour")
    expect(describeDuration(HOUR + 5 * 60_000)).toBe("1 hour 5 minutes")
  })

  it("heads the window with how many rules are not met", () => {
    expect(unmetRulesHeading(1)).toBe("1 rule not met")
    expect(unmetRulesHeading(3)).toBe("3 rules not met")
  })

  it("lets only the four known rule names onto an order", () => {
    expect(overrodeSchema.safeParse(["lines on the chart"]).success).toBe(true)
    expect(overrodeSchema.safeParse(["anything I typed"]).success).toBe(false)
    expect(overrodeSchema.safeParse([]).success).toBe(false)
  })

  it("writes the override note and reads it back off a Journal row", () => {
    const note = overrodeNote(["lines on the chart", "time on this chart"])
    expect(note).toBe("Overrode: lines on the chart, time on this chart")
    expect(overrodeNames(note)).toEqual([
      "lines on the chart",
      "time on this chart",
    ])
    expect(overrodeNames(`${note}. Resting on the exchange.`)).toEqual([
      "lines on the chart",
      "time on this chart",
    ])
    expect(overrodeNames("Resting on the exchange.")).toBeNull()
    expect(overrodeNames(null)).toBeNull()
  })
})
