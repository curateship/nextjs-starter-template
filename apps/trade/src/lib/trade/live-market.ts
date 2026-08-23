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
    // An exchange the app only reads markets from has nothing to stream, so it
    // contributes no subscriptions. Its rows still draw — they just do not tick.
    if (!adapter) return []
    return [
      // An exchange whose socket cannot follow a whole list contributes no
      // figures watch; its rows draw from the catalogue and redraw when the
      // page does.
      adapter.watchFigures?.(catalog.network, (updates) => {
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
    // An exchange with no figures watch contributed nothing to stop.
    for (const stop of stops) stop?.()
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
 * The live price of several markets at once, as one map.
 *
 * A table of positions needs this rather than a subscription per row: sorting
 * a column by what a position is worth has to happen where the rows are, and a
 * row subscribing on its own behalf would leave the sort reading one price
 * while the row prints another.
 *
 * The keys are joined into one string to compare with, so a caller may build a
 * fresh array on every render without resubscribing on every render.
 */
export function useLiveMarks(
  keys: readonly string[]
): ReadonlyMap<string, number> {
  const joined = keys.join("|")
  const wanted = React.useMemo(
    () => (joined === "" ? [] : joined.split("|")),
    [joined]
  )

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const added = wanted.map((key) => {
        let listeners = keyListeners.get(key)
        if (!listeners) {
          listeners = new Set()
          keyListeners.set(key, listeners)
        }
        listeners.add(onChange)
        return { key, listeners }
      })
      return () => {
        for (const { key, listeners } of added) {
          listeners.delete(onChange)
          if (listeners.size === 0) keyListeners.delete(key)
        }
      }
    },
    [wanted]
  )

  // Rebuilt only when a price this caller actually watches has moved, so the
  // snapshot stays the same object between ticks that changed nothing here.
  const snapshot = React.useRef<ReadonlyMap<string, number>>(new Map())
  const read = React.useCallback(() => {
    const next = new Map<string, number>()
    for (const key of wanted) {
      const price = figures.get(key)?.price
      if (price !== undefined) next.set(key, price)
    }
    const previous = snapshot.current
    if (previous.size === next.size) {
      let same = true
      for (const [key, price] of next) {
        if (previous.get(key) !== price) {
          same = false
          break
        }
      }
      if (same) return previous
    }
    snapshot.current = next
    return next
  }, [wanted])

  return React.useSyncExternalStore(subscribe, read, () => snapshot.current)
}

/**
 * The working bar of one market and timeframe, delivered to a callback for as
 * long as the returned function has not been called. No stream for the
 * exchange means nothing is delivered and the chart keeps the bars it
 * fetched. This is the plain form the chart subscribes with itself, so a
 * tick reaches the candle series directly and never passes through React
 * state.
 */
export function watchLiveCandle(
  key: string | null,
  interval: CandleInterval,
  onBar: (bar: CandleBar) => void
): () => void {
  if (!key) return () => {}
  const ref = parseMarketKey(key)
  if (!ref) return () => {}
  const adapter = getLiveAdapter(ref.protocol)
  if (!adapter) return () => {}
  return adapter.watchCandle(ref.network, ref.marketId, interval, onBar)
}
