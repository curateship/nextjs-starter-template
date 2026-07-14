import {
  InfoClient,
  HttpTransport,
  SubscriptionClient,
  WebSocketTransport,
  type AllDexsAssetCtxsWsEvent,
  type AllDexsClearinghouseStateWsEvent,
  type CandleWsEvent,
  type L2BookWsEvent,
  type OpenOrdersWsEvent,
  type TradesWsEvent,
  type UserFillsWsEvent,
} from "@nktkas/hyperliquid"

import type { TradingNetwork } from "@/lib/hl/network"

/**
 * Browser-side Hyperliquid market data hub.
 *
 * One SubscriptionClient per network, with refcounted multiplexed
 * subscriptions: any number of components can listen to the same stream
 * through a single exchange subscription. All data here is public (market
 * data and address-keyed account state) — no keys are ever involved.
 */

type Listener = (data: unknown) => void

type HubEntry = {
  refCount: number
  listeners: Set<Listener>
  subscription: Promise<{ unsubscribe: () => Promise<void> } | null>
}

const subscriptionClients = new Map<TradingNetwork, SubscriptionClient>()
const infoClients = new Map<TradingNetwork, InfoClient>()
const entries = new Map<string, HubEntry>()

function getSubscriptionClient(network: TradingNetwork) {
  let client = subscriptionClients.get(network)
  if (!client) {
    client = new SubscriptionClient({
      transport: new WebSocketTransport({ isTestnet: network === "testnet" }),
    })
    subscriptionClients.set(network, client)
  }
  return client
}

/** Public info client for HTTP snapshots (candles, meta). Browser-safe. */
export function getBrowserInfoClient(network: TradingNetwork) {
  let client = infoClients.get(network)
  if (!client) {
    client = new InfoClient({
      transport: new HttpTransport({ isTestnet: network === "testnet" }),
    })
    infoClients.set(network, client)
  }
  return client
}

function acquire<T>(
  key: string,
  listener: (data: T) => void,
  subscribe: (emit: Listener) => Promise<{ unsubscribe: () => Promise<void> }>
): () => void {
  let entry = entries.get(key)
  if (!entry) {
    const listeners = new Set<Listener>()
    const created: HubEntry = {
      refCount: 0,
      listeners,
      subscription: subscribe((data) => {
        for (const emit of listeners) emit(data)
      }).catch((error: unknown) => {
        console.error(`Hyperliquid subscription failed: ${key}`, error)
        return null
      }),
    }
    entry = created
    entries.set(key, entry)
  }

  const current = entry
  current.refCount += 1
  current.listeners.add(listener as Listener)

  return () => {
    current.listeners.delete(listener as Listener)
    current.refCount -= 1
    if (current.refCount <= 0) {
      entries.delete(key)
      void current.subscription.then((subscription) =>
        subscription?.unsubscribe().catch(() => {})
      )
    }
  }
}

export function subscribeAllDexsAssetCtxs(
  network: TradingNetwork,
  listener: (data: AllDexsAssetCtxsWsEvent) => void
) {
  return acquire(`${network}:allDexsAssetCtxs`, listener, (emit) =>
    getSubscriptionClient(network).allDexsAssetCtxs((data) => emit(data))
  )
}

export function subscribeAllDexsClearinghouseState(
  network: TradingNetwork,
  user: `0x${string}`,
  listener: (data: AllDexsClearinghouseStateWsEvent) => void
) {
  return acquire(
    `${network}:allDexsClearinghouseState:${user.toLowerCase()}`,
    listener,
    (emit) =>
      getSubscriptionClient(network).allDexsClearinghouseState(
        { user },
        (data) => emit(data)
      )
  )
}

export function subscribeOpenOrders(
  network: TradingNetwork,
  user: `0x${string}`,
  dex: string,
  listener: (data: OpenOrdersWsEvent) => void
) {
  return acquire(
    `${network}:openOrders:${user.toLowerCase()}:${dex}`,
    listener,
    (emit) =>
      getSubscriptionClient(network).openOrders({ user, dex }, (data) =>
        emit(data)
      )
  )
}

export function subscribeCandle(
  network: TradingNetwork,
  coin: string,
  interval: CandleInterval,
  listener: (data: CandleWsEvent) => void
) {
  return acquire(`${network}:candle:${coin}:${interval}`, listener, (emit) =>
    getSubscriptionClient(network).candle({ coin, interval }, (data) =>
      emit(data)
    )
  )
}

export function subscribeL2Book(
  network: TradingNetwork,
  coin: string,
  listener: (data: L2BookWsEvent) => void
) {
  return acquire(`${network}:l2Book:${coin}`, listener, (emit) =>
    getSubscriptionClient(network).l2Book({ coin }, (data) => emit(data))
  )
}

export function subscribeTrades(
  network: TradingNetwork,
  coin: string,
  listener: (data: TradesWsEvent) => void
) {
  return acquire(`${network}:trades:${coin}`, listener, (emit) =>
    getSubscriptionClient(network).trades({ coin }, (data) => emit(data))
  )
}

export function subscribeUserFills(
  network: TradingNetwork,
  user: `0x${string}`,
  listener: (data: UserFillsWsEvent) => void
) {
  return acquire(
    `${network}:userFills:${user.toLowerCase()}`,
    listener,
    (emit) =>
      getSubscriptionClient(network).userFills({ user }, (data) => emit(data))
  )
}

export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const
export type CandleInterval = (typeof CANDLE_INTERVALS)[number]
