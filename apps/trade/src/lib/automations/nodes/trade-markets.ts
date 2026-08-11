import { ListIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { BASE_STOP_BARS, BASE_STOP_INTERVAL } from "@/lib/trade/dca"
import { TRADE_PALETTE_GROUP } from "@/lib/automations/nodes/trade-wallet"
import { plural } from "@/lib/format/plural"

/** How far back a test looks when nobody has said otherwise. */
export const DEFAULT_BACKTEST_DAYS = 30

/**
 * The longest window this step will accept.
 *
 * As far back as the prices go, and no further.
 *
 * **The window is what you choose; the coin count is what follows.** Days is
 * the number somebody actually has in mind — "test two years" — so it is the
 * one that must not argue back. How many coins fit is then arithmetic, handed
 * out by `coinsAllowedFor` from the shared candle budget. That is the way round
 * the app this is a port of does it, and the reason: a market costs its window
 * of candles, so a longer window simply buys fewer coins. Nothing is refused
 * that could have been answered with a number.
 *
 * Ten years is an input guard against somebody typing 99999 and waiting, not a
 * promise that every exchange holds that much. The candle store follows the
 * selected protocol and records a shorter stretch as a visible gap. A younger
 * coin is tested from its first stored candle. Adding another exchange as a
 * fallback is a separate decision, never a quiet substitution inside a run.
 */
export const MAX_BACKTEST_DAYS = 3_650

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
 * **The number is set by the run this was built for.** Five hundred coins of 4h
 * candles over two years is what somebody actually wants, and that comes to
 * 2.44 million candles — so the ceiling sits just above it.
 *
 * What that costs has been MEASURED, and the figure is worth knowing before
 * anybody raises this again. One candle is 128 bytes held, but candles are not
 * where the memory goes: two runs at opposite shapes came out at
 *
 *  - 150 coins, 3.9 million candles → 1.02 GB at its highest
 *  - 500 coins, 2.44 million candles → 1.37 GB at its highest
 *
 * The second holds far fewer candles and costs more, because **the coin count
 * is the bigger half of the bill** — every coin carries a ladder, its orders
 * and its working space for the whole run. Roughly, a run costs 128 bytes a
 * candle plus about two megabytes a coin, so the ceiling here only bounds one
 * side of it and `MAX_BACKTEST_MARKETS` bounds the other.
 *
 * The biggest run this allows therefore wants about 1.4 GB for the walk, and
 * more while the candles are still being read out of the database, against the
 * 4.3 GB a server has all in. That fits, but not on top of a server that has
 * been up for days and grown; that is worth saying out loud rather than
 * discovering.
 *
 * Time is not what bounds this. Five hundred coins over two years of real
 * prices walks in about 45 seconds.
 *
 * The value said three million before, next to a note guessing "about three
 * hundred megabytes". Two things were wrong with that. The guess was a quarter
 * of the real figure, and the sum it applied to left out the 4h candles every
 * run reads on top — so the true ask was over two gigabytes. That is a run
 * waved through and then taking the server down with it, which is what kept
 * happening.
 *
 * What it still refuses is the shape nothing could survive: four hundred coins
 * of 5-minute candles over two years is eighty-four million candles, which is
 * not a slow run, it is a crash.
 */
export const MAX_BACKTEST_CANDLES = 2_500_000

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

/**
 * How many candles one coin needs, for this candle size over this many days.
 *
 * **Both feeds, not just the one being walked.** Every run also reads 4h
 * candles, because the base rule the ladders hang off is a 4h rule whatever
 * timeframe the run is on. Leaving that out of the sum meant a run on 1h asked
 * for a quarter more memory than the budget thought it had handed out, and a
 * run on 5m nearly twice as much — which is a run that gets past the check and
 * then takes the server down.
 *
 * A run that is ITSELF on 4h pays almost nothing extra: those are the same
 * candles, loaded once and shared, so all it adds is the stretch of history
 * from before the window that the base rule needs to know a level on day one.
 */
export function candlesPerCoin(interval: string, days: number): number {
  const ms = INTERVAL_MS[interval] ?? INTERVAL_MS["1h"]
  const window = Math.max(1, Math.ceil((days * 86_400_000) / ms))
  const warmUp = BASE_STOP_BARS
  if (interval === BASE_STOP_INTERVAL) return window + warmUp
  return (
    window + Math.ceil((days * 86_400_000) / INTERVAL_MS[BASE_STOP_INTERVAL]) + warmUp
  )
}

export const tradeMarketsSettingsSchema = z.object({
  /**
   * Which protocol the coins were picked from.
   *
   * Deliberately "protocol" and not "exchange": Hyperliquid and Binance are
   * exchanges, but a chain is coming, and a word that only fits half the list
   * is a word every future reader has to translate.
   *
   * The picker reads it to show the right list, and the run checks every chosen
   * coin against it so two exchanges' rules can never be mixed by mistake.
   *
   * Defaulted, not required: every flow saved before there was a second one
   * was picking from Hyperliquid.
   */
  protocol: z.string().min(1).max(30).default("hyperliquid"),
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
 * compared. The volume range in the panel narrows the list **while you are
 * editing**, and selection writes the names into the step. Pressing Run always
 * uses those saved names rather than applying the filter again.
 */
export const tradeMarketsNode = defineNode({
  kind: "tradeMarkets",
  palette: {
    key: "trade-markets",
    group: TRADE_PALETTE_GROUP,
    description: "Where the coins come from, which ones, and how far back",
  },
  createSettings: () => ({
    protocol: "hyperliquid",
    marketKeys: [],
    days: DEFAULT_BACKTEST_DAYS,
  }),
  settingsSchema: tradeMarketsSettingsSchema,
  name: () => "Markets",
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
