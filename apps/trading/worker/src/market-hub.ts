import {
  InfoClient,
  HttpTransport,
  SubscriptionClient,
  WebSocketTransport,
  type CandleWsEvent,
  type L2BookWsEvent,
  type TradesWsEvent,
  type UserFillsWsEvent,
} from "@nktkas/hyperliquid"

import { assertNetworkEnabled } from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import type { CandleInterval } from "./strategies/contract"

const CANDLE_HISTORY = 1400

type Listener<T> = (data: T) => void

type Sub = {
  refCount: number
  listeners: Set<Listener<unknown>>
  promise: Promise<{ unsubscribe: () => Promise<void> } | null>
}

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * Worker-side market data hub: one SubscriptionClient per network,
 * refcounted multiplexed subscriptions, and candle ring buffers warmed from
 * HTTP snapshots. All BotRunners share the same streams.
 */
export class MarketHub {
  private readonly subClients = new Map<TradingNetwork, SubscriptionClient>()
  private readonly infoClients = new Map<TradingNetwork, InfoClient>()
  private readonly subs = new Map<string, Sub>()
  private readonly candles = new Map<string, CandleWsEvent[]>()
  private readonly mids = new Map<string, Record<string, string>>()

  subscriptionCount() {
    return this.subs.size
  }

  info(network: TradingNetwork): InfoClient {
    let client = this.infoClients.get(network)
    if (!client) {
      assertNetworkEnabled(network)
      client = new InfoClient({
        transport: new HttpTransport({ isTestnet: network === "testnet" }),
      })
      this.infoClients.set(network, client)
    }
    return client
  }

  /** Latest mid for a coin on its DEX, "0" until allMids has streamed. */
  mid(network: TradingNetwork, dex: string, coin: string): string {
    return this.mids.get(`${network}:${dex}`)?.[coin] ?? "0"
  }

  subscribeMids(
    network: TradingNetwork,
    dex: string,
    listener: Listener<Record<string, string>>
  ): () => void {
    return this.acquire(`${network}:allMids:${dex}`, listener, (client, emit) =>
      client.allMids({ dex }, (event) => {
        this.mids.set(`${network}:${dex}`, event.mids)
        emit(event.mids)
      })
    )
  }

  subscribeBook(
    network: TradingNetwork,
    coin: string,
    listener: Listener<L2BookWsEvent>
  ): () => void {
    return this.acquire(`${network}:l2Book:${coin}`, listener, (client, emit) =>
      client.l2Book({ coin }, (event) => emit(event))
    )
  }

  subscribeTrades(
    network: TradingNetwork,
    coin: string,
    listener: Listener<TradesWsEvent>
  ): () => void {
    return this.acquire(`${network}:trades:${coin}`, listener, (client, emit) =>
      client.trades({ coin }, (event) => emit(event))
    )
  }

  subscribeUserFills(
    network: TradingNetwork,
    address: `0x${string}`,
    listener: Listener<UserFillsWsEvent>
  ): () => void {
    return this.acquire(
      `${network}:userFills:${address.toLowerCase()}`,
      listener,
      (client, emit) =>
        client.userFills({ user: address }, (event) => emit(event))
    )
  }

  /**
   * Subscribes to a candle stream, warms the ring buffer from a snapshot,
   * and invokes the listener with every streamed candle event.
   */
  async subscribeCandles(
    network: TradingNetwork,
    coin: string,
    interval: CandleInterval,
    listener: Listener<CandleWsEvent>
  ): Promise<() => void> {
    const key = `${network}:candle:${coin}:${interval}`

    const unsubscribe = this.acquire(key, listener, (client, emit) =>
      client.candle({ coin, interval }, (candle) => {
        this.pushCandle(key, candle)
        emit(candle)
      })
    )

    if (!this.candles.has(key)) {
      this.candles.set(key, [])
      try {
        const snapshot = await this.info(network).candleSnapshot({
          coin,
          interval,
          startTime: Date.now() - INTERVAL_MS[interval] * CANDLE_HISTORY,
        })
        const streamed = this.candles.get(key) ?? []
        const byTime = new Map<number, CandleWsEvent>()
        for (const candle of snapshot) byTime.set(candle.t, candle)
        for (const candle of streamed) byTime.set(candle.t, candle)
        this.candles.set(
          key,
          [...byTime.values()].sort((a, b) => a.t - b.t)
        )
      } catch (error) {
        console.error(`candle warmup failed for ${key}`, error)
      }
    }

    return unsubscribe
  }

  getCandles(
    network: TradingNetwork,
    coin: string,
    interval: CandleInterval,
    n: number
  ): CandleWsEvent[] {
    const key = `${network}:candle:${coin}:${interval}`
    const buffer = this.candles.get(key) ?? []
    return n >= buffer.length ? buffer : buffer.slice(buffer.length - n)
  }

  private client(network: TradingNetwork): SubscriptionClient {
    let client = this.subClients.get(network)
    if (!client) {
      assertNetworkEnabled(network)
      client = new SubscriptionClient({
        transport: new WebSocketTransport({
          isTestnet: network === "testnet",
        }),
      })
      this.subClients.set(network, client)
    }
    return client
  }

  private acquire<T>(
    key: string,
    listener: Listener<T>,
    subscribe: (
      client: SubscriptionClient,
      emit: Listener<T>
    ) => Promise<{ unsubscribe: () => Promise<void> }>
  ): () => void {
    const network = key.split(":")[0] as TradingNetwork
    let sub = this.subs.get(key)
    if (!sub) {
      const listeners = new Set<Listener<unknown>>()
      sub = {
        refCount: 0,
        listeners,
        promise: subscribe(this.client(network), (data) => {
          for (const emit of listeners) emit(data)
        }).catch((error: unknown) => {
          console.error(`subscription failed: ${key}`, error)
          return null
        }),
      }
      this.subs.set(key, sub)
    }

    const current = sub
    current.refCount += 1
    current.listeners.add(listener as Listener<unknown>)

    return () => {
      current.listeners.delete(listener as Listener<unknown>)
      current.refCount -= 1
      if (current.refCount <= 0) {
        this.subs.delete(key)
        void current.promise.then((subscription) =>
          subscription?.unsubscribe().catch(() => {})
        )
      }
    }
  }

  private pushCandle(key: string, candle: CandleWsEvent) {
    const buffer = this.candles.get(key)
    if (!buffer) return
    const last = buffer[buffer.length - 1]
    if (!last || candle.t > last.t) {
      buffer.push(candle)
      if (buffer.length > CANDLE_HISTORY * 2) {
        buffer.splice(0, buffer.length - CANDLE_HISTORY)
      }
    } else if (candle.t === last.t) {
      buffer[buffer.length - 1] = candle
    }
  }
}

export const marketHub = new MarketHub()
