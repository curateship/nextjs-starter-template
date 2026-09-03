import {
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type MarketKey,
} from "@/lib/protocols/contracts"
import {
  intervalMs,
  storeDepthFrom,
  storeKeepsFrom,
  venueSliceFrom,
  wantsFullHistory,
} from "@/lib/trade/chart-history"
import { getProtocol } from "@/server/protocols/registry"
import {
  ensureCandleCoverage,
  loadStoredCandles,
} from "@/server/trade/candle-store"
import {
  resolveHistorySource,
  sourceLabelOf,
} from "@/server/trade/history-source"

/**
 * The two reads behind every chart.
 *
 * The first is the venue's own last 30 days, drawn at once. The second is the
 * store's rows behind them, filled from the market's history source on first
 * use and read straight back after that. `@/lib/trade/chart-history` says why
 * the split is where it is.
 */

/** The venue's own recent slice, after resolving the market through the fence. */
export async function loadProtocolCandles(
  marketKey: string,
  interval: CandleInterval
): Promise<CandleBar[]> {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error("Not a market key.")
  const protocol = getProtocol(ref.protocol)
  try {
    return await protocol.markets.candles(
      ref.network,
      ref.marketId,
      interval,
      venueSliceFrom(interval, Date.now())
    )
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error)
    if (!said.includes("EXCHANGE_BUSY")) throw error

    // Preserve the venue's own allowance detail when it supplied one. The
    // browser turns this stable code into the chart's plain-language message.
    const detail = /EXCHANGE_BUSY:(.+)$/.exec(said)?.[1]?.trim() ?? ""
    throw new Error(
      `EXCHANGE_BUSY:${protocol.label}${detail ? ` — ${detail}` : ""}`
    )
  }
}

export type OlderCandles = {
  candles: CandleBar[]
  /** Where the rows came from, or null when they are the venue's own. */
  source: {
    key: MarketKey
    label: string
    /** What the source's volume really is, when it is not the market's. */
    volumeNote: string | null
  } | null
  /**
   * True when the source could not be asked for the rest just now, so the
   * rows are what the store already held and may stop short. The chart
   * draws them and says the older bars could not all be loaded.
   */
  partial: boolean
}

/**
 * Two tabs opening the same market at once would each fill the store. The
 * writes are harmless twice, but the fetch is not free, so a fill in flight
 * is shared with whoever asks for the same one meanwhile.
 */
const filling = new Map<string, Promise<OlderCandles>>()

/**
 * The store's bars behind the venue's slice, filling the store first.
 *
 * A market with a source reads the source's key: back to the source's first
 * bar on the timeframes that load in full, and `MOST_BARS_A_CHART_ASKS_FOR`
 * deep on the rest. Every closed bar up to now is asked for, so the seam
 * with the venue's slice has no hole in it; where both have a bar, the
 * browser lets the venue win.
 *
 * A market with no source keeps today's behaviour: the venue's own whole
 * history on the full-history timeframes, where the venue can afford it,
 * and nothing more on the rest.
 */
export async function loadOlderCandles(
  marketKey: string,
  interval: CandleInterval
): Promise<OlderCandles> {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error("Not a market key.")

  const source = await resolveHistorySource(marketKey)
  if (!source) {
    const venue = getProtocol(ref.protocol)
    const chases =
      wantsFullHistory(interval) && venue.markets.chartChasesFullHistory !== false
    if (!chases) return { candles: [], source: null, partial: false }
    return {
      candles: await venue.markets.candles(ref.network, ref.marketId, interval),
      source: null,
      partial: false,
    }
  }

  const fillKey = `${source}@${interval}`
  const inFlight = filling.get(fillKey)
  if (inFlight) return inFlight

  const fill = fillStore(source, interval).finally(() => {
    if (filling.get(fillKey) === fill) filling.delete(fillKey)
  })
  filling.set(fillKey, fill)
  return fill
}

async function fillStore(
  source: MarketKey,
  interval: CandleInterval
): Promise<OlderCandles> {
  const ref = parseMarketKey(source)
  if (!ref) throw new Error("Not a market key.")
  const entry = getProtocol(ref.protocol)
  const now = Date.now()
  const step = intervalMs(interval)
  // The bar still forming is never stored: it would count as covered and
  // never be looked at again.
  const to = Math.floor(now / step) * step
  const floor = entry.markets.historyFloor?.(ref.marketId, interval) ?? null
  const from = Math.max(
    storeKeepsFrom(now),
    wantsFullHistory(interval)
      ? (floor ?? storeDepthFrom(interval, now))
      : Math.max(storeDepthFrom(interval, now), floor ?? 0)
  )

  // A source that will not answer just now does not blank what the store
  // already holds. The rows there are drawn, and the chart says the rest
  // could not be loaded, with Try again.
  let partial = false
  try {
    await ensureCandleCoverage(source, interval, from, to)
  } catch (error) {
    console.warn(
      `[candle-store] ${source} ${interval}: fill failed, answering with what is stored — ${error instanceof Error ? error.message : String(error)}`
    )
    partial = true
  }
  return {
    candles: await loadStoredCandles(source, interval, from, to),
    source: {
      key: source,
      label: sourceLabelOf(source),
      volumeNote: entry.markets.volumeNote ?? null,
    },
    partial,
  }
}
