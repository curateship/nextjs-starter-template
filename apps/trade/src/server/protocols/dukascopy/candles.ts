import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import { dukascopyFirstBar } from "@/lib/protocols/dukascopy/instruments"
import { dukascopyTimeframe } from "@/lib/protocols/dukascopy/naming"
import { candleIntervalMs } from "@/lib/protocols/timing"
import {
  getHistoricalRates,
  type DukascopyRow,
} from "@/server/protocols/dukascopy/client"
import { inBatches } from "@/server/protocols/full-history"

/**
 * Finished bars from Dukascopy's public files.
 *
 * **What is asked for.** Bid prices, a touch below the mid; on a $200 stock
 * the spread is cents, and stated in `exchanges/dukascopy.md`. Volume in
 * units, which is Dukascopy's own brokerage volume rather than the stock
 * market's, so the chart labels it. Flat bars dropped, which is how a stock's
 * closed hours come back as silence rather than a row of identical prices.
 *
 * **Pacing.** Measured 2 Sep 2026: the library's default ten files a batch
 * with a one-second pause drew a 429 from Dukascopy part-way through Tesla's
 * 4-hour history, and the refusal then held for the next few minutes of
 * asks. Three files a batch with a second and a half between them held for
 * about a minute and then drew refusals again on 2 Sep 2026, so it is two
 * files a batch, two seconds between batches, and a refused file waits ten
 * seconds before each of five more tries. One
 * history call covers a whole ask (`DUKASCOPY_HISTORY_BATCH_BARS`), so the
 * library's one pacing schedule runs the download rather than the store
 * asking page after page. Each call also takes one slot in the process-wide
 * `PAGES_AT_ONCE` gate, so a top-up and a backtest cannot together crowd the
 * feed. A file refused after every retry throws, rather than coming back as
 * an empty answer the store would mistake for a market with no bars.
 */

const FILES_PER_BATCH = 2
const BATCH_PAUSE_MS = 2_000
const RETRIES = 5
const RETRY_PAUSE_MS = 10_000

/**
 * One Dukascopy download at a time, process-wide.
 *
 * The pacing above is per call. A backtest loads several coins at once, and
 * five stocks each downloading three files a batch is fifteen files a batch
 * against the same feed, which is the pace that drew the 429 in the first
 * place. Calls queue here so the feed only ever sees one schedule.
 */
let downloadTail: Promise<void> = Promise.resolve()

/** Breathing room between one download finishing and the next starting. */
const BETWEEN_CALLS_MS = 1_500

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const turn = downloadTail.then(work, work)
  downloadTail = turn.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, BETWEEN_CALLS_MS)),
    () => new Promise<void>((resolve) => setTimeout(resolve, BETWEEN_CALLS_MS))
  )
  return turn
}

/**
 * A 429 is Dukascopy saying slow down, not a fault of the market. Every
 * caller already knows the `EXCHANGE_BUSY` code: the backtest worker hands
 * the run back untouched and tries again on a later pass, and the chart says
 * the source would not answer just now. Binance says the same thing the same
 * way.
 */
function busyIfRefused(error: unknown): never {
  const said = error instanceof Error ? error.message : String(error)
  if (/status 429/.test(said)) {
    throw new Error(
      "EXCHANGE_BUSY:Dukascopy — refused for now; it lets go after a few minutes"
    )
  }
  throw error
}

/**
 * Bars the candle store hands over in one ask. Large enough that a whole
 * fill is one call: two weeks of minutes, two years of hours, and every
 * 4-hour or daily bar an instrument has.
 */
export const DUKASCOPY_HISTORY_BATCH_BARS = 60_000

const DAY_MS = 86_400_000

/**
 * The latest moment Dukascopy has finished bars for: midnight UTC today.
 *
 * Measured 2 Sep 2026: a day's minute file appears after the day ends, so
 * asking for today answers nothing, and the store must not write today
 * down as covered. The venue's own 30 days carry the chart through it.
 */
export function dukascopyPublishedThrough(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS
}

/**
 * Where the monthly hour files stop and the daily minute files take over.
 *
 * Hourly and 4-hour bars come from one file per month, and the file for the
 * month in progress is empty until the month ends (measured 2 Sep 2026: the
 * September file answered nothing on the 2nd). The daily 15-minute files do
 * carry the month so far, so those days are read as quarter hours and
 * folded into hours here. The same bid prices, the same bars.
 */
