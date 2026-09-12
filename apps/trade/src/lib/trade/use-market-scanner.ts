import {
  emptyScannerDetections,
  recordScannerDetections,
  scannerDetectionStoreSchema,
  type ScannerDetection,
} from "@/lib/trade/scanner-detections"
import * as React from "react"
import {
  parseMarketKey,
  type CandleBar,
  type MarketCatalog,
  type MarketRow,
} from "@/lib/protocols/contracts"
import { getLiveAdapter } from "@/lib/protocols/live-registry"
import { loadScannerCatalogs } from "@/lib/api/trade/market-scanner"
import { loadCandles } from "@/lib/api/trade/candles"
import {
  liveFiguresOf,
  liveVenueStatus,
  marketHistory,
  retainMarketHistory,
  startLiveMarketData,
  watchLiveCandle,
} from "@/lib/trade/live-market"
import {
  scannerIntervalMs,
  scannerPriceMatches,
  scannerMatch,
  scannerMovement,
  type ScannerSettings,
} from "@/lib/trade/market-scanner"

export const SCANNER_CANDLE_LIMIT = 20
export type ScannerResult = ScannerDetection
export type ScannerSnapshot = {
  loaded: boolean
  rows: ScannerResult[]
  total: number
  candles: number
  warming: number
  unavailable: number
  errors: string[]
}
const empty: ScannerSnapshot = {
  loaded: false,
  rows: [],
  total: 0,
  candles: 0,
  warming: 0,
  unavailable: 0,
  errors: [],
}

