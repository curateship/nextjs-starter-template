import { z } from "zod"

import type { CandleBar } from "@/lib/protocols/contracts"
import { intervalMs } from "@/lib/trade/chart-history"
import { CHART_INTERVALS, type ChartInterval } from "@/lib/trade/chart-interval"
import { priceAtTime, type Drawing } from "@/lib/trade/drawings"
import { formatPrice } from "@/lib/trade/format"
import { ema } from "@/lib/trade/indicators/ema"
import type { TradeSide } from "@/lib/trade/paper"

/**
 * The rules a person builds for themselves before a real-money entry.
 *
 * A rule is a stack of cards, the way a contact segment is built: each card
 * is something that must hold before Tyler trades ("price is above EMA 50 on
 * 1 week", "at most 5 grids in this wallet"). A card that holds is ticked; one
 * that does not gets a cross, and the rule warns or blocks. The rule says
 * which entries it covers, and whether every card must hold or any one is
 * enough. Tyler, 15 Oct 2026, chose this over a node canvas, chose Warn or
 * Block per rule, and, shown a tick beside "At least 5 grids in this wallet"
 * with 18 running, said "this should be an x".
 *
 * Warn is the 4 Sep 2026 rule unchanged: "This is not to completely block me
 * from trading, it just gives me a warning and I have to confirm to enter the
 * trade." Block refuses the entry, with only Go back. Neither ever touches an
 * exit.
 *
 * Saved in `trade_prefs.trading_rules` as `{ list: [...] }`. The column used
 * to hold four fixed rules (`lines`, `timeOnChart`, `timeSinceLastOrder`,
 * `gridsPerExchange`); a row still in that shape is read as one Warn rule per
 * switched-on old rule, and the first save writes the new shape. Never rename
 * a field once saved. Not `MarketRules`, which is the exchange's own limits in
 * `src/server/trade/market-rules.ts`.
 */

export const MAX_TRADING_RULES = 30
export const MAX_RULE_CARDS = 20
export const MAX_RULE_NOTES = 10
export const MAX_RULE_NOTE_LENGTH = 200

/** Which way an entry goes. */
export const RULE_SIDES = ["both", "longs", "shorts"] as const
export type RuleSide = (typeof RULE_SIDES)[number]

/** What is being placed: a Long or Short order, a DCA ladder, or a grid. */
export const RULE_PLACES = ["order", "dca", "grid"] as const
export type RulePlace = (typeof RULE_PLACES)[number]

const RULE_MATCHES = ["all", "any"] as const
export type RuleMatch = (typeof RULE_MATCHES)[number]

const RULE_ENDS = ["warn", "block"] as const
export type RuleEnd = (typeof RULE_ENDS)[number]

/** What counts as a line for the lines card. */
export const RULE_LINE_KINDS = ["either", "trendline", "level"] as const
export type RuleLineKind = (typeof RULE_LINE_KINDS)[number]

/** Which price an EMA card reads against the average. */
export const EMA_READINGS = ["now", "close", "candle"] as const
export type EmaReading = (typeof EMA_READINGS)[number]

export const LINE_POSITIONS = ["above", "under", "within"] as const
export type LinePosition = (typeof LINE_POSITIONS)[number]

const countSchema = z.number().int().min(1).max(200)
const minutesSchema = z.number().int().min(1).max(1440)

/**
 * A rule's name is what the Journal row lists after "Overrode: ", joined with
 * commas and ended with a full stop, so neither may appear inside one.
 */
export const ruleNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((name) => !/[,.]/.test(name))

