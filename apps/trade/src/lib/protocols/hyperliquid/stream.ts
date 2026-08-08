import {
  CANDLE_INTERVALS,
  type CandleBar,
  type CandleInterval,
  type NetworkId,
} from "@/lib/protocols/contracts"
import {
  namespaceMarketId,
  num,
  sameFigures,
  toLiveFigures,
  type LiveFigures,
} from "@/lib/protocols/hyperliquid/translate"

/**
 * Hyperliquid's live side, in the browser.
 *
 * The exchange's market data is public and pushed over a public websocket, so
 * the browser subscribes directly — no key, no session, and no relay to
 * build. This file is the browser-side half of the fence: with
 * `src/server/protocols/hyperliquid/`, it is the only other place the
 * exchange package may be imported, and it may never import `@/server/*`.
 * `fence.test.ts` enforces both.
 *
 * One connection per network carries everything: a single all-venues
 * subscription streams every market's figures about once a second, and one
 * candle subscription per open chart streams its working bar. Consumers get
 * app shapes only.
 *
 * Health is judged by the data, not the socket: the figures stream ticks
 * steadily, so silence *is* the outage, whatever the socket claims. A
 * watchdog marks the feed stale after a quiet spell and rebuilds the
 * connection on a capped backoff; a hidden tab shuts the connection rather
 * than burning it; the first tick after any recovery announces a catch-up so
 * consumers can refetch what they missed.
 */

const STALE_AFTER_MS = 8_000
const WATCHDOG_EVERY_MS = 3_000
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
/** How long a connection outlives its last listener — a loader refresh
 * unsubscribes and resubscribes within a breath, and should not pay a
 * reconnect for it. */
const LINGER_MS = 5_000

/**
 * The connection's own health, driving reconnection and pause — internal
 * since the stale label was removed (7 Aug 2026); nothing on screen reads it.
 */
type LiveStatus = "connecting" | "live" | "stale" | "paused"

type FiguresListener = (updates: ReadonlyMap<string, LiveFigures>) => void
type CatchUpListener = () => void
type CandleListener = (bar: CandleBar) => void

type CandleWant = {
  marketId: string
  interval: CandleInterval
  listeners: Set<CandleListener>
  /** Torn down and remade on every (re)connect. */
  unsubscribe: (() => void) | null
}

type Hub = {
  network: NetworkId
  figuresListeners: Set<FiguresListener>
  catchUpListeners: Set<CatchUpListener>
  candles: Map<string, CandleWant>
  /** The last figures sent per market, so unchanged markets stay silent. */
  lastFigures: Map<string, LiveFigures>
  /** (venue name, index in its universe) → market id. */
  idByVenueIndex: Map<string, string[]>
  status: LiveStatus
  lastMessageAt: number
  /** True once live at least once — the next first-tick fires catch-up. */
  everLive: boolean
  recovering: boolean
  reconnectAttempt: number
  watchdog: ReturnType<typeof setInterval> | null
  lingerTimer: ReturnType<typeof setTimeout> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  generation: number
  /** A connect is in flight — its client lands late, so the flag guards. */
  connecting: boolean
  client: unknown
  transport: { close?: () => unknown } | null
  figuresUnsubscribe: (() => void) | null
  disposed: boolean
}

const hubs = new Map<NetworkId, Hub>()

function getHub(network: NetworkId): Hub {
  let hub = hubs.get(network)
  if (!hub) {
    hub = {
      network,
      figuresListeners: new Set(),
      catchUpListeners: new Set(),
      candles: new Map(),
      lastFigures: new Map(),
      idByVenueIndex: new Map(),
      status: "connecting",
      lastMessageAt: 0,
      everLive: false,
      recovering: false,
      reconnectAttempt: 0,
      watchdog: null,
      lingerTimer: null,
      reconnectTimer: null,
      generation: 0,
      connecting: false,
      client: null,
      transport: null,
      figuresUnsubscribe: null,
      disposed: false,
    }
    hubs.set(network, hub)
  }
  return hub
}

function setStatus(hub: Hub, status: LiveStatus) {
  hub.status = status
}

function hasConsumers(hub: Hub): boolean {
  return hub.figuresListeners.size > 0 || hub.candles.size > 0
}

