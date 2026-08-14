import * as sdk from "@nktkas/hyperliquid"

import type { NetworkId } from "@/lib/protocols/contracts"
import {
  namespaceMarketId,
  toLiveFigures,
} from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"

/**
 * An open line to the exchange, on the server: prices arrive here, they are
 * not asked for.
 *
 * **Why.** Everything server-side asks for prices — a call, a two-second
 * cache, and whatever happened in between is gone. For a screen that is fine.
 * For the thing that decides whether a rung buys or a stop fires it is not: a
 * level can be reached and left inside one gap, and the trade simply never
 * happens. The exchange already pushes every market's figures about once a
 * second over a public socket, so the honest arrangement is to be told.
 *
 * The browser has had this for a while (`lib/protocols/hyperliquid/stream.ts`).
 * This is the server's own, and it is deliberately the simpler one: no tabs to
 * hide, nothing to pause for, and one connection per network for the life of
 * the process.
 *
 * **Health is judged by the data, not the socket.** The figures stream ticks
 * steadily, so silence IS the outage whatever the socket claims. Quiet for too
 * long and the connection is torn down and rebuilt on a backoff, and the last
 * prices are kept meanwhile — stale but marked, so a caller can decide.
 *
 * Public market data only. No key, no session, nothing signed.
 */

/** Quiet for longer than this and the feed is treated as down. */
const STALE_AFTER_MS = 8_000
const WATCHDOG_EVERY_MS = 3_000
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

/**
 * How long the market layout is reused across reconnects.
 *
 * **Reconnects come in storms, and this used to cost two requests each.** The
 * layout — which market sits at which position in the figures the exchange
 * pushes — only changes when a market is listed or delisted, so re-reading it
 * every time a socket blinks is asking a question whose answer cannot have
 * moved. Worse, it fed itself: a rate limit dropped the socket, the reconnect
 * spent two more requests, and those were refused too. Measured at nineteen
 * reconnects in thirty seconds, all of them re-asking.
 */
const LAYOUT_GOOD_FOR_MS = 10 * 60_000

/** How long a connection must hold before it counts as healthy again. */
const STEADY_AFTER_MS = 30_000

const layouts = new Map<
  NetworkId,
  { at: number; idByVenueIndex: Map<string, string[]> }
>()

type Hub = {
  network: NetworkId
  /** When the current connection opened, for judging whether it has held. */
  openedAt: number
  /** Market id by venue, in the order the exchange sends its figures. */
  idByVenueIndex: Map<string, string[]>
  /** The last price seen for each market id. */
  prices: Map<string, number>
  lastMessageAt: number
  generation: number
  transport: { close: () => unknown } | null
  unsubscribe: (() => void) | null
  watchdog: ReturnType<typeof setInterval> | null
  reconnectAt: number
  attempts: number
  starting: Promise<void> | null
}

// One hub per network for the life of the process, on `globalThis` rather
// than in module scope: the dev server reloads modules in place, and a
// module-scoped map would leave the old socket open behind the new one.
const scope = globalThis as { __tradeLivePriceHubs?: Map<NetworkId, Hub> }

function hubFor(network: NetworkId): Hub {
  const hubs = (scope.__tradeLivePriceHubs ??= new Map())
  const found = hubs.get(network)
  if (found) return found
  const made: Hub = {
    network,
    openedAt: 0,
    idByVenueIndex: new Map(),
    prices: new Map(),
    lastMessageAt: 0,
    generation: 0,
    transport: null,
    unsubscribe: null,
    watchdog: null,
    reconnectAt: 0,
    attempts: 0,
    starting: null,
  }
  hubs.set(network, made)
  return made
}

/**
 * Open the line for this network if it is not already open. Safe to call as
 * often as you like; every call after the first does nothing.
 */
export function openLivePrices(network: NetworkId): void {
  const hub = hubFor(network)
  if (hub.unsubscribe || hub.starting) return
  hub.starting = connect(hub).finally(() => {
    hub.starting = null
  })
  void hub.starting.catch(() => {
    // Failing to connect is not fatal — the watchdog tries again, and callers
    // fall back to asking for prices meanwhile.
    scheduleReconnect(hub)
  })
}

/**
 * The prices this network has pushed, by market id, and how long ago the feed
 * last said anything.
 *
 * `ageMs` is the caller's whole basis for trusting them: a feed that has been
 * quiet for a minute is not a feed, and the answer is to ask the ordinary way
 * rather than to trade on a minute-old number.
 */
export function livePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
  ageMs: number
} {
  const hub = hubFor(network)
  return {
    prices: hub.prices,
    ageMs: hub.lastMessageAt === 0 ? Infinity : Date.now() - hub.lastMessageAt,
  }
}