/** Bounded candle watches share the protocol streams with the active chart. */
export function useMarketScanner(
  settings: ScannerSettings,
  workspaceCatalogs: readonly MarketCatalog[],
  accountId: string
) {
  const [snapshot, setSnapshot] = React.useState(empty)
  const storageKey = `trade-scanner-detections:${accountId}`
  const [detections, setDetections] = React.useState(emptyScannerDetections)
  const [storageError, setStorageError] = React.useState<string | null>(null)
  const detectionsRef = React.useRef(detections)

  React.useEffect(() => {
    let active = true
    try {
      const raw = localStorage.getItem(storageKey)
      const stored = raw
        ? scannerDetectionStoreSchema.parse(JSON.parse(raw))
        : emptyScannerDetections()
      detectionsRef.current = stored
      queueMicrotask(() => {
        if (!active) return
        setDetections(stored)
        setStorageError(null)
      })
    } catch {
      queueMicrotask(() => {
        if (!active) return
        setStorageError(
          "Saved scanner results could not be read. Keep this dashboard open to retain new results."
        )
      })
    }
    const receive = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) return
      try {
        const parsed = scannerDetectionStoreSchema.safeParse(
          JSON.parse(event.newValue)
        )
        if (!parsed.success) return
        detectionsRef.current = parsed.data
        setDetections(parsed.data)
      } catch {
        // Malformed browser storage belongs to another tab or an old build.
      }
    }
    window.addEventListener("storage", receive)
    return () => {
      active = false
      window.removeEventListener("storage", receive)
    }
  }, [storageKey])
  const persist = React.useCallback(
    (next: typeof detections) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        setStorageError(
          "Browser storage is unavailable. Keep this dashboard open to retain scanner results."
        )
      }
    },
    [storageKey]
  )
  React.useEffect(() => {
    detectionsRef.current = detections
  }, [detections])
  const remember = React.useCallback(
    (matches: ScannerDetection[], noLongerMatching: Set<string>) => {
      const next = recordScannerDetections(
        detectionsRef.current,
        matches,
        noLongerMatching
      )
      if (next === detectionsRef.current) return
      detectionsRef.current = next
      setDetections(next)
      persist(next)
    },
    [persist]
  )
  const dismiss = (key: string) => {
    const next = {
      rows: detectionsRef.current.rows.filter((row) => row.market.key !== key),
      dismissed: [...new Set([...detectionsRef.current.dismissed, key])],
    }
    detectionsRef.current = next
    setDetections(next)
    persist(next)
  }
  const [retry, setRetry] = React.useState(0)
  const workspaceVenues = workspaceCatalogs
    .map((c) => `${c.protocol}:${c.network}`)
    .sort()
    .join("|")
  React.useEffect(() => {
    if (!settings.enabled) return
    let disposed = false
    const stops: (() => void)[] = [retainMarketHistory()]
    const bars = new Map<string, CandleBar[]>()
    const updated = new Map<string, number>()
    const errors = new Map<string, string>()
    let catalogs: MarketCatalog[] = []
    let markets: MarketRow[] = []
    let candleMarkets: MarketRow[] = []
    let generation = 0
    let ready = false
    let fetching = false
    const refreshQueue = new Set<string>()
    let delay: ReturnType<typeof setTimeout> | undefined
    const fetchNext = async () => {
      if (disposed || fetching) return
      const key = refreshQueue.values().next().value as string | undefined
      if (!key) return
      refreshQueue.delete(key)
      fetching = true
      const requestedGeneration = generation
      try {
        const answer = await loadCandles(key, settings.interval)
        if (disposed || requestedGeneration !== generation) return
        // A socket update received while history was loading wins at the same timestamp.
        const merged = new Map(answer.candles.map((bar) => [bar.openTime, bar]))
        for (const bar of bars.get(key) ?? []) merged.set(bar.openTime, bar)
        bars.set(
          key,
          [...merged.values()]
            .sort((a, b) => a.openTime - b.openTime)
            .slice(-102)
        )
        errors.delete(key)
      } catch {
        if (!disposed)
          errors.set(
            key,
            `Candle history unavailable for ${key}. Retry to reconnect.`
          )
      } finally {
        fetching = false
        if (!disposed) delay = setTimeout(() => void fetchNext(), 2000)
      }
    }
    const evaluate = () => {
      if (!ready || disposed) return
      const now = Date.now()
      let warming = 0
      let unavailable = 0
      const rows: ScannerResult[] = []
      const noLongerMatching = new Set<string>()
      for (const catalog of catalogs) {
        const live =
          !!getLiveAdapter(catalog.protocol)?.watchFigures &&
          liveVenueStatus(catalog, now) === "live"
        if (!live) {
          unavailable += catalog.rows.length
          continue
        }
        for (const market of catalog.rows) {
          const minute = marketHistory.window(market.key, now, 60)
          const at = updated.get(market.key) ?? 0
          const movement =
            now - at <= 30_000
              ? scannerMovement(bars.get(market.key) ?? [], settings, now)
              : null
          const figure = liveFiguresOf(market.key, now)
          if (!figure) {
            unavailable++
            continue
          }
          const volume24h = figure.value.volume24hUsd
          const priceWindow =
            settings.priceWindowSeconds === 60
              ? minute
              : marketHistory.window(market.key, now, 300)
          const matches =
            settings.mode === "price"
              ? scannerPriceMatches(settings, priceWindow)
              : scannerMatch(settings, volume24h, minute, movement).matches
          const readyForRule =
            settings.mode === "price"
              ? priceWindow !== null
              : settings.mode === "volume"
                ? minute !== null
                : settings.mode === "volatility"
                  ? movement !== null
                  : minute !== null && movement !== null
          if (!readyForRule) {
            warming++
            continue
          }
          if (!matches) {
            noLongerMatching.add(market.key)
            continue
          }
          const change =
            settings.mode === "price"
              ? priceWindow!.fraction
              : settings.mode === "volume"
                ? minute!.fraction
                : movement!.change
          rows.push({
            market: { key: market.key, symbol: market.symbol },
            since: now,
            updated: figure.updatedAt,
            change,
            rule:
              settings.mode === "price"
                ? `price rose ${(change * 100).toFixed(2)}% over the preceding ${settings.priceWindowSeconds / 60} minute${settings.priceWindowSeconds === 60 ? "" : "s"}`
                : `${settings.mode === "both" ? "volume and volatility" : settings.mode} matched; price change ${(change * 100).toFixed(2)}% over ${settings.mode === "volume" ? "the preceding minute" : `the ${settings.interval} candle`}`,
          })
        }
      }
      remember(rows, noLongerMatching)
      setSnapshot({
        loaded: true,
        rows,
        total: markets.length,
        candles: candleMarkets.length,
        warming,
        unavailable,
        errors: [...errors.values()],
      })
    }
    void loadScannerCatalogs(settings.exchanges)
      .then((answers) => {
        if (disposed) return
        catalogs = answers.flatMap((answer) =>
          answer.catalog ? [answer.catalog] : []
        )
        for (const answer of answers)
          if (answer.error) errors.set(answer.protocol, answer.error)
        markets = catalogs.flatMap((catalog) => catalog.rows)
        const owned = new Set(workspaceVenues.split("|"))
        const extra = catalogs.filter(
          (catalog) =>
            !owned.has(`${catalog.protocol}:${catalog.network}`) &&
            !!getLiveAdapter(catalog.protocol)?.watchFigures
        )
        const catchUp = () => {
          generation++
          bars.clear()
          updated.clear()
          for (const market of candleMarkets) refreshQueue.add(market.key)
          void fetchNext()
        }
        stops.push(startLiveMarketData(extra, catchUp))
        // Watch recovery even when the workspace owns the figures subscription.
        for (const catalog of catalogs) {
          const adapter = getLiveAdapter(catalog.protocol)
          if (adapter)
            stops.push(adapter.watchCatchUp(catalog.network, catchUp))
        }
        candleMarkets =
          settings.mode === "price"
            ? []
            : markets
                .filter(
                  (m) =>
                    !!getLiveAdapter(parseMarketKey(m.key)!.protocol)
                      ?.watchFigures
                )
                .sort(
                  (a, b) =>
                    b.volume24hUsd - a.volume24hUsd ||
                    a.key.localeCompare(b.key)
                )
                .slice(0, SCANNER_CANDLE_LIMIT)
        for (const market of candleMarkets) {
          refreshQueue.add(market.key)
          stops.push(
            watchLiveCandle(market.key, settings.interval, (bar) => {
              if (disposed) return
              const previous = bars.get(market.key) ?? []
              const merged = new Map(
                previous.map((value) => [value.openTime, value])
              )
              merged.set(bar.openTime, bar)
              bars.set(
                market.key,
                [...merged.values()]
                  .sort((a, b) => a.openTime - b.openTime)
                  .slice(-102)
              )
              if (
                bar.openTime ===
                Math.floor(Date.now() / scannerIntervalMs[settings.interval]) *
                  scannerIntervalMs[settings.interval]
              )
                updated.set(market.key, Date.now())
            })
          )
        }
        ready = true
        void fetchNext()
        evaluate()
      })
      .catch(() => {
        if (!disposed)
          setSnapshot({
            ...empty,
            loaded: true,
            errors: ["Could not load scanner markets. Retry to reconnect."],
          })
      })
    const timer = setInterval(evaluate, 1000)
    return () => {
      disposed = true
      clearInterval(timer)
      clearTimeout(delay)
      stops.forEach((stop) => stop())
    }
  }, [settings, workspaceVenues, retry, remember])
  return {
    snapshot: {
      ...(settings.enabled ? snapshot : empty),
      rows: detections.rows,
      errors: [...snapshot.errors, ...(storageError ? [storageError] : [])],
    },
    dismiss,
    retry: () => setRetry((value) => value + 1),
  }
}
