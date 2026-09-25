import { z } from "zod"

import { priceAtTime, type Drawing } from "@/lib/trade/drawings"
import type { TradeSide } from "@/lib/trade/paper"

/**
 * The rules a person sets for themselves before a real-money entry.
 *
 * Tyler, 4 Sep 2026: "This is not to completely block me from trading, it just
 * gives me a warning and I have to confirm to enter the trade." So nothing
 * here refuses anything. `checkTradingRules` answers which rules are not met
 * and by how much, the chart opens one window that says so, and a confirmed
 * entry goes out as normal with the override written on its Journal row.
 *
 * Never rename a field once saved: the column holds whatever was written. A
 * stop-loss rule existed for a few hours on 4 Sep 2026 and was removed on
 * Tyler's word ("How can I have a stoploss if I didn't even place an
 * order"); a saved row still carrying `stopLoss` is read and the key ignored.
 * Not `MarketRules` — that is the exchange's own limits, in
 * `src/server/trade/market-rules.ts`.
 */

/** Which entries a rule applies to. */
export const RULE_SIDES = ["longs", "shorts", "both"] as const
export type RuleSide = (typeof RULE_SIDES)[number]

/** What counts as a line for the lines rule. */
export const RULE_LINE_KINDS = ["either", "trendline", "level"] as const
export type RuleLineKind = (typeof RULE_LINE_KINDS)[number]

export const TRADING_RULE_KINDS = [
  "lines",
  "timeOnChart",
  "timeSinceLastOrder",
] as const
export type TradingRuleKind = (typeof TRADING_RULE_KINDS)[number]

const sideSchema = z.enum(RULE_SIDES)
const minutesSchema = z.number().int().min(1).max(1440)

export const tradingRulesSchema = z.object({
  /** At least `count` lines above the price and `count` below it, on this coin. */
  lines: z.object({
    on: z.boolean(),
    count: z.number().int().min(1).max(20),
    kinds: z.enum(RULE_LINE_KINDS),
    applies: sideSchema,
  }),
  /** At least `minutes` since this coin was opened on this page. */
  timeOnChart: z.object({
    on: z.boolean(),
    minutes: minutesSchema,
    applies: sideSchema,
  }),
  /** At least `minutes` since the last order placed by hand on this coin. */
  timeSinceLastOrder: z.object({
    on: z.boolean(),
    minutes: minutesSchema,
    applies: sideSchema,
  }),
})

export type TradingRules = z.infer<typeof tradingRulesSchema>

/** Every rule off, with the numbers the rows show when first opened. */
export const DEFAULT_TRADING_RULES: TradingRules = {
  lines: { on: false, count: 2, kinds: "either", applies: "both" },
  timeOnChart: { on: false, minutes: 3, applies: "both" },
  timeSinceLastOrder: { on: false, minutes: 5, applies: "both" },
}

/**
 * Stored rules, or every rule off for a first or unreadable value. Each rule
 * is read on its own, so one rule an older build never wrote comes back at
 * its default without the other three being thrown away.
 */
export function readTradingRules(value: unknown): TradingRules {
  const parsed = tradingRulesSchema.partial().safeParse(value)
  if (!parsed.success) return DEFAULT_TRADING_RULES
  return {
    lines: parsed.data.lines ?? DEFAULT_TRADING_RULES.lines,
    timeOnChart: parsed.data.timeOnChart ?? DEFAULT_TRADING_RULES.timeOnChart,
    timeSinceLastOrder:
      parsed.data.timeSinceLastOrder ??
      DEFAULT_TRADING_RULES.timeSinceLastOrder,
  }
}

export function anyTradingRuleOn(rules: TradingRules): boolean {
  return rules.lines.on || rules.timeOnChart.on || rules.timeSinceLastOrder.on
}

/** The short name each rule goes by in the window and on the Journal row. */
export const TRADING_RULE_NAMES: Record<TradingRuleKind, string> = {
  lines: "lines on the chart",
  timeOnChart: "time on this chart",
  timeSinceLastOrder: "time since the last order",
}

/** One rule that is not met, as the window says it. */
export type UnmetRule = {
  kind: TradingRuleKind
  /** The short name, for the confirm note: "lines on the chart". */
  name: string
  /** The panel's title line: "Lines on the chart". */
  title: string
  /** What was asked for, after "Asked": "2 above and 2 below." */
  asked: string
  /** What is true right now, after "Now": "You have 1 above and 0 below." */
  now: string
  /** The three as one sentence, for a place that has room for one line only. */
  sentence: string
}