/** Whether the feed is currently worth reading. */
export function livePricesFresh(network: NetworkId): boolean {
  return livePrices(network).ageMs <= STALE_AFTER_MS
}

/** Shuts the line. Only the tests and a clean process exit need this. */
export async function closeLivePrices(network: NetworkId): Promise<void> {
  const hub = hubFor(network)
  hub.generation += 1
  teardown(hub)
  if (hub.watchdog) {
    clearInterval(hub.watchdog)
    hub.watchdog = null
  }
}

function teardown(hub: Hub): void {
  hub.unsubscribe?.()
  hub.unsubscribe = null
  const transport = hub.transport
  hub.transport = null
  if (transport) void Promise.resolve(transport.close()).catch(() => {})
}

function scheduleReconnect(hub: Hub): void {
  const wait =
    RECONNECT_BACKOFF_MS[Math.min(hub.attempts, RECONNECT_BACKOFF_MS.length - 1)]
  hub.attempts += 1
  hub.reconnectAt = Date.now() + wait
}

async function connect(hub: Hub): Promise<void> {
  const generation = (hub.generation += 1)
  teardown(hub)

  // Which market sits at which position in the figures the exchange pushes.
  // Asked once per connection: the answer only changes when a market is
  // listed, and a reconnect re-reads it anyway.
  // Read once and kept, rather than re-read on every reconnect.
  //
  // Asking each market separately used to cost the same as twenty ordinary
  // requests apiece — 5,000 weight on the practice network against the 1,200 a
  // minute the exchange allows. `allPerpMetas` cut that to one call; keeping
  // the answer cuts it to none, which is what actually breaks the loop where a
  // rate limit drops the socket and the reconnect spends more of the ration
  // that was already gone.
  const held = layouts.get(hub.network)
  if (held && Date.now() - held.at < LAYOUT_GOOD_FOR_MS) {
    hub.idByVenueIndex = held.idByVenueIndex
  } else {
    const info = infoClient(hub.network)
    const [dexs, metas] = await Promise.all([
      info.perpDexs(),
      info.allPerpMetas(),
    ])
    if (generation !== hub.generation) return
    const idByVenueIndex = new Map(
      metas.map((meta, index) => {
        const name = index === 0 ? "" : (dexs[index]?.name ?? "")
        return [
          name,
          meta.universe.map((asset) => namespaceMarketId(name, asset.name)),
        ]
      })
    )
    layouts.set(hub.network, { at: Date.now(), idByVenueIndex })
    hub.idByVenueIndex = idByVenueIndex
  }

  const transport = new sdk.WebSocketTransport({
    isTestnet: hub.network === "testnet",
  })
  const client = new sdk.SubscriptionClient({ transport })
  hub.transport = transport as Hub["transport"]

  // One subscription carries every venue's every market, about once a second.
  const subscription = await client.allDexsAssetCtxs((event) => {
    if (generation !== hub.generation) return
    // Reset only once the connection has plainly held, not on its first
    // message. Resetting on every message meant a socket that connected, said
    // one thing and died never backed off at all — it retried a second later,
    // forever, which is what a reconnect storm is.
    if (hub.attempts > 0 && Date.now() - hub.openedAt > STEADY_AFTER_MS) {
      hub.attempts = 0
    }
    hub.lastMessageAt = Date.now()
    for (const [venue, ctxs] of event.ctxs) {
      const ids = hub.idByVenueIndex.get(venue)
      if (!ids) continue
      ctxs.forEach((ctx, index) => {
        const marketId = ids[index]
        if (!marketId) return
        const figures = toLiveFigures(ctx)
        if (!figures || !(figures.price > 0)) return
        hub.prices.set(marketId, figures.price)
      })
    }
  })
  if (generation !== hub.generation) {
    void subscription.unsubscribe().catch(() => {})
    return
  }
  hub.unsubscribe = () => void subscription.unsubscribe().catch(() => {})
  hub.lastMessageAt = Date.now()
  hub.openedAt = Date.now()

  if (!hub.watchdog) {
    hub.watchdog = setInterval(() => {
      // A connection due to be rebuilt, or one that has gone quiet. The socket
      // may still claim to be healthy in both cases; the data disagrees, and
      // the data is what a trade is decided on.
      if (hub.reconnectAt > 0 && Date.now() >= hub.reconnectAt) {
        hub.reconnectAt = 0
        void connect(hub).catch(() => scheduleReconnect(hub))
        return
      }
      if (!hub.unsubscribe || hub.reconnectAt > 0) return
      if (Date.now() - hub.lastMessageAt <= STALE_AFTER_MS) return
      teardown(hub)
      scheduleReconnect(hub)
    }, WATCHDOG_EVERY_MS)
    // Never a reason to hold the process open on its own.
    hub.watchdog.unref?.()
  }
}
