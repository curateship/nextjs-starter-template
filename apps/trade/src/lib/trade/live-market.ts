import * as React from "react"

import {
  marketKey,
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type LiveFigures,
  type MarketCatalog,
} from "@/lib/protocols/contracts"
import { getLiveAdapter } from "@/lib/protocols/live-registry"

/**
 * The app's one live-data store, and the hooks screens read it through.
 *
 * The workspace starts a watch per catalog; the protocol's feed pushes
 * changed figures; each row and the header tooltip subscribe to exactly the
 * market they draw. A tick therefore re-renders the rows whose numbers
 * actually moved — nothing else — which is what keeps 300 rows smooth.
 *
 * Deliberately exchange-blind: everything arrives through the live registry
 * in app shapes, keyed by full market keys built from the catalog's own
 * protocol and network.
 */

const figures = new Map<string, LiveFigures>()
const keyListeners = new Map<string, Set<() => void>>()
const catchUpListeners = new Set<() => void>()

function notifyKey(key: string) {
  const listeners = keyListeners.get(key)
  if (listeners) for (const listener of listeners) listener()
}

/**
 * Start living: one figures watch, one status watch and one catch-up watch
 * per catalog. Returns the stop for the workspace's effect cleanup.
 *
 * With several protocols the app-wide status is simply the last one to
 * speak — revisit when a second live feed actually exists.
 */
export function startLiveMarketData(
  catalogs: MarketCatalog[],
  onCatchUp: () => void
): () => void {
  const stops = catalogs.flatMap((catalog) => {
    const adapter = getLiveAdapter(catalog.protocol)
    return [
      adapter.watchFigures(catalog.network, (updates) => {
        for (const [marketId, next] of updates) {
          const key = marketKey({
            protocol: catalog.protocol,
            network: catalog.network,
            marketId,
          })
          figures.set(key, next)
          notifyKey(key)
        }
      }),
      adapter.watchCatchUp(catalog.network, () => {
        onCatchUp()
        // Consumers with their own fetches — the chart's candles — refetch
        // on the same signal.
        for (const listener of catchUpListeners) listener()
      }),
    ]
  })
  return () => {
    for (const stop of stops) stop()
  }
}

/** Runs the callback each time the feed recovers from a gap. */
export function useLiveCatchUp(onCatchUp: () => void) {
  const ref = React.useRef(onCatchUp)
  React.useEffect(() => {
    ref.current = onCatchUp
  }, [onCatchUp])
  React.useEffect(() => {
    const listener = () => ref.current()
    catchUpListeners.add(listener)
    return () => {
      catchUpListeners.delete(listener)
    }
  }, [])
}

/** The live figures for one market, or null until its first tick. */
export function useLiveFigures(key: string | null): LiveFigures | null {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (!key) return () => {}
      let listeners = keyListeners.get(key)
      if (!listeners) {
        listeners = new Set()
        keyListeners.set(key, listeners)
      }
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0) keyListeners.delete(key)
      }
    },
    [key]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => (key ? (figures.get(key) ?? null) : null),
    () => null
  )
}

/**
 * The working bar of the chart's market, delivered to a callback — the chart
 * updates its last candle in place rather than re-rendering per tick.
 */
export function useLiveCandle(
  key: string | null,
  interval: CandleInterval,
  onBar: (bar: CandleBar) => void
) {
  // The latest callback without resubscribing the exchange feed per render.
  const onBarRef = React.useRef(onBar)
  React.useEffect(() => {
    onBarRef.current = onBar
  }, [onBar])

  React.useEffect(() => {
    if (!key) return
    const ref = parseMarketKey(key)
    if (!ref) return
    return getLiveAdapter(ref.protocol).watchCandle(
      ref.network,
      ref.marketId,
      interval,
      (bar) => onBarRef.current(bar)
    )
  }, [key, interval])
}
