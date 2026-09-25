import { and, eq, inArray, max, min } from "drizzle-orm"

import { OWN_PAGE_MIN_VOLUME_USD } from "@/lib/free-tools/price-converter"
import {
  DAY_MS,
  DEFAULT_COIN,
  STOCKS_OFFERED,
  epochDay,
  splitDaysFrom,
  type WhatIfList,
  type WhatIfMarket,
  type WhatIfSeries,
} from "@/lib/free-tools/what-if"
import { parseMarketKey, type MarketKey } from "@/lib/protocols/contracts"
import { DUKASCOPY_INSTRUMENTS } from "@/lib/protocols/dukascopy/instruments.generated"
import { dukascopyInstrumentFor } from "@/lib/protocols/dukascopy/instruments"
import { historySourceFor } from "@/lib/protocols/history-source"
import { ROBINHOOD_DUKASCOPY_HISTORY } from "@/lib/protocols/robinhood/history"
import { storeKeepsFrom } from "@/lib/trade/chart-history"
import { db, type CustomShellDb } from "@/server/db"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import {
  ensureCandleCoverage,
  knownSplits,
  listCandleGaps,
  loadStoredCandles,
} from "@/server/trade/candle-store"
import { tradeCandleCoverage, tradeCandles } from "@/server/trade/schema"

/**
 * The server half of "What if I had bought" (`/tools/what-if`).
 *
 * **No visitor reaches an exchange.** The page reads daily closes the candle
 * store already holds. Which coins are offered comes from Hyperliquid's
 * market list, which the server keeps for a minute and shares with the
 * trading screens and the price converter. The list and each market's closes
 * are then kept here for an hour, and every visitor reads the kept copy.
 *
 * **A nightly job fills the history.** Once a UTC day the worker checks every
 * market the page could offer and downloads daily closes for any that has
 * none yet, or none reaching back ten years. The candle store's own top-up
 * (`candle-refresh.ts`) already adds each new day to every market it holds,
 * so after the first fill the nightly job normally finds nothing to do.
 */

/** How long the offered list and each market's closes are kept. */
const KEEP_MS = 60 * 60_000

/**
 * A market is offered only while its newest stored close is this recent.
 * A stock has no close at the weekend, and a long weekend adds a holiday.
 */
const FRESH_DAYS: Record<WhatIfMarket["kind"], number> = { coin: 3, stock: 6 }

/** A market whose history starts later than the floor plus this is filled back. */
const FLOOR_SLACK_DAYS = 30

type Candidate = WhatIfMarket & { marketKey: MarketKey }

/**
 * Every market the page could offer: Hyperliquid's coins that traded at
 * least $1,000,000 over the last day and whose history comes from Binance,
 * and the 72 Robinhood Chain stocks once `STOCKS_OFFERED` is on. The dollar
 * line is the converter's `OWN_PAGE_MIN_VOLUME_USD`, so both tools call the
 * same coins busy.
 */
async function listCandidates(): Promise<Candidate[]> {
  const catalog = await loadRawMarketCatalog("hyperliquid", "mainnet")
  const coins: Candidate[] = []
  for (const row of catalog.rows) {
    if (row.subExchange !== null) continue
    if (row.volume24hUsd < OWN_PAGE_MIN_VOLUME_USD) continue
    const source = historySourceFor(row.key)
    if (!source || parseMarketKey(source)?.protocol !== "binance") continue
    coins.push({
      kind: "coin",
      symbol: row.symbol,
      label: row.symbol,
      marketKey: source,
    })
  }
  return [...coins, ...(STOCKS_OFFERED ? stockCandidates() : [])]
}

