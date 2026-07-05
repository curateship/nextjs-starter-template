import * as React from "react"
import type {
  CandleWsEvent,
  L2BookWsEvent,
  TradesWsEvent,
  WebData2WsEvent,
} from "@nktkas/hyperliquid"

import type { TradingNetwork } from "@/lib/hl/network"
import {
  getBrowserInfoClient,
  subscribeAllMids,
  subscribeCandle,
  subscribeL2Book,
  subscribeTrades,
  subscribeWebData2,
  type CandleInterval,
} from "@/lib/hl/ws"

const CANDLE_HISTORY = 500
const META_REFRESH_MS = 30_000
const TAPE_LENGTH = 60

const EMPTY_MIDS: Record<string, string> = {}
const EMPTY_CANDLES: CandleWsEvent[] = []
const EMPTY_TRADES: TapeTrade[] = []

export type Candle = CandleWsEvent
export type TapeTrade = TradesWsEvent[number]

/**
 * All hooks here key their state by the subscription identity instead of
 * resetting synchronously in effects: when the key changes, stale state is
 * simply ignored until the new stream produces data.
 */

type Keyed<T> = { key: string; data: T }

export function useAllMids(network: TradingNetwork) {
  const [state, setState] = React.useState<Keyed<Record<string, string>> | null>(
    null
  )

  React.useEffect(
    () =>
      subscribeAllMids(network, (event) => {
        setState({ key: network, data: event.mids })
      }),
    [network]
  )

  return state?.key === network ? state.data : EMPTY_MIDS
}

export function useCandles(
  network: TradingNetwork,
  coin: string,
  interval: CandleInterval
) {
  const key = `${network}:${coin}:${interval}`
  const [state, setState] = React.useState<Keyed<{
    candles: Candle[]
    seeded: boolean
  }> | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const intervalMs = candleIntervalMs(interval)
    void getBrowserInfoClient(network)
      .candleSnapshot({
        coin,
        interval,
        startTime: Date.now() - intervalMs * CANDLE_HISTORY,
      })
      .then((snapshot) => {
        if (cancelled) return
        setState((prev) => {
          const streamed =
            prev?.key === key && prev.data.candles.length > 0
              ? prev.data.candles
              : []
          return { key, data: { candles: mergeSnapshot(snapshot, streamed), seeded: true } }
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) =>
            prev?.key === key
              ? { key, data: { ...prev.data, seeded: true } }
              : { key, data: { candles: [], seeded: true } }
          )
        }
      })

    const unsubscribe = subscribeCandle(network, coin, interval, (candle) => {
      setState((prev) => {
        if (prev?.key === key) {
          return {
            key,
            data: {
              candles: mergeCandle(prev.data.candles, candle),
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
  }, [network, coin, interval, key])

  const current = state?.key === key ? state.data : null
  return {
    candles: current?.candles ?? EMPTY_CANDLES,
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

export function useWebData2(
  network: TradingNetwork,
  address: string | null | undefined
) {
  const key = `${network}:${address ?? ""}`
  const [state, setState] = React.useState<Keyed<WebData2WsEvent> | null>(null)

  React.useEffect(() => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return
    return subscribeWebData2(network, address as `0x${string}`, (data) => {
      setState({ key, data })
    })
  }, [network, address, key])

  return state?.key === key ? state.data : null
}

export type MarketRow = {
  coin: string
  szDecimals: number
  maxLeverage: number
  markPx: string
  prevDayPx: string
  funding: string
  openInterest: string
  dayNtlVlm: string
}

/** Watchlist metadata: metaAndAssetCtxs polled over HTTP. */
export function useMarketRows(network: TradingNetwork) {
  const [rows, setRows] = React.useState<MarketRow[]>([])

  React.useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const [meta, assetCtxs] =
          await getBrowserInfoClient(network).metaAndAssetCtxs()
        if (cancelled) return
        const next: MarketRow[] = []
        meta.universe.forEach((asset, index) => {
          const ctx = assetCtxs[index]
          if (!ctx || asset.isDelisted) return
          next.push({
            coin: asset.name,
            szDecimals: asset.szDecimals,
            maxLeverage: asset.maxLeverage,
            markPx: ctx.markPx,
            prevDayPx: ctx.prevDayPx,
            funding: ctx.funding,
            openInterest: ctx.openInterest,
            dayNtlVlm: ctx.dayNtlVlm,
          })
        })
        setRows(next)
      } catch {
        // transient; next poll retries
      }
    }

    void refresh()
    const timer = setInterval(() => void refresh(), META_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [network])

  return rows
}

function mergeSnapshot(snapshot: Candle[], streamed: Candle[]): Candle[] {
  if (streamed.length === 0) return snapshot
  const byTime = new Map<number, Candle>()
  for (const candle of snapshot) byTime.set(candle.t, candle)
  for (const candle of streamed) byTime.set(candle.t, candle)
  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

function mergeCandle(current: Candle[], candle: Candle): Candle[] {
  const last = current[current.length - 1]
  if (!last || candle.t > last.t) {
    return [...current, candle].slice(-CANDLE_HISTORY * 2)
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
