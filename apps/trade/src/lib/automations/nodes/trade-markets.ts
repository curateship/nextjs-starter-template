import { ListIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { TRADE_PALETTE_GROUP } from "@/lib/automations/nodes/trade-wallet"
import { plural } from "@/lib/format/plural"

/** How far back a test looks when nobody has said otherwise. */
export const DEFAULT_BACKTEST_DAYS = 30

/**
 * The longest window this step will accept.
 *
 * Two years. The prices come from Binance, which serves as far back as a market
 * has existed and is read in pages, so the old worry — an exchange that only
 * keeps about 5,000 bars — does not apply to where these candles actually come
 * from. A coin younger than the window is not a failure: it is reported as
 * skipped, with its gaps recorded.
 *
 * This cap only stops somebody typing 99999 and waiting.
 */
export const MAX_BACKTEST_DAYS = 730

/**
 * A hard ceiling on the LIST, and nothing to do with the work.
 *
 * There are only a few hundred perp markets in existence, so a longer list than
 * this is a mistake or a paste gone wrong.
 */
export const MAX_BACKTEST_MARKETS = 500

/**
 * The most candles one run may hold, across every coin put together.
 *
 * **This is a memory limit, not an opinion.** Every coin's bars are loaded
 * before the walk starts and kept for the whole run, because the coins share
 * one pot and the engine steps them forward together — it cannot read one coin
 * at a time the way the app this is a port of does, which is why that app needs
 * no such rule.
 *
 * Three million is about three hundred megabytes of bars, and it is set from
 * what somebody actually wants: four hundred coins of 4h candles over two years
 * is 1.75 million, comfortably inside. What it still refuses is the shape that
 * would take the process down — four hundred coins of 5-minute candles over two
 * years is eighty-four million bars, which is not a slow run, it is a crash.
 *
 * The old value was a million, which turned that ordinary four-hundred-coin
 * request away at about two hundred and twenty.
 */
export const MAX_BACKTEST_CANDLES = 3_000_000

/**
 * How many coins this candle size and window leave room for.
 *
 * Never more than the list ceiling, and never fewer than one — a window so
 * greedy that not even one coin fits is a window to shorten, and saying "0
 * coins allowed" would send somebody hunting through the coin list instead.
 */
export function coinsAllowedFor(interval: string, days: number): number {
  const each = candlesPerCoin(interval, days)
  return Math.max(
    1,
    Math.min(MAX_BACKTEST_MARKETS, Math.floor(MAX_BACKTEST_CANDLES / each))
  )
}

/** How long one candle lasts, in milliseconds. */
const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** How many candles one coin needs, for this candle size over this many days. */
export function candlesPerCoin(interval: string, days: number): number {
  const ms = INTERVAL_MS[interval] ?? INTERVAL_MS["1h"]
  return Math.max(1, Math.ceil((days * 86_400_000) / ms))
}

export const tradeMarketsSettingsSchema = z.object({
  marketKeys: z
    .array(z.string().min(1))
    .min(1, "Choose at least one coin to test.")
    .max(MAX_BACKTEST_MARKETS),
  days: z.number().int().min(1).max(MAX_BACKTEST_DAYS),
})

export type TradeMarketsSettings = z.infer<typeof tradeMarketsSettingsSchema>

/**
 * Which coins to test, and how far back.
 *
 * The list is written down on the step, as market keys, and that is the point:
 * a run must be repeatable. A step saying "the twenty biggest coins" would mean
 * something different every week, and two runs of the same flow could not be
 * compared. The quick-picks in the panel — volume bands, a random sample —
 * draw their answer **while you are editing** and write the names into the
 * list, so pressing Run never rolls a dice.
 */
export const tradeMarketsNode = defineNode({
  kind: "tradeMarkets",
  palette: {
    key: "trade-markets",
    group: TRADE_PALETTE_GROUP,
    description: "Which coins to test, and how far back",
  },
  createSettings: () => ({ marketKeys: [], days: DEFAULT_BACKTEST_DAYS }),
  settingsSchema: tradeMarketsSettingsSchema,
  name: () => "Markets to test",
  description: (settings) => {
    const keys = Array.isArray(settings.marketKeys)
      ? settings.marketKeys.length
      : 0
    const days = typeof settings.days === "number" ? settings.days : null
    if (keys === 0) return "No coins chosen yet."
    return `${keys} ${plural(keys, "coin", "coins")}${days === null ? "" : `, over the last ${days} ${plural(days, "day", "days")}`}.`
  },
  icon: ListIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/trade-markets-panel"),
})
