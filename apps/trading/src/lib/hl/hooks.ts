import * as React from "react"
import type {
  CandleWsEvent,
  L2BookWsEvent,
  TradesWsEvent,
} from "@nktkas/hyperliquid"

import type { TradingNetwork } from "@/lib/hl/network"
import {
  buildPerpMarkets,
  type PerpMarketDefinition,
} from "@/lib/hl/perp-markets"
import { resolveTradingBalance } from "@/lib/hl/account-balance"
import {
  CANDLE_INTERVALS,
  getBrowserInfoClient,
  subscribeAllDexsAssetCtxs,
  subscribeAllDexsClearinghouseState,
  subscribeCandle,
  subscribeL2Book,
  subscribeOpenOrders,
  subscribeTrades,
  type CandleInterval,
} from "@/lib/hl/ws"

const TAPE_LENGTH = 60

const EMPTY_CANDLES: CandleWsEvent[] = []
const EMPTY_TRADES: TapeTrade[] = []
const EMPTY_MARKET_ROWS: MarketRow[] = []

export type Candle = CandleWsEvent
export type TapeTrade = TradesWsEvent[number]

/**
 * All hooks here key their state by the subscription identity instead of
 * resetting synchronously in effects: when the key changes, stale state is
 * simply ignored until the new stream produces data.
 */

type Keyed<T> = { key: string; data: T }

/**
 * Last-known candles per network:coin:interval, so a timeframe/market switch
 * paints instantly from memory while the fresh snapshot loads behind it.
 * Prefetching fills it for the other intervals of the coin on screen, making
 * the first switch instant too. FIFO-capped so it can't hoard memory.
 */
const CANDLE_CACHE_MAX_KEYS = 36
const candleCache = new Map<string, Candle[]>()
const candlePrefetching = new Set<string>()

function cacheCandles(key: string, candles: Candle[]) {
  candleCache.delete(key)
  candleCache.set(key, candles)
  while (candleCache.size > CANDLE_CACHE_MAX_KEYS) {
    const oldest = candleCache.keys().next().value
    if (oldest === undefined) break
    candleCache.delete(oldest)
  }
}

/** Warm the cache for the coin's other timeframes; best-effort. */
function prefetchCandleIntervals(
  network: TradingNetwork,
  coin: string,
  activeInterval: CandleInterval,
  maxCandles: number
) {
  for (const interval of CANDLE_INTERVALS) {
    if (interval === activeInterval) continue
    const key = `${network}:${coin}:${interval}`
    if (candleCache.has(key) || candlePrefetching.has(key)) continue
    candlePrefetching.add(key)
    void getBrowserInfoClient(network)
      .candleSnapshot({
        coin,
        interval,
        startTime: Date.now() - candleIntervalMs(interval) * maxCandles,
      })
      .then((snapshot) => cacheCandles(key, snapshot))
      .catch(() => {
        // Prefetch is best-effort; the on-demand fetch still covers it.
      })
      .finally(() => candlePrefetching.delete(key))
  }
}