function monthStart(at: number): number {
  const date = new Date(at)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

const HOUR_FILE_INTERVALS: ReadonlySet<CandleInterval> = new Set(["1h", "4h"])

function requireMainnet(network: NetworkId): void {
  if (network !== "mainnet") throw new Error("DUKASCOPY_NETWORK_UNSUPPORTED")
}

/**
 * One finished window `[from, to)` for the candle store.
 *
 * An instrument the table does not know answers with no bars, the way a
 * delisted Binance coin does: it is an answer about the market, not a fault,
 * and the store writes it down as a gap. The ask is also pulled forward to
 * the instrument's first day, because every month before it is a download
 * of an empty file.
 */
export async function fetchDukascopyCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  requireMainnet(network)
  const firstBar = dukascopyFirstBar(marketId, interval)
  if (firstBar === null) return []
  const start = Math.max(from, firstBar)
  const end = Math.min(to, dukascopyPublishedThrough(Date.now()))
  if (!(end > start)) return []

  const step = candleIntervalMs(interval)
  const thisMonth = monthStart(Date.now())
  const hourFiles = HOUR_FILE_INTERVALS.has(interval)
  const fromFiles = hourFiles ? Math.min(end, thisMonth) : end
  const [rows] = await inBatches([
    () => oneAtATime(async () => {
      const bars =
        fromFiles > start
          ? toBars(await download(marketId, interval, start, fromFiles), step)
          : []
      if (hourFiles && end > Math.max(start, thisMonth)) {
        const quarterHours = await download(
          marketId,
          "15m",
          Math.max(start, thisMonth),
          end
        )
        bars.push(...foldInto(step, quarterHours))
      }
      return bars
    }),
  ])

  // The window is re-applied because the library rounds the ends to its own
  // file edges.
  return rows
    .filter((bar) => bar.openTime >= start && bar.openTime < end)
    .sort((left, right) => left.openTime - right.openTime)
}

function download(
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<DukascopyRow[]> {
  return getHistoricalRates({
    instrument: marketId,
    dates: { from: new Date(from), to: new Date(to) },
    timeframe: dukascopyTimeframe(interval),
    priceType: "bid",
    volumes: true,
    volumeUnits: "units",
    ignoreFlats: true,
    format: "json",
    batchSize: FILES_PER_BATCH,
    pauseBetweenBatchesMs: BATCH_PAUSE_MS,
    retryCount: RETRIES,
    pauseBetweenRetriesMs: RETRY_PAUSE_MS,
    failAfterRetryCount: true,
  }).catch(busyIfRefused)
}

/** A Dukascopy timestamp is already epoch milliseconds UTC. */
function toBars(rows: readonly DukascopyRow[], step: number): CandleBar[] {
  return rows.map((row) => ({
    // The library stamps a bar by its own file edge; snapping keeps every
    // bar on this app's grid.
    openTime: Math.floor(row.timestamp / step) * step,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume ?? 0,
  }))
}

/** Smaller bars folded into bars of `step`, oldest first inside each. */
function foldInto(step: number, rows: readonly DukascopyRow[]): CandleBar[] {
  const byOpen = new Map<number, CandleBar>()
  for (const row of [...rows].sort((a, b) => a.timestamp - b.timestamp)) {
    const openTime = Math.floor(row.timestamp / step) * step
    const bar = byOpen.get(openTime)
    if (!bar) {
      byOpen.set(openTime, {
        openTime,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume ?? 0,
      })
      continue
    }
    bar.high = Math.max(bar.high, row.high)
    bar.low = Math.min(bar.low, row.low)
    bar.close = row.close
    bar.volume += row.volume ?? 0
  }
  return [...byOpen.values()]
}

/** Bars a chart asks for when nothing said how far back to read. */
const CHART_BARS = 1_000

/** The recent slice a chart draws: the same read over the last N bars. */
export async function fetchDukascopyCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  const step = candleIntervalMs(interval)
  const to = Date.now() + step
  const from = since ?? to - CHART_BARS * step
  return fetchDukascopyCandleHistory(network, marketId, interval, from, to)
}