function stockCandidates(): Candidate[] {
  const tickers = [...new Set(Object.values(ROBINHOOD_DUKASCOPY_HISTORY))]
  return tickers.flatMap((ticker): Candidate[] => {
    const instrument = dukascopyInstrumentFor(ticker, true)
    if (!instrument) return []
    const company = DUKASCOPY_INSTRUMENTS[instrument]?.description
    return [
      {
        kind: "stock",
        symbol: ticker,
        label: company ? `${ticker}, ${company}` : ticker,
        marketKey: `dukascopy:mainnet:${instrument}` as MarketKey,
      },
    ]
  })
}

type Offered = { list: WhatIfList; keys: Map<string, Candidate> }

let keptList: { at: number; offered: Offered } | null = null

function candidateId(kind: WhatIfMarket["kind"], symbol: string): string {
  return `${kind}:${symbol}`
}

/**
 * The markets with stored daily closes recent enough to answer with, coins
 * busiest first and stocks by ticker. Kept for an hour. If the market list
 * cannot be read and an older copy is kept, the older copy is served.
 */
async function loadOffered(
  database: CustomShellDb = db,
  now: number = Date.now()
): Promise<Offered> {
  if (keptList && now - keptList.at < KEEP_MS) return keptList.offered
  try {
    const candidates = await listCandidates()
    const newest = candidates.length
      ? await database
          .select({
            marketKey: tradeCandles.marketKey,
            newest: max(tradeCandles.openTime),
          })
          .from(tradeCandles)
          .where(
            and(
              eq(tradeCandles.interval, "1d"),
              inArray(
                tradeCandles.marketKey,
                candidates.map((candidate) => candidate.marketKey)
              )
            )
          )
          .groupBy(tradeCandles.marketKey)
      : []
    const newestByKey = new Map(
      newest.map((row) => [row.marketKey, row.newest])
    )
    const today = epochDay(now)
    const offered = candidates.filter((candidate) => {
      const last = newestByKey.get(candidate.marketKey)
      return (
        last !== null &&
        last !== undefined &&
        today - epochDay(last) <= FRESH_DAYS[candidate.kind]
      )
    })
    const strip = ({ kind, symbol, label }: Candidate): WhatIfMarket => ({
      kind,
      symbol,
      label,
    })
    const result: Offered = {
      list: {
        coins: offered.filter((m) => m.kind === "coin").map(strip),
        stocks: offered
          .filter((m) => m.kind === "stock")
          .sort((left, right) => left.symbol.localeCompare(right.symbol))
          .map(strip),
      },
      keys: new Map(
        offered.map((m) => [candidateId(m.kind, m.symbol), m] as const)
      ),
    }
    keptList = { at: now, offered: result }
    return result
  } catch (error) {
    if (keptList) {
      console.warn(
        "[what-if] the market list could not be read; serving the copy kept at",
        new Date(keptList.at).toISOString(),
        error
      )
      return keptList.offered
    }
    console.error("[what-if] the market list could not be read", error)
    throw new Error("WHAT_IF_MARKETS_UNAVAILABLE")
  }
}

const keptSeries = new Map<MarketKey, { at: number; series: WhatIfSeries }>()

async function loadSeries(
  candidate: Candidate,
  database: CustomShellDb,
  now: number
): Promise<WhatIfSeries> {
  const kept = keptSeries.get(candidate.marketKey)
  if (kept && now - kept.at < KEEP_MS) return kept.series
  const until = (epochDay(now) + 1) * DAY_MS
  const [bars, gaps, splits] = await Promise.all([
    loadStoredCandles(candidate.marketKey, "1d", 0, until, database),
    listCandleGaps(candidate.marketKey, "1d", 0, until, database),
    candidate.kind === "stock"
      ? knownSplits(candidate.marketKey, database)
      : Promise.resolve([]),
  ])
  const series: WhatIfSeries = {
    market: {
      kind: candidate.kind,
      symbol: candidate.symbol,
      label: candidate.label,
    },
    source: candidate.kind === "coin" ? "Binance" : "Dukascopy",
    days: bars.map((bar) => epochDay(bar.openTime)),
    closes: bars.map((bar) => bar.close),
    gaps,
    splitDays: splitDaysFrom(splits),
  }
  keptSeries.set(candidate.marketKey, { at: now, series })
  return series
}