export function useCandles(
  network: TradingNetwork,
  coin: string,
  interval: CandleInterval,
  /** History depth to load — the user's Max chart candles setting. */
  maxCandles: number
) {
  const key = `${network}:${coin}:${interval}`
  const [state, setState] = React.useState<Keyed<{
    candles: Candle[]
    seeded: boolean
  }> | null>(null)

  React.useEffect(() => {
    let cancelled = false

    // Instant paint from the last data seen for this key; the snapshot below
    // replaces it wholesale when it lands.
    const cached = candleCache.get(key)
    if (cached && cached.length > 0) {
      setState({ key, data: { candles: cached, seeded: true } })
    }

    // Candles the ws streams while the snapshot is in flight, merged over it
    // when it lands. Deliberately excludes cached bars: a stale cached bar
    // must never override its fresh snapshot version.
    let streamed: Candle[] = []

    const intervalMs = candleIntervalMs(interval)
    void getBrowserInfoClient(network)
      .candleSnapshot({
        coin,
        interval,
        startTime: Date.now() - intervalMs * maxCandles,
      })
      .then((snapshot) => {
        if (cancelled) return
        const merged = mergeSnapshot(snapshot, streamed)
        cacheCandles(key, merged)
        setState({ key, data: { candles: merged, seeded: true } })
        prefetchCandleIntervals(network, coin, interval, maxCandles)
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) =>
            prev?.key === key
              ? { key, data: { ...prev.data, seeded: true } }
              : { key, data: { candles: streamed, seeded: true } }
          )
        }
      })

    const unsubscribe = subscribeCandle(network, coin, interval, (candle) => {
      streamed = mergeCandle(streamed, candle, maxCandles)
      setState((prev) => {
        if (prev?.key === key) {
          return {
            key,
            data: {
              candles: mergeCandle(prev.data.candles, candle, maxCandles),
              seeded: prev.data.seeded,
            },
          }
        }
        return { key, data: { candles: [candle], seeded: false } }
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [network, coin, interval, key, maxCandles])

  const current = state?.key === key ? state.data : null

  // Keep the cache tracking the live stream, so switching back to this
  // timeframe later seeds with bars as fresh as when the user left it.
  React.useEffect(() => {
    if (current?.seeded && current.candles.length > 0) {
      cacheCandles(key, current.candles)
    }
  }, [current, key])

  return {
    // Hold candles back until the snapshot seeds: the ws delivers a lone live
    // candle almost instantly on a timeframe switch, and painting it would
    // zoom the chart to one giant bar for the second the snapshot takes.
    // Streamed candles still accumulate and merge in once it lands.
    candles: current?.seeded ? current.candles : EMPTY_CANDLES,
    loading: !(current?.seeded ?? false),
  }
}

export function useL2Book(network: TradingNetwork, coin: string) {
  const key = `${network}:${coin}`
  const [state, setState] = React.useState<Keyed<L2BookWsEvent> | null>(null)

  React.useEffect(
    () =>
      subscribeL2Book(network, coin, (book) => {
        setState({ key, data: book })
      }),
    [network, coin, key]
  )

  return state?.key === key ? state.data : null
}

export function useTrades(network: TradingNetwork, coin: string) {
  const key = `${network}:${coin}`
  const [state, setState] = React.useState<Keyed<TapeTrade[]> | null>(null)

  React.useEffect(
    () =>
      subscribeTrades(network, coin, (event) => {
        setState((prev) => {
          const current = prev?.key === key ? prev.data : []
          return {
            key,
            data: [...event].reverse().concat(current).slice(0, TAPE_LENGTH),
          }
        })
      }),
    [network, coin, key]
  )

  return state?.key === key ? state.data : EMPTY_TRADES
}

/** Account balances + open orders, in the shape the old webData2 feed used. */
type BrowserInfoClient = ReturnType<typeof getBrowserInfoClient>
export type AccountSnapshot = {
  clearinghouseState: Awaited<
    ReturnType<BrowserInfoClient["clearinghouseState"]>
  >
  openOrders: Awaited<ReturnType<BrowserInfoClient["frontendOpenOrders"]>>
  equity: string
  withdrawable: string
}

/**
 * Live positions and orders across every perpetual DEX for a real wallet.
 */
export function useAccountSnapshot(
  network: TradingNetwork,
  address: string | null | undefined,
  market: Pick<MarketRow, "dex" | "collateralToken"> | null,
  dexes: readonly string[]
) {
  const key = `${network}:${address ?? ""}:${market?.dex ?? ""}`
  const dexKey = JSON.stringify(dexes)
  const [state, setState] = React.useState<Keyed<AccountSnapshot> | null>(null)

  React.useEffect(() => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return
    let cancelled = false
    const user = address as `0x${string}`
    const unsubscribers: Array<() => void> = []

    async function connect() {
      try {
        const client = getBrowserInfoClient(network)
        const [accountMode, spotState] = await Promise.all([
          client.userAbstraction({ user }),
          client.spotClearinghouseState({ user }),
        ])
        if (cancelled) return
        const states = new Map<string, AccountSnapshot["clearinghouseState"]>()
        const ordersByDex = new Map<string, AccountSnapshot["openOrders"]>()

        const publish = () => {
          const selected = states.get(market?.dex ?? "") ?? states.get("")
          if (!selected || cancelled) return
          const balance = resolveTradingBalance(
            accountMode,
            selected,
            spotState,
            market?.collateralToken
          )
          setState({
            key,
            data: {
              clearinghouseState: {
                ...selected,
                assetPositions: [...states.values()].flatMap(
                  (item) => item.assetPositions
                ),
              },
              openOrders: [...ordersByDex.values()].flat(),
              ...balance,
            },
          })
        }

        unsubscribers.push(
          subscribeAllDexsClearinghouseState(network, user, (event) => {
            for (const [dex, clearinghouse] of event.clearinghouseStates) {
              states.set(dex, clearinghouse)
            }
            publish()
          })
        )
        const subscribedDexes = JSON.parse(dexKey) as string[]
        for (const dex of subscribedDexes) {
          unsubscribers.push(
            subscribeOpenOrders(network, user, dex, (event) => {
              ordersByDex.set(dex, event.orders)
              publish()
            })
          )
        }
      } catch {
        // A future remount or wallet switch retries the complete account feed.
      }
    }

    void connect()
    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [network, address, market?.dex, market?.collateralToken, dexKey, key])

  return state?.key === key ? state.data : null
}

export type MarketRow = PerpMarketDefinition & {
  markPx: string
  oraclePx: string
  prevDayPx: string
  funding: string
  openInterest: string
  dayNtlVlm: string
}

/** All active perpetual markets, kept live by Hyperliquid's all-DEX stream. */
export function useMarketRows(network: TradingNetwork) {
  const [state, setState] = React.useState<Keyed<MarketRow[]> | null>(null)

  React.useEffect(() => {
    let cancelled = false

    let unsubscribe: (() => void) | null = null

    async function connect() {
      try {
        const info = getBrowserInfoClient(network)
        const [dexs, metas, categories, spotMeta] = await Promise.all([
          info.perpDexs(),
          info.allPerpMetas(),
          info.perpCategories(),
          info.spotMeta(),
        ])
        if (cancelled) return
        const markets = buildPerpMarkets(
          dexs,
          metas,
          categories,
          spotMeta.tokens
        )
        unsubscribe = subscribeAllDexsAssetCtxs(network, (event) => {
          const contexts = new Map(event.ctxs)
          const next: MarketRow[] = []
          for (const market of markets) {
            const ctx = contexts.get(market.dex)?.[market.assetIndex]
            if (!ctx) continue
            next.push({
              ...market,
              markPx: ctx.markPx,
              oraclePx: ctx.oraclePx,
              prevDayPx: ctx.prevDayPx,
              funding: ctx.funding,
              openInterest: ctx.openInterest,
              dayNtlVlm: ctx.dayNtlVlm,
            })
          }
          if (!cancelled) setState({ key: network, data: next })
        })
      } catch {
        // A future remount or network switch retries the complete catalog.
      }
    }

    void connect()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [network])

  return state?.key === network ? state.data : EMPTY_MARKET_ROWS
}

function mergeSnapshot(snapshot: Candle[], streamed: Candle[]): Candle[] {
  if (streamed.length === 0) return snapshot
  const byTime = new Map<number, Candle>()
  for (const candle of snapshot) byTime.set(candle.t, candle)
  for (const candle of streamed) byTime.set(candle.t, candle)
  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

function mergeCandle(
  current: Candle[],
  candle: Candle,
  maxCandles: number
): Candle[] {
  const last = current[current.length - 1]
  if (!last || candle.t > last.t) {
    return [...current, candle].slice(-maxCandles * 2)
  }
  if (candle.t === last.t) {
    const next = current.slice(0, -1)
    next.push(candle)
    return next
  }
  return current
}

export function candleIntervalMs(interval: CandleInterval): number {
  switch (interval) {
    case "1m":
      return 60_000
    case "5m":
      return 300_000
    case "15m":
      return 900_000
    case "1h":
      return 3_600_000
    case "4h":
      return 14_400_000
    case "1d":
      return 86_400_000
  }
}