export const ruleCardSchema = z.discriminatedUnion("type", [
  /** Price is above or under an EMA on one timeframe. */
  z.object({
    type: z.literal("ema"),
    position: z.enum(["above", "under"]),
    period: z.number().int().min(2).max(400),
    interval: z.enum(CHART_INTERVALS),
    reading: z.enum(EMA_READINGS),
  }),
  /**
   * Price is above, under or within a percent of a line. `line` is a line's
   * name, matched on whichever coin is open, or null for the nearest line.
   */
  z.object({
    type: z.literal("line"),
    line: z.string().trim().min(1).max(60).nullable(),
    position: z.enum(LINE_POSITIONS),
    percent: z.number().min(0.01).max(50),
  }),
  /** At most `count` real-money grids running on this exchange, the new one included. */
  z.object({ type: z.literal("gridsOnExchange"), count: countSchema }),
  /** At most `count` grids running in the wallet being used. */
  z.object({ type: z.literal("gridsInWallet"), count: countSchema }),
  /** At most `count` real-money grids running on this coin. */
  z.object({ type: z.literal("gridsOnCoin"), count: countSchema }),
  /** At most `count` real-money positions open on this exchange. */
  z.object({ type: z.literal("positionsOnExchange"), count: countSchema }),
  /** At least `count` lines above the price and `count` below it. */
  z.object({
    type: z.literal("lines"),
    count: z.number().int().min(1).max(20),
    kinds: z.enum(RULE_LINE_KINDS),
  }),
  /** At least `minutes` since this coin was opened on this page. */
  z.object({ type: z.literal("timeOnChart"), minutes: minutesSchema }),
  /** At least `minutes` since the last order placed by hand on this coin. */
  z.object({ type: z.literal("timeSinceLastOrder"), minutes: minutesSchema }),
  /**
   * A saved card this build could not read, kept in its place so the rule
   * still shows it in red and never quietly loses a condition.
   */
  z.object({ type: z.literal("unreadable") }),
])

export type RuleCard = z.infer<typeof ruleCardSchema>
export type RuleCardType = RuleCard["type"]

export const tradingRuleSchema = z.object({
  id: z.string().min(1).max(64),
  name: ruleNameSchema,
  on: z.boolean(),
  /** Empty covers nothing, so the rule never counts until something is ticked. */
  places: z.array(z.enum(RULE_PLACES)).max(RULE_PLACES.length),
  sides: z.enum(RULE_SIDES),
  match: z.enum(RULE_MATCHES),
  then: z.enum(RULE_ENDS),
  cards: z.array(ruleCardSchema).max(MAX_RULE_CARDS),
  /**
   * Tyler's own bullet points for the rule, 15 Oct 2026: "make it a checkbox
   * on the trading chart that I must check off before I can place a trade".
   * Every note on a switched-on rule that covers an entry must be ticked on
   * the chart before that entry goes out, whatever the conditions say. A
   * blank note is kept while it is being typed and asks for nothing.
   */
  notes: z.array(z.string().max(MAX_RULE_NOTE_LENGTH)).max(MAX_RULE_NOTES),
})

export type TradingRule = z.infer<typeof tradingRuleSchema>

export const tradingRulesSchema = z.object({
  list: z.array(tradingRuleSchema).max(MAX_TRADING_RULES),
})

export type TradingRules = z.infer<typeof tradingRulesSchema>

export const DEFAULT_TRADING_RULES: TradingRules = { list: [] }

/** The card types offered in "Add a rule", in the order the menu lists them. */
export const ADDABLE_CARD_TYPES = [
  "ema",
  "line",
  "gridsOnExchange",
  "gridsInWallet",
  "gridsOnCoin",
  "positionsOnExchange",
  "lines",
  "timeOnChart",
  "timeSinceLastOrder",
] as const satisfies readonly Exclude<RuleCardType, "unreadable">[]

export type AddableCardType = (typeof ADDABLE_CARD_TYPES)[number]

export const RULE_CARD_TITLES: Record<RuleCardType, string> = {
  ema: "EMA",
  line: "Price and a line",
  gridsOnExchange: "Grids on this exchange",
  gridsInWallet: "Grids in this wallet",
  gridsOnCoin: "Grids on this coin",
  positionsOnExchange: "Open positions on this exchange",
  lines: "Lines on the chart",
  timeOnChart: "Time on this chart",
  timeSinceLastOrder: "Time since the last order",
  unreadable: "A card that could not be read",
}

/** A fresh card, with the numbers it shows when first added. */
export function newRuleCard(type: AddableCardType): RuleCard {
  switch (type) {
    case "ema":
      return {
        type,
        position: "under",
        period: 50,
        interval: "1w",
        reading: "now",
      }
    case "line":
      return { type, line: null, position: "within", percent: 1 }
    case "gridsOnExchange":
      return { type, count: 10 }
    case "gridsInWallet":
      return { type, count: 5 }
    case "gridsOnCoin":
      return { type, count: 1 }
    case "positionsOnExchange":
      return { type, count: 5 }
    case "lines":
      return { type, count: 2, kinds: "either" }
    case "timeOnChart":
      return { type, minutes: 3 }
    case "timeSinceLastOrder":
      return { type, minutes: 5 }
  }
}