/** The whole connection, torn down. Listeners and wants survive for rebuild. */
function teardown(hub: Hub) {
  hub.generation += 1
  hub.figuresUnsubscribe = null
  for (const want of hub.candles.values()) want.unsubscribe = null
  try {
    hub.transport?.close?.()
  } catch {
    // A socket that refuses to close is already gone.
  }
  hub.transport = null
  hub.client = null
  if (hub.watchdog) {
    clearInterval(hub.watchdog)
    hub.watchdog = null
  }
}

function scheduleReconnect(hub: Hub) {
  if (hub.reconnectTimer || hub.disposed) return
  const delay =
    RECONNECT_BACKOFF_MS[
      Math.min(hub.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)
    ]
  hub.reconnectAttempt += 1
  hub.reconnectTimer = setTimeout(() => {
    hub.reconnectTimer = null
    if (hasConsumers(hub) && !document.hidden) void connect(hub)
  }, delay)
}

/**
 * A tick arrived: the feed is alive. The first one after any gap that forced
 * a rebuild (or a hidden spell) announces catch-up, once.
 */
function markAlive(hub: Hub) {
  hub.lastMessageAt = Date.now()
  hub.reconnectAttempt = 0
  const wasRecovering = hub.recovering
  hub.recovering = false
  setStatus(hub, "live")
  if (hub.everLive && wasRecovering) {
    for (const listener of hub.catchUpListeners) listener()
  }
  hub.everLive = true
}

async function connect(hub: Hub) {
  // `connecting` and not just `client`: the client lands late in this
  // function, and two quick wake-ups — a resubscribe racing a reconnect
  // timer — must not open two sockets, one of which would leak.
  if (hub.connecting || hub.client || hub.disposed || !hasConsumers(hub)) {
    return
  }
  hub.connecting = true
  const generation = hub.generation
  setStatus(hub, hub.everLive ? "stale" : "connecting")

  try {
    const sdk = await import("@nktkas/hyperliquid")
    if (generation !== hub.generation || hub.disposed) return

    // The stream reports markets by venue and position, not by name, so the
    // name map comes first — refreshed on every connect, because a venue can
    // list a new market while we were away.
    const info = new sdk.InfoClient({
      transport: new sdk.HttpTransport({ isTestnet: hub.network === "testnet" }),
    })
    const [dexs, metas] = await Promise.all([
      info.perpDexs(),
      info.allPerpMetas(),
    ])
    if (generation !== hub.generation || hub.disposed) return
    hub.idByVenueIndex = new Map(
      metas.map((meta, index) => {
        const dex = index === 0 ? null : dexs[index]
        const name = dex?.name ?? ""
        return [
          name,
          meta.universe.map((asset) => namespaceMarketId(name, asset.name)),
        ]
      })
    )

    const transport = new sdk.WebSocketTransport({
      isTestnet: hub.network === "testnet",
    })
    const client = new sdk.SubscriptionClient({ transport })
    hub.transport = transport as Hub["transport"]
    hub.client = client

    // One subscription streams every venue's every market, ~once a second.
    const figuresSubscription = await client.allDexsAssetCtxs((event) => {
      if (generation !== hub.generation) return
      markAlive(hub)
      const updates = new Map<string, LiveFigures>()
      for (const [venue, ctxs] of event.ctxs) {
        const ids = hub.idByVenueIndex.get(venue)
        if (!ids) continue
        ctxs.forEach((ctx, index) => {
          const marketId = ids[index]
          if (!marketId) return
          const figures = toLiveFigures(ctx)
          if (!figures) return
          const last = hub.lastFigures.get(marketId)
          if (last && sameFigures(last, figures)) return
          hub.lastFigures.set(marketId, figures)
          updates.set(marketId, figures)
        })
      }
      if (updates.size === 0) return
      for (const listener of hub.figuresListeners) listener(updates)
    })
    if (generation !== hub.generation) {
      void figuresSubscription.unsubscribe().catch(() => {})
      return
    }
    hub.figuresUnsubscribe = () =>
      void figuresSubscription.unsubscribe().catch(() => {})

    for (const want of hub.candles.values()) {
      void attachCandle(hub, generation, want)
    }

    hub.lastMessageAt = Date.now()
    if (!hub.watchdog) {
      hub.watchdog = setInterval(() => {
        if (hub.status === "paused" || !hub.client) return
        if (Date.now() - hub.lastMessageAt <= STALE_AFTER_MS) return
        // Quiet too long: the socket may still claim health, but the data
        // says otherwise. Say so, tear down, rebuild on backoff.
        setStatus(hub, "stale")
        hub.recovering = true
        teardown(hub)
        scheduleReconnect(hub)
      }, WATCHDOG_EVERY_MS)
    }
  } catch {
    if (generation !== hub.generation || hub.disposed) return
    setStatus(hub, hub.everLive ? "stale" : "connecting")
    hub.recovering = hub.everLive
    teardown(hub)
    scheduleReconnect(hub)
  } finally {
    hub.connecting = false
  }
}