export type WhatIfPage = {
  list: WhatIfList
  /** Null when the asked-for market is not offered. */
  series: WhatIfSeries | null
}

/**
 * The offered list and one market's closes. With no market named, the page
 * opens on Bitcoin, or on the busiest coin if Bitcoin is missing.
 */
export async function loadWhatIf(
  asked: { kind: WhatIfMarket["kind"]; symbol: string } | null,
  database: CustomShellDb = db,
  now: number = Date.now()
): Promise<WhatIfPage> {
  const offered = await loadOffered(database, now)
  const candidate = asked
    ? offered.keys.get(candidateId(asked.kind, asked.symbol))
    : (offered.keys.get(candidateId("coin", DEFAULT_COIN)) ??
      offered.keys.values().next().value)
  return {
    list: offered.list,
    series: candidate ? await loadSeries(candidate, database, now) : null,
  }
}

let night: { day: number; queue: MarketKey[] } | null = null
let filling: Promise<void> | null = null

/**
 * The nightly fill, run from the worker's fifteen-second loop.
 *
 * The first pass of each UTC day builds the day's list of markets that need
 * history. Each pass after that starts one market's download and returns
 * without waiting for it, so a slow source never holds up the worker's loop;
 * the next market starts on the first pass after that download ends. A market
 * whose download fails is left for the next night.
 */
export async function fillWhatIfHistory(
  database: CustomShellDb = db,
  now: number = Date.now()
): Promise<void> {
  if (filling) return
  const today = epochDay(now)
  if (night?.day !== today) {
    // Written first, so a list that cannot be built is not asked for again
    // every fifteen seconds; the next night tries again.
    night = { day: today, queue: [] }
    try {
      night.queue = await marketsNeedingHistory(database, now)
    } catch (error) {
      console.warn("[what-if] tonight's history list could not be built", error)
      return
    }
    if (night.queue.length > 0) {
      console.info(
        `[what-if] ${night.queue.length} markets need daily history tonight`
      )
    }
  }

  const next = night.queue.shift()
  if (!next) return
  const from = epochDay(storeKeepsFrom(now)) * DAY_MS
  filling = ensureCandleCoverage(next, "1d", from, today * DAY_MS, database)
    .then(
      (report) => {
        console.info(
          `[what-if] ${next}: ${report.barCount} daily closes stored`
        )
      },
      (error: unknown) => {
        console.warn(
          `[what-if] ${next}: daily history failed, tried again tomorrow`,
          error
        )
      }
    )
    .finally(() => {
      filling = null
    })
}

/**
 * Candidates with no daily history, history that starts well after the
 * store's ten-year floor, or history more than three days behind.
 */
async function marketsNeedingHistory(
  database: CustomShellDb,
  now: number
): Promise<MarketKey[]> {
  const candidates = await listCandidates()
  if (candidates.length === 0) return []
  const keys = [...new Set(candidates.map((candidate) => candidate.marketKey))]
  const covered = await database
    .select({
      marketKey: tradeCandleCoverage.marketKey,
      from: min(tradeCandleCoverage.fromTime),
      to: max(tradeCandleCoverage.toTime),
    })
    .from(tradeCandleCoverage)
    .where(
      and(
        eq(tradeCandleCoverage.interval, "1d"),
        inArray(tradeCandleCoverage.marketKey, keys)
      )
    )
    .groupBy(tradeCandleCoverage.marketKey)
  const byKey = new Map(covered.map((row) => [row.marketKey, row]))
  const floor = storeKeepsFrom(now) + FLOOR_SLACK_DAYS * DAY_MS
  const behind = (epochDay(now) - 3) * DAY_MS
  return keys.filter((key) => {
    const row = byKey.get(key)
    if (!row || row.from === null || row.to === null) return true
    return row.from > floor || row.to < behind
  })
}