/** A fresh rule, switched on, warning about any entry, with no cards yet. */
export function newTradingRule(id: string, name: string): TradingRule {
  return {
    id,
    name,
    on: true,
    places: [...RULE_PLACES],
    sides: "both",
    match: "all",
    then: "warn",
    cards: [],
    notes: [],
  }
}

/** "Rule 3", the first number no rule is called yet. */
export function nextRuleName(rules: readonly TradingRule[]): string {
  const taken = new Set(rules.map((rule) => rule.name.toLowerCase()))
  for (let number = rules.length + 1; ; number += 1) {
    const name = `Rule ${number}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

// --- Reading what was saved -------------------------------------------------

const oldSideSchema = z.enum(["longs", "shorts", "both"])
const oldRulesSchema = z
  .object({
    lines: z.object({
      on: z.boolean(),
      count: z.number().int().min(1).max(20),
      kinds: z.enum(RULE_LINE_KINDS),
      applies: oldSideSchema,
    }),
    timeOnChart: z.object({
      on: z.boolean(),
      minutes: minutesSchema,
      applies: oldSideSchema,
    }),
    timeSinceLastOrder: z.object({
      on: z.boolean(),
      minutes: minutesSchema,
      applies: oldSideSchema,
    }),
    gridsPerExchange: z.object({ on: z.boolean(), count: countSchema }),
  })
  .partial()

/**
 * The four fixed rules the column held until 15 Oct 2026, as one Warn rule
 * each for every one that was switched on. Their numbers carry over exactly,
 * and the ids are fixed so the table stays steady until the first save.
 */
function fromOldRules(value: unknown): TradingRule[] {
  const parsed = oldRulesSchema.safeParse(value)
  if (!parsed.success) return []
  const old = parsed.data
  const list: TradingRule[] = []
  const rule = (
    id: string,
    name: string,
    places: RulePlace[],
    sides: RuleSide,
    card: RuleCard
  ): TradingRule => ({
    id,
    name,
    on: true,
    places,
    sides,
    match: "all",
    then: "warn",
    cards: [card],
    notes: [],
  })
  if (old.lines?.on) {
    list.push(
      rule("old-lines", "Lines on the chart", [...RULE_PLACES], old.lines.applies, {
        type: "lines",
        count: old.lines.count,
        kinds: old.lines.kinds,
      })
    )
  }
  if (old.timeOnChart?.on) {
    list.push(
      rule(
        "old-time-on-chart",
        "Time on this chart",
        [...RULE_PLACES],
        old.timeOnChart.applies,
        { type: "timeOnChart", minutes: old.timeOnChart.minutes }
      )
    )
  }
  if (old.timeSinceLastOrder?.on) {
    list.push(
      rule(
        "old-time-since-last-order",
        "Time since the last order",
        [...RULE_PLACES],
        old.timeSinceLastOrder.applies,
        { type: "timeSinceLastOrder", minutes: old.timeSinceLastOrder.minutes }
      )
    )
  }
  if (old.gridsPerExchange?.on) {
    list.push(
      rule("old-grids-per-exchange", "Grids on one exchange", ["grid"], "both", {
        type: "gridsOnExchange",
        count: old.gridsPerExchange.count,
      })
    )
  }
  return list
}

const storedRuleSchema = tradingRuleSchema.extend({
  cards: z.array(z.unknown()).max(MAX_RULE_CARDS),
  // Rules saved before notes existed have none.
  notes: tradingRuleSchema.shape.notes.default([]),
})

/**
 * Stored rules, read one rule and one card at a time. A rule that cannot be
 * read is dropped; a card that cannot be read stays as an "unreadable" card,
 * so the rule says so in red instead of quietly checking less than it did.
 */
export function readTradingRules(value: unknown): TradingRules {
  if (value === null || typeof value !== "object") return DEFAULT_TRADING_RULES
  const list = (value as { list?: unknown }).list
  if (!Array.isArray(list)) return { list: fromOldRules(value) }
  const rules: TradingRule[] = []
  for (const stored of list.slice(0, MAX_TRADING_RULES)) {
    const parsed = storedRuleSchema.safeParse(stored)
    if (!parsed.success) continue
    rules.push({
      ...parsed.data,
      cards: parsed.data.cards.map((card): RuleCard => {
        const read = ruleCardSchema.safeParse(card)
        return read.success ? read.data : { type: "unreadable" }
      }),
    })
  }
  return { list: rules }
}

export function anyTradingRuleOn(rules: TradingRules): boolean {
  return rules.list.some((rule) => rule.on)
}

/** One bullet to tick on the chart before an entry. */
export type RuleNote = {
  /** Changes when the text does, so an edited note asks to be ticked again. */
  key: string
  ruleId: string
  ruleName: string
  text: string
  /**
   * The note's rule is set to Block, so the entry waits until it is ticked.
   * A Warn rule's note is a reminder the entry can go past "anyway" (Tyler,
   * 15 Oct 2026).
   */
  holds: boolean
}

/** A rule's notes that have words in them. */
export function notesOf(rule: TradingRule): RuleNote[] {
  return rule.notes.flatMap((text, index) => {
    const trimmed = text.trim()
    return trimmed === ""
      ? []
      : [
          {
            key: `${rule.id}:${index}:${trimmed}`,
            ruleId: rule.id,
            ruleName: rule.name,
            text: trimmed,
            holds: rule.then === "block",
          },
        ]
  })
}

/** The notes to tick before an entry: every note on every switched-on rule that covers it. */
export function notesToTick(rules: TradingRules, entry: RuleEntry): RuleNote[] {
  return rules.list
    .filter((rule) => rule.on && ruleCovers(rule, entry))
    .flatMap(notesOf)
}

// --- Words ------------------------------------------------------------------

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "40 seconds", "3 minutes", "2 minutes 30 seconds", "1 hour 5 minutes". */
export function describeDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return plural(totalSeconds, "second")
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60
    return seconds === 0
      ? plural(totalMinutes, "minute")
      : `${plural(totalMinutes, "minute")} ${plural(seconds, "second")}`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0
    ? plural(hours, "hour")
    : `${plural(hours, "hour")} ${plural(minutes, "minute")}`
}

export const INTERVAL_LABELS: Record<ChartInterval, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
  "4h": "4 hours",
  "1d": "1 day",
  "1w": "1 week",
  "1M": "1 month",
}

/** The candle's own name inside a sentence: "the last weekly candle". */
const CANDLE_WORDS: Record<ChartInterval, string> = {
  "1m": "1-minute",
  "5m": "5-minute",
  "15m": "15-minute",
  "1h": "hourly",
  "4h": "4-hour",
  "1d": "daily",
  "1w": "weekly",
  "1M": "monthly",
}

function lineWord(kinds: RuleLineKind): string {
  return kinds === "trendline"
    ? "trendline"
    : kinds === "level"
      ? "level"
      : "line"
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "\"Weekly support\"" for a named line, "the nearest line" otherwise. */
function lineCalled(line: string | null): string {
  return line === null ? "the nearest line" : `"${line}"`
}

/**
 * The card as one sentence: what must hold. It is the summary under a rule's
 * name in the table.
 */
export function describeRuleCard(card: RuleCard): string {
  switch (card.type) {
    case "ema": {
      // A candle reading already names its timeframe.
      const word = CANDLE_WORDS[card.interval]
      return card.reading === "now"
        ? `Price is ${card.position} EMA ${card.period} on ${INTERVAL_LABELS[card.interval]}`
        : card.reading === "close"
          ? `The last ${word} close is ${card.position} EMA ${card.period}`
          : `The whole last ${word} candle is ${card.position} EMA ${card.period}`
    }
    case "line":
      return card.position === "within"
        ? `Price is within ${card.percent}% of ${lineCalled(card.line)}`
        : `Price is ${card.position} ${lineCalled(card.line)}`
    case "gridsOnExchange":
      return `At most ${plural(card.count, "real-money grid")} running on this exchange`
    case "gridsInWallet":
      return `At most ${plural(card.count, "grid")} running in this wallet`
    case "gridsOnCoin":
      return `At most ${plural(card.count, "real-money grid")} running on this coin`
    case "positionsOnExchange":
      return `At most ${plural(card.count, "real-money position")} open on this exchange`
    case "lines": {
      const word = lineWord(card.kinds)
      return `At least ${plural(card.count, word)} above the price and ${card.count} below it`
    }
    case "timeOnChart":
      return `At least ${plural(card.minutes, "minute")} on this chart`
    case "timeSinceLastOrder":
      return `At least ${plural(card.minutes, "minute")} since the last order on this coin`
    case "unreadable":
      return "This card was saved by a different version of Trade and cannot be read here"
  }
}

const READING_WORDS: Record<EmaReading, string> = {
  now: "",
  close: ", last close",
  candle: ", whole last candle",
}

/**
 * The condition as a short tick-box line, with no prices: "EMA 50 on 1 week
 * timeframe is above". Tyler, 15 Oct 2026, of the longer sentence: "there is
 * too much text and i dont care about the price".
 */
export function ruleCardLabel(card: RuleCard): string {
  switch (card.type) {
    case "ema":
      return `EMA ${card.period} on ${INTERVAL_LABELS[card.interval]} timeframe is ${card.position}${READING_WORDS[card.reading]}`
    case "line":
      return card.position === "within"
        ? `Within ${card.percent}% of ${lineCalled(card.line)}`
        : `${capitalised(card.position)} ${lineCalled(card.line)}`
    case "gridsOnExchange":
      return `At most ${plural(card.count, "grid")} on this exchange`
    case "gridsInWallet":
      return `At most ${plural(card.count, "grid")} in this wallet`
    case "gridsOnCoin":
      return `At most ${plural(card.count, "grid")} on this coin`
    case "positionsOnExchange":
      return `At most ${plural(card.count, "position")} on this exchange`
    case "lines":
      return `At least ${plural(card.count, lineWord(card.kinds))} above and below`
    case "timeOnChart":
      return `At least ${plural(card.minutes, "minute")} on this chart`
    case "timeSinceLastOrder":
      return `At least ${plural(card.minutes, "minute")} since the last order`
    case "unreadable":
      return "A condition this version cannot read"
  }
}

const PLACE_WORDS: Record<RulePlace, string> = {
  order: "orders",
  dca: "DCA ladders",
  grid: "grids",
}

/** "Any entry", "Grids", "Long orders and DCA ladders", "Nothing yet". */
export function describeRuleCovers(rule: TradingRule): string {
  if (rule.places.length === 0) return "Nothing yet"
  const all = rule.places.length === RULE_PLACES.length
  const side =
    rule.sides === "longs" ? "Long " : rule.sides === "shorts" ? "Short " : ""
  if (all) return side === "" ? "Any entry" : `${side}entries`
  const places = RULE_PLACES.filter((place) => rule.places.includes(place)).map(
    (place) => PLACE_WORDS[place]
  )
  const listed =
    places.length === 1
      ? places[0]
      : `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`
  return capitalised(`${side}${listed}`)
}

// --- Judging ----------------------------------------------------------------

/** The candles a timeframe has, as far as the caller has them. */
export type RuleBars =
  | { status: "ready"; bars: readonly CandleBar[] }
  | { status: "loading" }
  | { status: "failed" }

/**
 * Everything the cards read. Nothing here is fetched by this file; the chart
 * hands over what it has on screen.
 *
 * `moment` says whether an entry is about to be placed or a trade is already
 * held. Holding skips the cards about how an entry was prepared (lines, time
 * on the chart, time since the last order), and the counts it is given leave
 * out the held trade itself, so a fifth grid under an "at least 5" rule is
 * the limit reached, not passed.
 */
export type RuleFacts = {
  moment: "entry" | "holding"
  /** The live price, or null when the chart has none yet. */
  price: number | null
  /** The lines drawn on this coin. */
  drawings: readonly Drawing[]
  /** How long this coin has been open on this page. */
  onChartForMs: number
  /** When the last order was placed by hand on this coin, or null for never. */
  lastOrderAt: number | null
  gridsOnExchange: number
  gridsInWallet: number
  gridsOnCoin: number
  positionsOnExchange: number
  candles: (interval: ChartInterval) => RuleBars
  now: number
}

/** What is being placed, or what is held. */
export type RuleEntry = { place: RulePlace; side: TradeSide }

/**
 * For a card, "yes" means it holds right now. For a rule, "yes" means it is
 * broken and warns or blocks. "unknown": it cannot tell yet.
 */
export type RuleState = "yes" | "no" | "unknown"

export type CardResult = {
  card: RuleCard
  /** The card as a short line: "EMA 50 on 1 week timeframe is above". */
  label: string
  state: RuleState
  /** What is true right now: "$60,000 is under $64,000". */
  now: string
}

export type RuleResult = {
  rule: TradingRule
  state: RuleState
  /** The cards that do not hold and broke the rule, or that could not tell. */
  cards: CardResult[]
  /** Every card the rule checked, holding or not, for the chart's rules box. */
  allCards: CardResult[]
  /** True only when the rule is set to Block and every card it needs is known. */
  blocks: boolean
}

const ENTRY_ONLY: ReadonlySet<RuleCardType> = new Set<RuleCardType>([
  "lines",
  "timeOnChart",
  "timeSinceLastOrder",
])

/** Whether the card says anything about a trade already held. */
function cardWatchesHeldTrades(card: RuleCard): boolean {
  return !ENTRY_ONLY.has(card.type)
}

/** When a candle that opened at `openTime` closes. A month runs to the next 1st. */
export function candleClosesAt(interval: ChartInterval, openTime: number): number {
  if (interval === "1M") {
    const date = new Date(openTime)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }
  return openTime + intervalMs(interval)
}

/** How many candles an EMA card asks for, so the average has settled. */
function emaCandlesWanted(period: number): number {
  return period * 3
}

/**
 * The timeframes the switched-on rules' EMA conditions read, each with the
 * most candles any of them asks for. The chart loads exactly these.
 */
export function emaCandleNeeds(rules: TradingRules): Map<ChartInterval, number> {
  const needs = new Map<ChartInterval, number>()
  for (const rule of rules.list) {
    if (!rule.on) continue
    for (const card of rule.cards) {
      if (card.type !== "ema") continue
      const wanted = emaCandlesWanted(card.period)
      needs.set(card.interval, Math.max(needs.get(card.interval) ?? 0, wanted))
    }
  }
  return needs
}

function relation(price: number, line: number): "above" | "under" | "on" {
  return price > line ? "above" : price < line ? "under" : "on"
}

function answer(state: RuleState, now: string) {
  return { state, now }
}

function judgeEma(
  card: Extract<RuleCard, { type: "ema" }>,
  facts: RuleFacts
): { state: RuleState; now: string } {
  const word = CANDLE_WORDS[card.interval]
  const got = facts.candles(card.interval)
  if (got.status === "loading") {
    return answer("unknown", `The ${word} candles are still loading.`)
  }
  if (got.status === "failed") {
    return answer("unknown", `The ${word} candles could not be loaded.`)
  }
  const closed = got.bars.filter(
    (bar) => candleClosesAt(card.interval, bar.openTime) <= facts.now
  )
  if (closed.length < card.period) {
    return answer(
      "unknown",
      `EMA ${card.period} needs ${plural(card.period, `closed ${word} candle`)}. This coin has ${closed.length}.`
    )
  }
  const average = ema(
    closed.map((bar) => bar.close),
    card.period
  )
  const value = average[average.length - 1]
  const last = closed[closed.length - 1]
  const at = formatPrice(value)

  if (card.reading === "now") {
    if (facts.price === null) {
      return answer("unknown", "The chart has no price yet.")
    }
    const side = relation(facts.price, value)
    return answer(
      side === card.position ? "yes" : "no",
      side === "on"
        ? `${formatPrice(facts.price)} sits on ${at}.`
        : `${formatPrice(facts.price)} is ${side} ${at}.`
    )
  }

  if (card.reading === "close") {
    const side = relation(last.close, value)
    return answer(
      side === card.position ? "yes" : "no",
      `The last close, ${formatPrice(last.close)}, is ${side === "on" ? "on" : side} ${at}.`
    )
  }

  if (last.high < value) {
    return answer(
      card.position === "under" ? "yes" : "no",
      `The whole last candle, up to its high of ${formatPrice(last.high)}, is under ${at}.`
    )
  }
  if (last.low > value) {
    return answer(
      card.position === "above" ? "yes" : "no",
      `The whole last candle, down to its low of ${formatPrice(last.low)}, is above ${at}.`
    )
  }
  return answer(
    "no",
    `The last candle crossed ${at}, from ${formatPrice(last.low)} to ${formatPrice(last.high)}.`
  )
}

function judgeLine(
  card: Extract<RuleCard, { type: "line" }>,
  facts: RuleFacts
): { state: RuleState; now: string } {
  if (facts.price === null) {
    return answer("unknown", "The chart has no price yet.")
  }
  const price = facts.price
  const wanted = card.line?.trim().toLowerCase() ?? null
  let nearest: { price: number; name: string | null } | null = null
  for (const drawing of facts.drawings) {
    const name = drawing.shape.name?.trim() ?? null
    if (wanted !== null && name?.toLowerCase() !== wanted) continue
    const linePrice = priceAtTime(drawing.shape, facts.now)
    if (linePrice === null) continue
    if (
      nearest === null ||
      Math.abs(price - linePrice) < Math.abs(price - nearest.price)
    ) {
      nearest = { price: linePrice, name }
    }
  }
  if (nearest === null) {
    return wanted === null
      ? answer("no", "There are no lines on this coin.")
      : answer("unknown", `No line on this coin is named "${card.line}".`)
  }
  const called =
    nearest.name !== null
      ? `"${nearest.name}" at ${formatPrice(nearest.price)}`
      : `the line at ${formatPrice(nearest.price)}`
  if (card.position === "within") {
    const percent = (Math.abs(price - nearest.price) / nearest.price) * 100
    const shown = percent < 10 ? percent.toFixed(2) : percent.toFixed(1)
    return answer(
      percent <= card.percent ? "yes" : "no",
      `${formatPrice(price)} is ${shown}% from ${called}.`
    )
  }
  const side = relation(price, nearest.price)
  return answer(
    side === card.position ? "yes" : "no",
    side === "on"
      ? `${formatPrice(price)} sits on ${called}.`
      : `${formatPrice(price)} is ${side} ${called}.`
  )
}

/**
 * How many lines sit above the price, below it, and on it right now. A
 * vertical trendline has no price and counts for none of the three.
 */
export function countLinesAroundPrice(
  drawings: readonly Drawing[],
  kinds: RuleLineKind,
  price: number,
  now: number
): { above: number; below: number; onPrice: number } {
  let above = 0
  let below = 0
  let onPrice = 0
  for (const drawing of drawings) {
    if (kinds !== "either" && drawing.shape.kind !== kinds) continue
    const linePrice = priceAtTime(drawing.shape, now)
    if (linePrice === null) continue
    if (linePrice > price) above += 1
    else if (linePrice < price) below += 1
    else onPrice += 1
  }
  return { above, below, onPrice }
}

/**
 * "At most N" holds while the total stays at N or under. For an entry the
 * total is what runs now plus the one being placed. For a held trade `have`
 * already leaves the trade out, and it is added back, so a fifth grid under
 * "at most 5" holds and a sixth does not.
 */
function judgeCount(
  count: number,
  have: number,
  where: string,
  held: boolean
): { state: RuleState; now: string } {
  const total = have + 1
  const now = held
    ? `${total} ${where}, this one included.`
    : `You have ${have} ${where}, so this one makes ${total}.`
  return answer(total <= count ? "yes" : "no", now)
}

/** One card against what is true right now. */
function judgeRuleCard(
  card: RuleCard,
  facts: RuleFacts
): { state: RuleState; now: string } {
  const held = facts.moment === "holding"
  switch (card.type) {
    case "ema":
      return judgeEma(card, facts)
    case "line":
      return judgeLine(card, facts)
    case "gridsOnExchange":
      return judgeCount(
        card.count,
        facts.gridsOnExchange,
        "running on this exchange",
        held
      )
    case "gridsInWallet":
      return judgeCount(
        card.count,
        facts.gridsInWallet,
        "running in this wallet",
        held
      )
    case "gridsOnCoin":
      return judgeCount(
        card.count,
        facts.gridsOnCoin,
        "running on this coin",
        held
      )
    case "positionsOnExchange":
      return judgeCount(
        card.count,
        facts.positionsOnExchange,
        "open on this exchange",
        held
      )
    case "lines": {
      if (facts.price === null) {
        return answer("unknown", "The chart has no price yet to count them against.")
      }
      const word = lineWord(card.kinds)
      const have = countLinesAroundPrice(
        facts.drawings,
        card.kinds,
        facts.price,
        facts.now
      )
      const onPrice =
        have.onPrice > 0
          ? ` ${plural(have.onPrice, word)} ${have.onPrice === 1 ? "sits" : "sit"} on the price.`
          : ""
      return answer(
        have.above >= card.count && have.below >= card.count ? "yes" : "no",
        `You have ${have.above} above and ${have.below} below.${onPrice}`
      )
    }
    case "timeOnChart":
      return answer(
        facts.onChartForMs >= card.minutes * 60_000 ? "yes" : "no",
        `You have been here ${describeDuration(facts.onChartForMs)}.`
      )
    case "timeSinceLastOrder": {
      if (facts.lastOrderAt === null) {
        return answer("yes", "There is no earlier order on this coin.")
      }
      const since = facts.now - facts.lastOrderAt
      return answer(
        since >= card.minutes * 60_000 ? "yes" : "no",
        `Your last order on this coin was ${describeDuration(since)} ago.`
      )
    }
    case "unreadable":
      return answer("unknown", "Open the rule and remove this card or add it again.")
  }
}

/** Whether a rule is about this kind of entry at all. */
export function ruleCovers(rule: TradingRule, entry: RuleEntry): boolean {
  if (!rule.places.includes(entry.place)) return false
  if (rule.sides === "both") return true
  return rule.sides === "longs" ? entry.side === "buy" : entry.side === "sell"
}

/**
 * Every card of a rule against what is true right now, and whether the rule
 * is broken. A card's "yes" means it holds; the rule's "yes" means it is
 * broken and warns or blocks. All: one card that does not hold breaks it.
 * Any: one card that holds is enough to keep it. A card that cannot tell
 * keeps the rule at "unknown" rather than either.
 */
export function judgeRule(rule: TradingRule, facts: RuleFacts): RuleResult {
  const cards = rule.cards
    .filter((card) => facts.moment === "entry" || cardWatchesHeldTrades(card))
    .map((card): CardResult => {
      const judged = judgeRuleCard(card, facts)
      return { card, label: ruleCardLabel(card), ...judged }
    })
  const states = cards.map((card) => card.state)
  let state: RuleState
  if (states.length === 0) state = "no"
  else if (rule.match === "all") {
    state = states.includes("no")
      ? "yes"
      : states.includes("unknown")
        ? "unknown"
        : "no"
  } else {
    state = states.includes("yes")
      ? "no"
      : states.includes("unknown")
        ? "unknown"
        : "yes"
  }
  return {
    rule,
    state,
    cards:
      state === "no" ? [] : cards.filter((card) => card.state !== "yes"),
    allCards: cards,
    blocks: rule.then === "block" && state === "yes",
  }
}

/**
 * The switched-on rules that cover this entry and count right now, in the
 * order the table lists them. Empty means the order goes straight out. A rule
 * that cannot tell is listed too, as a warning, never as a block.
 *
 * Pure: the caller decides whether the wallet is real money. A practice
 * wallet never calls this.
 */
export function checkTradingRules(
  rules: TradingRules,
  entry: RuleEntry,
  facts: RuleFacts
): RuleResult[] {
  return rules.list
    .filter((rule) => rule.on && ruleCovers(rule, entry))
    .map((rule) => judgeRule(rule, facts))
    .filter((result) => result.state !== "no")
}

/** The panel's header: "3 rules not met", "1 rule not met". */
export function unmetRulesHeading(count: number): string {
  return `${count} ${count === 1 ? "rule" : "rules"} not met`
}

/** "Blocked by Weekly trend guard", "Blocked by 2 rules". */
export function blockedHeading(results: readonly RuleResult[]): string {
  const blocking = results.filter((result) => result.blocks)
  return blocking.length === 1
    ? `Blocked by ${blocking[0].rule.name}`
    : `Blocked by ${plural(blocking.length, "rule")}`
}

// --- The Journal note -------------------------------------------------------

/** How the Journal row starts when an entry went out against a rule. */
export const OVERRODE_PREFIX = "Overrode: "

/** "Overrode: Weekly trend guard, Time on this chart". */
export function overrodeNote(names: readonly string[]): string {
  return `${OVERRODE_PREFIX}${names.join(", ")}`
}

/** The rule names back out of a Journal note, or null for any other note. */
export function overrodeNames(note: string | null): string[] | null {
  if (!note || !note.startsWith(OVERRODE_PREFIX)) return null
  const rest = note.slice(OVERRODE_PREFIX.length)
  // The placement sentence may follow on the same note, after a full stop.
  const names = rest.split(". ")[0].replace(/\.$/, "")
  return names
    .split(", ")
    .map((name) => name.trim())
    .filter((name) => name !== "")
}

/**
 * What the server accepts as the overridden rule names on an order: rule
 * names as a rule may be named, so a comma or full stop cannot split one
 * name into two on the Journal row.
 */
export const overrodeSchema = z
  .array(ruleNameSchema)
  .min(1)
  .max(MAX_TRADING_RULES)
