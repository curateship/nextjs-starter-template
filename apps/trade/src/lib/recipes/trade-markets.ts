import { ListIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { BASE_STOP_BARS, BASE_STOP_INTERVAL } from "@/lib/trade/dca"
import { TRADE_PALETTE_GROUP } from "@/lib/recipes/trade-wallet"
import { plural } from "@/lib/format/plural"

/** How far back a test looks when nobody has said otherwise. */
export const DEFAULT_BACKTEST_DAYS = 30

/**
 * The exchange a backtest reads history from when nobody has said otherwise.
 *
 * Binance rather than the one this app trades on, and that is the point: with
 * pretend money nothing is ever sent anywhere, so the only thing that matters
 * is whose price history is longest and widest. Binance lists more coins and
 * holds years more of them, which is the difference between testing a strategy
 * over one cycle and testing it over several.
 *
 * It is only ever a default. Naming a wallet moves the step onto that wallet's
 * exchange, because a wallet can only trade its own — and picking a different
 * one here by hand is always allowed.
 */
export const DEFAULT_BACKTEST_PROTOCOL = "binance"

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

const DAY_MS = 86_400_000

/** A day the way this step writes one down: `2025-10-10`, and nothing else. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** The two dates a step may name, or the two nulls that mean it named none. */
export type MarketWindowDates = {
  from?: string | null
  to?: string | null
}

/**
 * Midnight UTC on that day, or null when that is not a day.
 *
 * The answer is read back and compared with what was asked for, because
 * `Date.parse` does NOT refuse a day that never existed — it rolls it forward.
 * The 31st of February comes back as the 3rd of March, so a typo that was meant
 * to end February would silently move the window into spring. Checked rather
 * than trusted.
 */
export function dayStartMs(day: string | null | undefined): number | null {
  if (typeof day !== "string" || !DAY_PATTERN.test(day)) return null
  const ms = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === day ? ms : null
}

/**
 * That day, written the way this step stores one, and back again.
 *
 * Both read the day off the calendar rather than off the clock — the day a
 * picker was showing when it was clicked is the day that gets written down, and
 * the day written down is the day the picker shows again. The window maths then
 * reads that day as UTC, which is the part that has to be the same everywhere.
 */
export function dayFromDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function dateFromDay(day: string | null | undefined): Date | undefined {
  if (typeof day !== "string" || !DAY_PATTERN.test(day)) return undefined
  const [year, month, date] = day.split("-").map(Number)
  const made = new Date(year, month - 1, date)
  return Number.isFinite(made.getTime()) ? made : undefined
}

/**
 * The stretch of time two chosen dates mean, or null when none were chosen.
 *
 * **Read as UTC, never as the clock of whoever opened the panel.** A run has to
 * cover the same ground whichever chair it was started from; a date that slides
 * by a day depending on the reader is a run that cannot be compared with
 * itself.
 *
 * **The last day is included.** October 1st to October 10th is ten days,
 * because that is what somebody typing those two dates means — so the far end
 * is midnight at the start of the day *after*, not midnight at the start of the
 * day itself. Ending at the day's own midnight would drop the last day from
 * every run, which is exactly the day people pick these dates to look at.
 */
export function chosenWindow(
  dates: MarketWindowDates
): { from: number; to: number } | null {
  const from = dayStartMs(dates.from)
  const to = dayStartMs(dates.to)
  if (from === null || to === null) return null
  return { from, to: to + DAY_MS }
}

/**
 * How long this step's window is, in days — the number every memory sum is
 * worked out from, whichever way the window was chosen.
 */
export function windowDays(
  settings: { days: number } & MarketWindowDates
): number {
  const window = chosenWindow(settings)
  if (!window) return settings.days
  return Math.max(1, Math.round((window.to - window.from) / DAY_MS))
}

/**
 * A Markets step's settings with its coin list cut down to what will fit.
 *
 * **The step hands out the limit; the run does not discover it.** Every coin
 * costs its whole window of candles and a run holds them all at once, so the
 * window and the candle size decide between them how many coins there is room
 * for. That was only ever checked when Run was pressed, which meant a list
 * could be built, saved and left sitting there for an hour while every press
 * refused in thirty milliseconds and nothing on screen said why.
 *
 * It is the *window* that most often does this, not the coin list. Picking 400
 * coins over a year is fine; stretching that same year to three years is what
 * puts it over. So this runs on any change to the step, not only on the ones
 * that touch the coins.
 *
 * The list is ordered busiest-first by everything that writes it in bulk, so
 * cutting the tail keeps the coins somebody meant to have.
 *
 * With a wallet named there is no history to walk and nothing held in memory,
 * so the only limit left is the one on the length of the list itself.
 */
export function trimMarketsToFit<T extends Record<string, unknown>>(
  settings: T,
  /** The candle size the run will read, off the DCA ladder step. */
  interval: string,
  /** True when a wallet is named, so the flow trades rather than tests. */
  trading: boolean
): T {
  const keys = Array.isArray(settings.marketKeys)
    ? (settings.marketKeys as string[])
    : []
  const allowed = trading
    ? MAX_BACKTEST_MARKETS
    : coinsAllowedFor(
        interval,
        windowDays({
          days: typeof settings.days === "number" ? settings.days : 1,
          from: typeof settings.from === "string" ? settings.from : null,
          to: typeof settings.to === "string" ? settings.to : null,
        })
      )
  return { ...settings, marketKeys: [...new Set(keys)].slice(0, allowed) }
}

/**
 * What is wrong with the two chosen dates, in words somebody can act on, or
 * null when nothing is.
 *
 * Both dates or neither: one date alone has no window in it, and guessing the
 * other end would be inventing the answer rather than asking for it.
 *
 * Says nothing about dates in the future, because it has no clock and should
 * not have one — it is read while a panel is being drawn. A window that merely
 * runs past today is cut off at the last finished bar anyway, which is what "to
 * today" means, and refusing that would make picking today an error. A window
 * ENTIRELY in the future has nothing left after that cut, and is turned away
 * with its own sentence in `startBacktestForRecipe`, where the clock is.
 */
export function windowProblem(dates: MarketWindowDates): string | null {
  const from = dates.from ?? null
  const to = dates.to ?? null
  if (from === null && to === null) return null
  if (from === null || to === null) {
    return "Set both dates, or clear both to test the last few days instead."
  }
  const window = chosenWindow({ from, to })
  if (!window) {
    return "Those dates could not be read. Write them as 2025-10-10."
  }
  if (window.to <= window.from) {
    return "The end date is before the start date."
  }
  const days = Math.round((window.to - window.from) / DAY_MS)
  if (days > MAX_BACKTEST_DAYS) {
    return `That is ${days.toLocaleString()} days. The longest window a run may cover is ${MAX_BACKTEST_DAYS.toLocaleString()} days.`
  }
  return null
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
    window +
    Math.ceil((days * 86_400_000) / INTERVAL_MS[BASE_STOP_INTERVAL]) +
    warmUp
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
   * was picking from Hyperliquid, so that is what those flows keep meaning.
   * A step made from today starts on {@link DEFAULT_BACKTEST_PROTOCOL}; this
   * default is only ever reached by a saved step that never wrote the field.
   */
  protocol: z.string().min(1).max(30).default("hyperliquid"),
  folderId: z.string().uuid().nullable().default(null),
  folderName: z.string().max(80).nullable().default(null),
  folderCount: z
    .number()
    .int()
    .min(0)
    .max(MAX_BACKTEST_MARKETS)
    .nullable()
    .default(null),
  marketKeys: z.array(z.string().min(1)).max(MAX_BACKTEST_MARKETS),
  days: z.number().int().min(1).max(MAX_BACKTEST_DAYS),
  /**
   * The exact stretch to walk, when "the last few days" is not what you mean.
   *
   * Both dates or neither — see {@link windowProblem}. When they are set they
   * decide the window outright and `days` is ignored, worked out from the dates
   * instead wherever a length is needed.
   *
   * Null on every flow saved before dates were on offer, which is how those
   * flows go on meaning "the last `days` days" without being touched.
   */
  from: z
    .string()
    .regex(DAY_PATTERN, "Write the date as 2025-10-10.")
    .nullable()
    .default(null),
  to: z
    .string()
    .regex(DAY_PATTERN, "Write the date as 2025-10-10.")
    .nullable()
    .default(null),
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
    protocol: DEFAULT_BACKTEST_PROTOCOL,
    folderId: null,
    folderName: null,
    folderCount: null,
    marketKeys: [],
    days: DEFAULT_BACKTEST_DAYS,
    from: null,
    to: null,
  }),
  settingsSchema: tradeMarketsSettingsSchema,
  name: () => "Markets",
  description: (settings) => {
    if (typeof settings.folderId === "string") {
      const name =
        typeof settings.folderName === "string"
          ? settings.folderName
          : "Chosen folder"
      const count =
        typeof settings.folderCount === "number" ? settings.folderCount : 0
      return `Folder: ${name} (${count} ${plural(count, "coin", "coins")})`
    }
    const keys = Array.isArray(settings.marketKeys)
      ? settings.marketKeys.length
      : 0
    if (keys === 0) return "No coins chosen yet."
    const coins = `${keys} ${plural(keys, "coin", "coins")}`
    // Two chosen dates are the whole point of choosing them, so the card says
    // them rather than the length they add up to.
    const from = typeof settings.from === "string" ? settings.from : null
    const to = typeof settings.to === "string" ? settings.to : null
    if (from !== null && to !== null) return `${coins}, ${from} to ${to}.`
    const days = typeof settings.days === "number" ? settings.days : null
    return `${coins}${days === null ? "" : `, over the last ${days} ${plural(days, "day", "days")}`}.`
  },
  icon: ListIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/recipes/trade-markets-panel"),
})