async function attachCandle(hub: Hub, generation: number, want: CandleWant) {
  const client = hub.client as {
    candle: (
      params: { coin: string; interval: CandleInterval },
      listener: (event: {
        t: number
        o: string
        h: string
        l: string
        c: string
        v: string
      }) => void
    ) => Promise<{ unsubscribe: () => Promise<unknown> }>
  } | null
  if (!client) return
  try {
    const subscription = await client.candle(
      { coin: want.marketId, interval: want.interval },
      (event) => {
        if (generation !== hub.generation) return
        markAlive(hub)
        const open = num(event.o)
        const high = num(event.h)
        const low = num(event.l)
        const close = num(event.c)
        if (open === null || high === null || low === null || close === null) {
          return
        }
        const bar: CandleBar = {
          openTime: event.t,
          open,
          high,
          low,
          close,
          volume: num(event.v) ?? 0,
        }
        for (const listener of want.listeners) listener(bar)
      }
    )
    if (generation !== hub.generation) {
      void subscription.unsubscribe().catch(() => {})
      return
    }
    want.unsubscribe = () => void subscription.unsubscribe().catch(() => {})
  } catch {
    // The watchdog owns recovery; a failed candle subscription rides the
    // next rebuild.
  }
}

/** Nobody is listening and the linger ran out: shut the connection down. */
function maybeDispose(hub: Hub) {
  if (hasConsumers(hub)) return
  if (hub.lingerTimer) clearTimeout(hub.lingerTimer)
  hub.lingerTimer = setTimeout(() => {
    hub.lingerTimer = null
    if (hasConsumers(hub)) return
    teardown(hub)
    if (hub.reconnectTimer) {
      clearTimeout(hub.reconnectTimer)
      hub.reconnectTimer = null
    }
    hub.lastFigures.clear()
  }, LINGER_MS)
}

function ensureConnected(hub: Hub) {
  if (hub.lingerTimer) {
    clearTimeout(hub.lingerTimer)
    hub.lingerTimer = null
  }
  ensureVisibilityHandling()
  if (!hub.client && !hub.reconnectTimer && !document.hidden) {
    void connect(hub)
  }
}

// ---- A hidden tab does not deserve a market feed -------------------------

let visibilityWired = false

function ensureVisibilityHandling() {
  if (visibilityWired || typeof document === "undefined") return
  visibilityWired = true
  document.addEventListener("visibilitychange", () => {
    for (const hub of hubs.values()) {
      if (document.hidden) {
        if (hub.client) {
          hub.recovering = true
          teardown(hub)
          setStatus(hub, "paused")
        }
      } else if (hasConsumers(hub)) {
        void connect(hub)
      }
    }
  })
}

// ---- What the registry exposes -------------------------------------------

export function watchFigures(
  network: NetworkId,
  listener: FiguresListener
): () => void {
  const hub = getHub(network)
  hub.figuresListeners.add(listener)
  // A late listener still deserves the current picture, not a blank second.
  if (hub.lastFigures.size > 0) listener(new Map(hub.lastFigures))
  ensureConnected(hub)
  return () => {
    hub.figuresListeners.delete(listener)
    maybeDispose(hub)
  }
}

export function watchCandle(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  listener: CandleListener
): () => void {
  if (!CANDLE_INTERVALS.includes(interval)) return () => {}
  const hub = getHub(network)
  const key = `${marketId}@${interval}`
  let want = hub.candles.get(key)
  if (!want) {
    want = { marketId, interval, listeners: new Set(), unsubscribe: null }
    hub.candles.set(key, want)
    if (hub.client) void attachCandle(hub, hub.generation, want)
  }
  want.listeners.add(listener)
  ensureConnected(hub)
  return () => {
    want.listeners.delete(listener)
    if (want.listeners.size === 0) {
      want.unsubscribe?.()
      hub.candles.delete(key)
    }
    maybeDispose(hub)
  }
}

export function watchCatchUp(
  network: NetworkId,
  listener: CatchUpListener
): () => void {
  const hub = getHub(network)
  hub.catchUpListeners.add(listener)
  return () => {
    hub.catchUpListeners.delete(listener)
  }
}