/** Builds the rule's three parts and the one-line sentence from them. */
function unmet(
  kind: TradingRuleKind,
  title: string,
  asked: string,
  now: string
): UnmetRule {
  return {
    kind,
    name: TRADING_RULE_NAMES[kind],
    title,
    asked: asked.charAt(0).toUpperCase() + asked.slice(1),
    now,
    sentence: `${title}: you asked for ${asked} ${now}`,
  }
}

/** Everything the check reads. Nothing here is fetched; it is all on screen. */
export type TradingRulesCheck = {
  rules: TradingRules
  side: TradeSide
  /** The lines drawn on this coin. */
  drawings: readonly Drawing[]
  /** The live price, or null when the chart has none yet. */
  price: number | null
  /** How long this coin has been open on this page. */
  onChartForMs: number
  /** When the last order was placed by hand on this coin, or null for never. */
  lastOrderAt: number | null
  now: number
}

function appliesTo(applies: RuleSide, side: TradeSide): boolean {
  if (applies === "both") return true
  return applies === "longs" ? side === "buy" : side === "sell"
}

function entryWord(side: TradeSide): "long" | "short" {
  return side === "buy" ? "long" : "short"
}

function plural(count: number, one: string): string {
  return `${count} ${count === 1 ? one : `${one}s`}`
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

function lineWord(kinds: RuleLineKind): string {
  return kinds === "trendline"
    ? "trendline"
    : kinds === "level"
      ? "level"
      : "line"
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
 * Which switched-on rules this entry does not meet, in the order the settings
 * list them. Empty means the order goes straight out.
 *
 * Pure: the caller decides whether the wallet is real money. A practice
 * wallet never calls this.
 */
export function checkTradingRules(check: TradingRulesCheck): UnmetRule[] {
  const { rules, side, now } = check
  const found: UnmetRule[] = []
  const word = entryWord(side)

  if (rules.lines.on && appliesTo(rules.lines.applies, side)) {
    const asked = rules.lines.count
    const kind = lineWord(rules.lines.kinds)
    const Kind = kind.charAt(0).toUpperCase() + kind.slice(1)
    if (check.price === null) {
      found.push(
        unmet(
          "lines",
          `${Kind}s on the chart`,
          `${asked} above and ${asked} below.`,
          "The chart has no price yet to count them against."
        )
      )
    } else {
      const have = countLinesAroundPrice(
        check.drawings,
        rules.lines.kinds,
        check.price,
        now
      )
      if (have.above < asked || have.below < asked) {
        const onPrice =
          have.onPrice > 0
            ? ` ${plural(have.onPrice, kind)} ${have.onPrice === 1 ? "sits" : "sit"} on the price.`
            : ""
        found.push(
          unmet(
            "lines",
            `${Kind}s on the chart`,
            `${asked} above and ${asked} below.`,
            `You have ${have.above} above and ${have.below} below.${onPrice}`
          )
        )
      }
    }
  }

  if (rules.timeOnChart.on && appliesTo(rules.timeOnChart.applies, side)) {
    const askedMs = rules.timeOnChart.minutes * 60_000
    if (check.onChartForMs < askedMs) {
      found.push(
        unmet(
          "timeOnChart",
          "Time on this chart",
          `${plural(rules.timeOnChart.minutes, "minute")} before a ${word}.`,
          `You have been here ${describeDuration(check.onChartForMs)}.`
        )
      )
    }
  }

  if (
    rules.timeSinceLastOrder.on &&
    appliesTo(rules.timeSinceLastOrder.applies, side) &&
    check.lastOrderAt !== null
  ) {
    const askedMs = rules.timeSinceLastOrder.minutes * 60_000
    const sinceMs = now - check.lastOrderAt
    if (sinceMs < askedMs) {
      found.push(
        unmet(
          "timeSinceLastOrder",
          "Time since the last order",
          `${plural(rules.timeSinceLastOrder.minutes, "minute")} between orders on a coin.`,
          `Your last order on this coin was ${describeDuration(sinceMs)} ago.`
        )
      )
    }
  }

  return found
}

/** The panel's header: "3 rules not met", "1 rule not met". */
export function unmetRulesHeading(count: number): string {
  return `${count} ${count === 1 ? "rule" : "rules"} not met`
}

/** How the Journal row starts when an entry went out against a rule. */
export const OVERRODE_PREFIX = "Overrode: "

/** "Overrode: lines on the chart, time on this chart". */
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
 * What the server accepts as the overridden rule names on an order: only the
 * four names this file knows, so nothing typed by hand can land on a Journal
 * row dressed as a rule.
 */
const RULE_NAME_LIST = TRADING_RULE_KINDS.map(
  (kind) => TRADING_RULE_NAMES[kind]
)
export const overrodeSchema = z
  .array(z.enum(RULE_NAME_LIST as [string, ...string[]]))
  .min(1)
  .max(TRADING_RULE_KINDS.length)
