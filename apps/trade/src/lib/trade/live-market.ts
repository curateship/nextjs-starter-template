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
import { refreshMarketPrices } from "@/lib/api/trade/markets"

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
const pendingKeys = new Set<string>()
let pendingFrame: number | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let watchingVisibility = false

function flushFigureNotifications() {
  pendingFrame = null
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  const listeners = new Set<() => void>()
  for (const key of pendingKeys) {
    for (const listener of keyListeners.get(key) ?? []) listeners.add(listener)
  }
  pendingKeys.clear()
  for (const listener of listeners) listener()
}

function flushOnVisibilityChange() {
  if (pendingKeys.size === 0) return
  if (pendingFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(pendingFrame)
    pendingFrame = null
  }
  flushFigureNotifications()
}

function scheduleFigureNotifications() {
  if (
    typeof document !== "undefined" &&
    !watchingVisibility
  ) {
    document.addEventListener("visibilitychange", flushOnVisibilityChange)
    watchingVisibility = true
  }
  const hidden =
    typeof document !== "undefined" && document.visibilityState === "hidden"
  if (hidden || typeof requestAnimationFrame !== "function") {
    if (pendingTimer === null) pendingTimer = setTimeout(flushFigureNotifications, 0)
    return
  }
  if (pendingFrame === null) {
    pendingFrame = requestAnimationFrame(flushFigureNotifications)
  }
}

function notifyKeys(keys: Iterable<string>) {
  for (const key of keys) pendingKeys.add(key)
  if (pendingKeys.size > 0) scheduleFigureNotifications()
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
    if (!adapter) {
      // No socket here. A venue that has none may still say how often its
      // screen is allowed to ASK — see `priceRefresh` on the catalogue, and
      // `startPriceRefresh` below for why that is not a live feed. A venue
      // that says nothing contributes nothing: its rows still draw, they
      // just do not move until the page reads the list again.
      return catalog.priceRefresh
        ? [startPriceRefresh(catalog, catalog.priceRefresh)]
        : []
    }
    return [
      // An exchange whose socket cannot follow a whole list contributes no
      // figures watch; its rows draw from the catalogue and redraw when the
      // page does.
      adapter.watchFigures?.(catalog.network, (updates) => {
        const changed: string[] = []
        for (const [marketId, next] of updates) {
          const key = marketKey({
            protocol: catalog.protocol,
            network: catalog.network,
            marketId,
          })
          figures.set(key, next)
          changed.push(key)
        }
        notifyKeys(changed)
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

/**
 * Prices for a venue with no socket, asked for on that venue's own clock.
 *
 * **This is a refresh, not a live feed, and the difference is the point.**
 * `rules/trading-rules.md` forbids asking an exchange on a timer as the live
 * path, because an old snapshot that looks live is how a stale price reaches
 * a decision about money. So this drives the SCREEN only. The trading engine
 * never reads it: when the engine acts it asks for a price at that moment.
 * The server refuses a refresh outright for any venue that does publish a
 * feed, so the rule holds even if a future dashboard forgets it.
 *
 * Solana is the case it was written for. Jupiter publishes no socket, and a
 * Solana coin's price is the best path across several pools rather than one
 * pool's numbers, so there is nothing to subscribe to yet.
 *
 * Three things keep it cheap: only the busiest markets are asked about, a
 * hidden tab asks nothing at all, and a failed turn changes nothing on
 * screen and simply waits for the next one.
 */
function startPriceRefresh(
  catalog: MarketCatalog,
  refresh: NonNullable<MarketCatalog["priceRefresh"]>
): () => void {
  // Busiest first: one refresh cannot carry a catalogue of thousands, and
  // the markets worth watching are the ones being traded.
  const watched = [...catalog.rows]
    .sort((left, right) => right.volume24hUsd - left.volume24hUsd)
    .slice(0, refresh.mostMarkets)
  if (watched.length === 0) return () => {}
  const rowById = new Map(watched.map((row) => [row.marketId, row]))

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const askLater = () => {
    if (stopped) return
    timer = setTimeout(() => void ask(), refresh.everyMs)
  }

  const ask = async () => {
    if (stopped) return
    // A tab nobody is looking at spends nobody's allowance.
    const hidden =
      typeof document !== "undefined" && document.visibilityState === "hidden"
    if (hidden) {
      askLater()
      return
    }
    try {
      const { prices } = await refreshMarketPrices(
        catalog.protocol,
        catalog.network,
        [...rowById.keys()]
      )
      const changed: string[] = []
      for (const [marketId, price] of prices) {
        const row = rowById.get(marketId)
        if (!row || !(price > 0)) continue
        const key = marketKey({
          protocol: catalog.protocol,
          network: catalog.network,
          marketId,
        })
        const was = figures.get(key)
        if (was?.price === price) continue
        figures.set(key, {
          // Only the price is refreshed. The day's move and volume come from
          // the list's own read; overwriting them with nothing would blank
          // the columns beside a price that had just moved.
          change24h: was?.change24h ?? row.change24h,
          volume24hUsd: was?.volume24hUsd ?? row.volume24hUsd,
          fundingHourly: was?.fundingHourly ?? row.fundingHourly,
          openInterestUsd: was?.openInterestUsd ?? row.openInterestUsd,
          price,
        })
        changed.push(key)
      }
      notifyKeys(changed)
    } catch {
      // The venue would not answer, or the minute had no room. What is on
      // screen stays, and the next turn asks again.
    }
    askLater()
  }

  // The first ask waits a full turn: the list's own prices arrived with the
  // page and are the freshest thing there is.
  askLater()
  return () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
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

/**
 * What one market costs right now, read once, or null before its first tick.
 *
 * **Not a subscription.** It is for the moment something is opened — a window
 * that needs the price it is about to trade at — where a hook would tie the
 * whole screen around it to a feed that ticks once a second. The chart panel is
 * the caller that matters: holding a price in its state redrew every layer over
 * the candles on every tick, which is exactly what `watchLiveCandle` exists to
 * avoid.
 */
export function liveMarkOf(key: string): number | null {
  return figures.get(key)?.price ?? null
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
  // `getSnapshot` is called during ordinary React checks too. Keep the last
  // object until one of this hook's own keys is in a flushed batch.
  const snapshot = React.useRef<ReadonlyMap<string, number>>(new Map())
  const snapshotKeys = React.useRef<string | null>(null)
  const dirty = React.useRef(true)

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const listener = () => {
        dirty.current = true
        onChange()
      }
      const added = wanted.map((key) => {
        let listeners = keyListeners.get(key)
        if (!listeners) {
          listeners = new Set()
          keyListeners.set(key, listeners)
        }
        listeners.add(listener)
        return { key, listeners }
      })
      return () => {
        for (const { key, listeners } of added) {
          listeners.delete(listener)
          if (listeners.size === 0) keyListeners.delete(key)
        }
      }
    },
    [wanted]
  )

  const read = React.useCallback(() => {
    if (snapshotKeys.current !== joined) dirty.current = true
    if (!dirty.current) return snapshot.current
    const next = new Map<string, number>()
    for (const key of wanted) {
      const price = figures.get(key)?.price
      if (price !== undefined) next.set(key, price)
    }
    snapshot.current = next
    snapshotKeys.current = joined
    dirty.current = false
    return next
  }, [joined, wanted])

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
