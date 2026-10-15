import { describe, expect, it } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"

import type { Drawing } from "./drawings"
import {
  candleClosesAt,
  checkTradingRules,
  countLinesAroundPrice,
  describeDuration,
  describeRuleCard,
  describeRuleCovers,
  emaCandleNeeds,
  judgeRule,
  notesOf,
  notesToTick,
  overrodeNames,
  overrodeNote,
  overrodeSchema,
  readTradingRules,
  ruleCardLabel,
  tradingRulesSchema,
  unmetRulesHeading,
  type RuleBars,
  type RuleCard,
  type RuleFacts,
  type TradingRule,
} from "./trading-rules"

// Thursday 15 Oct 2026, midday UTC. Its week opened on Monday 12 Oct.
const NOW = Date.UTC(2026, 9, 15, 12)
const DAY = 86_400_000
const WEEK = 7 * DAY
const HOUR = 3_600_000
const THIS_WEEK = Date.UTC(2026, 9, 12)

function level(price: number, name?: string): Drawing {
  return {
    id: `level-${price}`,
    shape: { kind: "level", price, ...(name ? { name } : {}) },
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

/** `count` closed weekly candles, every one closing at `close`, then this week's. */
function weeks(count: number, close: number, bar?: Partial<CandleBar>): CandleBar[] {
  const closed = Array.from({ length: count }, (_, index) => ({
    openTime: THIS_WEEK - (count - index) * WEEK,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    ...(index === count - 1 ? bar : {}),
  }))
  // The forming week moves nothing: an EMA reads closed candles only.
  return [
    ...closed,
    { openTime: THIS_WEEK, open: 1, high: 1, low: 1, close: 1, volume: 1 },
  ]
}

function ready(bars: CandleBar[]): () => RuleBars {
  return () => ({ status: "ready", bars })
}

function facts(overrides: Partial<RuleFacts> = {}): RuleFacts {
  return {
    moment: "entry",
    price: 60_000,
    drawings: [],
    onChartForMs: HOUR,
    lastOrderAt: null,
    gridsOnExchange: 0,
    gridsInWallet: 0,
    gridsOnCoin: 0,
    positionsOnExchange: 0,
    candles: () => ({ status: "loading" }),
    now: NOW,
    ...overrides,
  }
}

function rule(overrides: Partial<TradingRule> = {}): TradingRule {
  return {
    id: "rule-1",
    name: "Weekly trend guard",
    on: true,
    places: ["grid"],
    sides: "both",
    match: "all",
    then: "block",
    cards: [],
    notes: [],
    ...overrides,
  }
}

const ABOVE_WEEKLY_50: RuleCard = {
  type: "ema",
  position: "above",
  period: 50,
  interval: "1w",
  reading: "now",
}

const AT_MOST_FIVE_GRIDS: RuleCard = { type: "gridsOnExchange", count: 5 }

/**
 * Tyler's own example, "timeframe 1 week > ema 50 > trade grid 5", as what
 * must hold: price above the weekly EMA 50, and at most 5 grids running.
 */
const WEEKLY_TREND_GUARD = rule({ cards: [ABOVE_WEEKLY_50, AT_MOST_FIVE_GRIDS] })

describe("reading saved trading rules", () => {
  it("starts with no rules", () => {
    expect(readTradingRules(null)).toEqual({ list: [] })
    expect(readTradingRules("junk")).toEqual({ list: [] })
  })

  it("turns each switched-on old rule into a Warn rule with the same numbers", () => {
    const read = readTradingRules({
      lines: { on: true, count: 3, kinds: "level", applies: "shorts" },
      timeOnChart: { on: false, minutes: 3, applies: "both" },
      timeSinceLastOrder: { on: true, minutes: 7, applies: "both" },
      gridsPerExchange: { on: true, count: 10 },
      // The stop-loss rule removed on 4 Sep 2026 is still on some rows.
      stopLoss: { on: true, applies: "both" },
    })
    expect(read.list.map((one) => one.name)).toEqual([
      "Lines on the chart",
      "Time since the last order",
      "Grids on one exchange",
    ])
    expect(read.list.every((one) => one.then === "warn" && one.on)).toBe(true)
    expect(read.list[0]).toMatchObject({
      sides: "shorts",
      places: ["order", "dca", "grid"],
      cards: [{ type: "lines", count: 3, kinds: "level" }],
    })
    expect(read.list[1].cards).toEqual([{ type: "timeSinceLastOrder", minutes: 7 }])
    expect(read.list[2]).toMatchObject({
      places: ["grid"],
      cards: [{ type: "gridsOnExchange", count: 10 }],
    })
    // Read twice, the same ids, so the table stays steady until a save.
    expect(readTradingRules({ gridsPerExchange: { on: true, count: 10 } }).list[0].id).toBe(
      read.list[2].id
    )
  })

  it("reads an old row with every rule off as no rules", () => {
    expect(
      readTradingRules({
        lines: { on: false, count: 2, kinds: "either", applies: "both" },
        gridsPerExchange: { on: false, count: 10 },
      })
    ).toEqual({ list: [] })
  })

  it("keeps a condition it cannot read in its place, marked", () => {
    const read = readTradingRules({
      list: [
        { ...WEEKLY_TREND_GUARD, cards: [ABOVE_WEEKLY_50, { type: "rsi", below: 30 }] },
      ],
    })
    expect(read.list[0].cards).toEqual([ABOVE_WEEKLY_50, { type: "unreadable" }])
  })

  it("drops a rule it cannot read without losing the others", () => {
    const read = readTradingRules({
      list: [{ id: "broken" }, WEEKLY_TREND_GUARD],
    })
    expect(read.list).toEqual([WEEKLY_TREND_GUARD])
  })

  it("refuses a name with a comma or full stop, which would split the Journal note", () => {
    const save = (name: string) =>
      tradingRulesSchema.safeParse({ list: [rule({ name })] }).success
    expect(save("Weekly trend guard")).toBe(true)
    expect(save("Weekly, trend")).toBe(false)
    expect(save("v1.2")).toBe(false)
    expect(save("   ")).toBe(false)
  })
})

describe("the words for a rule", () => {
  it("says each condition as one sentence of what must hold", () => {
    expect(describeRuleCard(ABOVE_WEEKLY_50)).toBe(
      "Price is above EMA 50 on 1 week"
    )
    expect(describeRuleCard({ ...ABOVE_WEEKLY_50, reading: "candle" })).toBe(
      "The whole last weekly candle is above EMA 50"
    )
    expect(describeRuleCard(AT_MOST_FIVE_GRIDS)).toBe(
      "At most 5 real-money grids running on this exchange"
    )
    expect(describeRuleCard({ type: "lines", count: 2, kinds: "either" })).toBe(
      "At least 2 lines above the price and 2 below it"
    )
    expect(
      describeRuleCard({ type: "line", line: null, position: "within", percent: 1 })
    ).toBe("Price is within 1% of the nearest line")
    expect(
      describeRuleCard({ type: "line", line: "Weekly support", position: "under", percent: 1 })
    ).toBe('Price is under "Weekly support"')
  })

  it("says each condition as a short line with no prices", () => {
    expect(ruleCardLabel(ABOVE_WEEKLY_50)).toBe(
      "EMA 50 on 1 week timeframe is above"
    )
    expect(ruleCardLabel({ ...ABOVE_WEEKLY_50, reading: "close" })).toBe(
      "EMA 50 on 1 week timeframe is above, last close"
    )
    expect(ruleCardLabel({ type: "gridsInWallet", count: 5 })).toBe(
      "At most 5 grids in this wallet"
    )
  })

  it("says what a rule covers", () => {
    expect(describeRuleCovers(rule())).toBe("Grids")
    expect(describeRuleCovers(rule({ places: ["order", "dca", "grid"] }))).toBe(
      "Any entry"
    )
    expect(
      describeRuleCovers(rule({ places: ["order", "dca"], sides: "longs" }))
    ).toBe("Long orders and DCA ladders")
    expect(describeRuleCovers(rule({ places: [] }))).toBe("Nothing yet")
  })
})

describe("judging Tyler's weekly trend guard", () => {
  // BTC at $60,000 under a weekly EMA 50 of $64,000, 4 grids running.
  const under = facts({
    candles: ready(weeks(60, 64_000)),
    gridsOnExchange: 4,
  })
  const above = facts({
    price: 70_000,
    candles: ready(weeks(60, 64_000)),
    gridsOnExchange: 4,
  })

  it("lets a grid through when price is above the weekly EMA 50 and this makes 5 grids", () => {
    expect(
      checkTradingRules(
        { list: [WEEKLY_TREND_GUARD] },
        { place: "grid", side: "buy" },
        above
      )
    ).toEqual([])
  })

  it("blocks a grid when price is under the weekly EMA 50, and crosses only that condition", () => {
    const [result] = checkTradingRules(
      { list: [WEEKLY_TREND_GUARD] },
      { place: "grid", side: "buy" },
      under
    )
    expect(result.state).toBe("yes")
    expect(result.blocks).toBe(true)
    expect(result.cards.map((card) => card.label)).toEqual([
      "EMA 50 on 1 week timeframe is above",
    ])
    expect(result.allCards.map((card) => card.state)).toEqual(["no", "yes"])
  })

  it("crosses the grid limit when this grid would make 6", () => {
    // Tyler, 15 Oct 2026, of a tick beside 18 grids under a limit of 5:
    // "this should be an x".
    const [result] = checkTradingRules(
      { list: [WEEKLY_TREND_GUARD] },
      { place: "grid", side: "buy" },
      { ...above, gridsOnExchange: 5 }
    )
    expect(result.blocks).toBe(true)
    expect(result.cards[0].now).toBe(
      "You have 5 running on this exchange, so this one makes 6."
    )
  })

  it("is fine with Any as soon as one condition holds", () => {
    expect(
      checkTradingRules(
        { list: [{ ...WEEKLY_TREND_GUARD, match: "any" }] },
        { place: "grid", side: "buy" },
        under
      )
    ).toEqual([])
    const [broken] = checkTradingRules(
      { list: [{ ...WEEKLY_TREND_GUARD, match: "any" }] },
      { place: "grid", side: "buy" },
      { ...under, gridsOnExchange: 9 }
    )
    expect(broken.state).toBe("yes")
  })

  it("never checks a Long order against a rule that covers only grids", () => {
    expect(
      checkTradingRules(
        { list: [WEEKLY_TREND_GUARD] },
        { place: "order", side: "buy" },
        under
      )
    ).toEqual([])
  })

  it("follows the side a rule is set to", () => {
    const longsOnly = { list: [{ ...WEEKLY_TREND_GUARD, sides: "longs" as const }] }
    expect(checkTradingRules(longsOnly, { place: "grid", side: "sell" }, under)).toEqual([])
    expect(checkTradingRules(longsOnly, { place: "grid", side: "buy" }, under)).toHaveLength(1)
  })

  it("never checks a rule that is switched off", () => {
    expect(
      checkTradingRules(
        { list: [{ ...WEEKLY_TREND_GUARD, on: false }] },
        { place: "grid", side: "buy" },
        under
      )
    ).toEqual([])
  })

  it("warns instead of blocking while the candles are still loading", () => {
    const [result] = checkTradingRules(
      { list: [WEEKLY_TREND_GUARD] },
      { place: "grid", side: "buy" },
      { ...under, candles: () => ({ status: "loading" }) }
    )
    expect(result.state).toBe("unknown")
    expect(result.blocks).toBe(false)
    expect(result.cards[0].now).toBe("The weekly candles are still loading.")
  })

  it("says so when a coin is too new for the average", () => {
    const result = judgeRule(WEEKLY_TREND_GUARD, {
      ...under,
      candles: ready(weeks(30, 64_000)),
    })
    expect(result.state).toBe("unknown")
    expect(result.cards[0].now).toBe(
      "EMA 50 needs 50 closed weekly candles. This coin has 30."
    )
  })

  it("never blocks on a condition it could not read", () => {
    const result = judgeRule(
      rule({ cards: [AT_MOST_FIVE_GRIDS, { type: "unreadable" }] }),
      under
    )
    expect(result.state).toBe("unknown")
    expect(result.blocks).toBe(false)
  })
})

describe("each condition", () => {
  it("reads the whole last closed candle against the EMA", () => {
    const card: RuleCard = { ...ABOVE_WEEKLY_50, position: "under", reading: "candle" }
    const wholeUnder = judgeRule(rule({ cards: [card] }), facts({
      candles: ready(weeks(60, 64_000, { high: 63_000, close: 62_000 })),
    }))
    expect(wholeUnder.allCards[0].state).toBe("yes")
    expect(wholeUnder.state).toBe("no")
    const crossed = judgeRule(rule({ cards: [card] }), facts({
      candles: ready(weeks(60, 64_000, { high: 66_000, low: 59_000 })),
    }))
    expect(crossed.allCards[0].state).toBe("no")
    expect(crossed.allCards[0].now).toMatch(/^The last candle crossed/)
  })

  it("finds a named line on whichever coin is open", () => {
    const card: RuleCard = {
      type: "line",
      line: "weekly support",
      position: "within",
      percent: 1,
    }
    const near = judgeRule(rule({ cards: [card] }), facts({
      drawings: [level(59_700, "Weekly support"), level(60_100)],
    }))
    expect(near.state).toBe("no")
    expect(near.allCards[0].now).toBe('$60,000 is 0.50% from "Weekly support" at $59,700.')
    const missing = judgeRule(rule({ cards: [card] }), facts({ drawings: [level(60_100)] }))
    expect(missing.state).toBe("unknown")
  })

  it("asks for lines above and below, the way the old rule did", () => {
    expect(
      countLinesAroundPrice(
        [level(62_000), level(60_000), level(58_000), vertical(61_000)],
        "either",
        60_000,
        NOW
      )
    ).toEqual({ above: 1, below: 1, onPrice: 1 })
    const result = judgeRule(
      rule({ cards: [{ type: "lines", count: 2, kinds: "either" }] }),
      facts({ drawings: [level(62_000), level(58_000)] })
    )
    expect(result.state).toBe("yes")
    expect(result.cards[0].now).toBe("You have 1 above and 1 below.")
  })

  it("never holds a first order on a coin for the last-order condition", () => {
    const card: RuleCard = { type: "timeSinceLastOrder", minutes: 5 }
    expect(judgeRule(rule({ cards: [card] }), facts()).state).toBe("no")
    expect(
      judgeRule(rule({ cards: [card] }), facts({ lastOrderAt: NOW - 60_000 })).state
    ).toBe("yes")
  })

  it("skips the preparation conditions for a trade already held", () => {
    const held = facts({ moment: "holding", onChartForMs: 0 })
    expect(
      judgeRule(rule({ cards: [{ type: "timeOnChart", minutes: 3 }] }), held).state
    ).toBe("no")
    // 17 others and this one make 18, past a limit of 5.
    const mixed = judgeRule(
      rule({ cards: [{ type: "timeOnChart", minutes: 3 }, AT_MOST_FIVE_GRIDS] }),
      { ...held, gridsOnExchange: 17 }
    )
    expect(mixed.state).toBe("yes")
    expect(mixed.cards[0].now).toBe("18 running on this exchange, this one included.")
    // A fifth grid under "at most 5" is the limit reached, not passed.
    expect(
      judgeRule(rule({ cards: [AT_MOST_FIVE_GRIDS] }), { ...held, gridsOnExchange: 4 })
        .state
    ).toBe("no")
  })
})

describe("the candles the rules ask for", () => {
  it("asks for three times the longest EMA on each timeframe of a switched-on rule", () => {
    const needs = emaCandleNeeds({
      list: [
        rule({ cards: [ABOVE_WEEKLY_50, { ...ABOVE_WEEKLY_50, period: 20 }] }),
        rule({ on: false, cards: [{ ...ABOVE_WEEKLY_50, interval: "4h" }] }),
      ],
    })
    expect([...needs]).toEqual([["1w", 150]])
  })

  it("closes a month on the next first of the month", () => {
    expect(candleClosesAt("1M", Date.UTC(2026, 1, 1))).toBe(Date.UTC(2026, 2, 1))
    expect(candleClosesAt("1w", THIS_WEEK)).toBe(THIS_WEEK + WEEK)
  })
})

describe("the words around the check", () => {
  it("describes a wait in seconds, minutes and hours", () => {
    expect(describeDuration(40_000)).toBe("40 seconds")
    expect(describeDuration(150_000)).toBe("2 minutes 30 seconds")
    expect(describeDuration(HOUR + 5 * 60_000)).toBe("1 hour 5 minutes")
  })

  it("heads the window with how many rules are not met", () => {
    expect(unmetRulesHeading(1)).toBe("1 rule not met")
    expect(unmetRulesHeading(3)).toBe("3 rules not met")
  })

  it("lets rule names onto an order, never one that would split", () => {
    expect(overrodeSchema.safeParse(["Weekly trend guard"]).success).toBe(true)
    expect(overrodeSchema.safeParse(["lines on the chart"]).success).toBe(true)
    expect(overrodeSchema.safeParse(["two, names"]).success).toBe(false)
    expect(overrodeSchema.safeParse([]).success).toBe(false)
  })

  it("writes the override note and reads it back off a Journal row", () => {
    const note = overrodeNote(["Weekly trend guard", "Time on this chart"])
    expect(note).toBe("Overrode: Weekly trend guard, Time on this chart")
    expect(overrodeNames(`${note}. Resting on the exchange.`)).toEqual([
      "Weekly trend guard",
      "Time on this chart",
    ])
    expect(overrodeNames("Resting on the exchange.")).toBeNull()
  })
})

describe("the notes to tick", () => {
  it("reads a rule saved before notes existed as having none", () => {
    const { notes: _none, ...older } = WEEKLY_TREND_GUARD
    expect(readTradingRules({ list: [older] }).list[0].notes).toEqual([])
  })

  it("asks only for notes with words in them", () => {
    const notes = notesOf(
      rule({ notes: ["  Did I check the daily trend?  ", "", "   "] })
    )
    expect(notes.map((note) => note.text)).toEqual([
      "Did I check the daily trend?",
    ])
  })

  it("asks for the notes of switched-on rules that cover the entry", () => {
    const rules = {
      list: [
        rule({ id: "grids", notes: ["Grid note"] }),
        rule({ id: "orders", places: ["order"], notes: ["Order note"] }),
        rule({ id: "off", on: false, places: ["order"], notes: ["Off note"] }),
      ],
    }
    expect(
      notesToTick(rules, { place: "order", side: "buy" }).map((note) => note.text)
    ).toEqual(["Order note"])
    expect(
      notesToTick(rules, { place: "grid", side: "sell" }).map((note) => note.text)
    ).toEqual(["Grid note"])
  })

  it("asks again when a note's words change", () => {
    const [before] = notesOf(rule({ notes: ["Check the trend"] }))
    const [after] = notesOf(rule({ notes: ["Check the weekly trend"] }))
    expect(before.key).not.toBe(after.key)
  })
})
