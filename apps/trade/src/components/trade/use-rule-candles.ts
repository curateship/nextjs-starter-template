import * as React from "react"

import { loadCandles, loadOlderCandlesFor } from "@/lib/api/trade/candles"
import type { CandleBar } from "@/lib/protocols/contracts"
import {
  groupCandles,
  intervalMs,
  stitchCandles,
  VENUE_HISTORY_MS,
  VENUE_SLICE_BARS,
} from "@/lib/trade/chart-history"
import {
  chartSourceInterval,
  isGroupedChartInterval,
  type ChartInterval,
} from "@/lib/trade/chart-interval"
import { candleClosesAt, type RuleBars } from "@/lib/trade/trading-rules"

/**
 * The candles a trading rule's EMA conditions read, for the coin on screen.
 *
 * One read per coin and timeframe, kept until that timeframe's candle closes,
 * because an EMA built from closed candles does not move until then. A week
 * or a month is built from day bars, the same way the chart builds them. Kept
 * in this module rather than in a component, so the chart's rules box and the
 * check before an entry share one read, and switching layouts does not ask
 * the exchange again.
 */

type Entry =
  | { status: "ready"; bars: CandleBar[]; depth: number; freshUntil: number }
  | { status: "failed"; retryAt: number }

const RETRY_MS = 60_000
const MAX_ENTRIES = 60

const entries = new Map<string, Entry>()
const reading = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot() {
  return version
}

function keyOf(marketKey: string, interval: ChartInterval) {
  return `${marketKey}|${interval}`
}

function remember(key: string, entry: Entry) {
  entries.delete(key)
  entries.set(key, entry)
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
  changed()
}

/** Whether `depth` candles of `interval` reach past what the venue's own slice holds. */
function wantsOlder(interval: ChartInterval, depth: number): boolean {
  const source = chartSourceInterval(interval)
  const venueReach = Math.min(
    VENUE_HISTORY_MS,
    VENUE_SLICE_BARS * intervalMs(source)
  )
  return depth * intervalMs(interval) > venueReach
}

async function read(marketKey: string, interval: ChartInterval, depth: number) {
  const key = keyOf(marketKey, interval)
  if (reading.has(key)) return
  reading.add(key)
  try {
    const source = chartSourceInterval(interval)
    const [venue, older] = await Promise.all([
      loadCandles(marketKey, source),
      wantsOlder(interval, depth)
        ? loadOlderCandlesFor(marketKey, source)
        : Promise.resolve(null),
    ])
    const stitched = older
      ? stitchCandles(older.candles, venue.candles)
      : venue.candles
    const bars = isGroupedChartInterval(interval)
      ? groupCandles(stitched, interval)
      : stitched
    const now = Date.now()
    const last = bars[bars.length - 1]
    const closes = last ? candleClosesAt(interval, last.openTime) : 0
    remember(key, {
      status: "ready",
      bars,
      depth,
      // A few seconds past the close, so the exchange has the closed candle.
      freshUntil: closes > now ? closes + 5_000 : now + RETRY_MS,
    })
  } catch {
    const kept = entries.get(key)
    // A refreshed read that fails keeps the candles it already had; only a
    // first read that fails says it could not load.
    if (kept?.status === "ready") {
      remember(key, { ...kept, freshUntil: Date.now() + RETRY_MS })
    } else {
      remember(key, { status: "failed", retryAt: Date.now() + RETRY_MS })
    }
  } finally {
    reading.delete(key)
  }
}

function due(entry: Entry | undefined, depth: number, now: number): boolean {
  if (!entry) return true
  if (entry.status === "failed") return now >= entry.retryAt
  return now >= entry.freshUntil || entry.depth < depth
}

/**
 * `needs` maps each timeframe to the most candles a condition asks for. The
 * answer is a function the rules check calls per timeframe.
 */
export function useRuleCandles(
  marketKey: string | null,
  needs: ReadonlyMap<ChartInterval, number>
): (interval: ChartInterval) => RuleBars {
  const seen = React.useSyncExternalStore(subscribe, snapshot, snapshot)
  const [tick, setTick] = React.useState(0)
  const needsKey = [...needs]
    .map(([interval, depth]) => `${interval}:${depth}`)
    .sort()
    .join(",")

  React.useEffect(() => {
    if (!marketKey || needsKey === "") return
    const now = Date.now()
    let soonest = Number.POSITIVE_INFINITY
    for (const part of needsKey.split(",")) {
      const [interval, depthText] = part.split(":") as [ChartInterval, string]
      const depth = Number(depthText)
      const key = keyOf(marketKey, interval)
      const entry = entries.get(key)
      if (due(entry, depth, now)) void read(marketKey, interval, depth)
      else if (entry?.status === "ready") soonest = Math.min(soonest, entry.freshUntil)
      else if (entry?.status === "failed") soonest = Math.min(soonest, entry.retryAt)
    }
    if (!Number.isFinite(soonest)) return
    const timer = window.setTimeout(
      () => setTick((count) => count + 1),
      Math.max(1_000, soonest - now)
    )
    return () => window.clearTimeout(timer)
  }, [marketKey, needsKey, seen, tick])

  return React.useCallback(
    (interval: ChartInterval): RuleBars => {
      // `seen` is read so a finished read hands out a new function.
      void seen
      if (!marketKey) return { status: "loading" }
      const entry = entries.get(keyOf(marketKey, interval))
      if (!entry) return { status: "loading" }
      if (entry.status === "failed") return { status: "failed" }
      return { status: "ready", bars: entry.bars }
    },
    [marketKey, seen]
  )
}
