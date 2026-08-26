import type { NetworkId } from "@/lib/protocols/contracts"
import {
  LIGHTER_KEEPALIVE_MS,
  lighterReconnectDelay,
  lighterWsUrl,
  num,
} from "@/lib/protocols/lighter/translate"
import { countLighterSocketSend } from "@/server/protocols/lighter/budget"

const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000

/**
 * Two clocks, on purpose.
 *
 * `lastMessageAt` is when a real price last arrived, and it alone decides
 * whether the engine may trust this feed — a socket that is open but has
 * said nothing has no prices to give, and calling that "fresh" is how a
 * trigger ends up judged against an empty map.
 *
 * `openedAt` is when the line connected, and it only holds the watchdog off:
 * a socket gets its full twelve seconds to say something before being torn
 * down, rather than being killed on the first tick after connecting.
 */
type Hub = {
  network: NetworkId
  prices: Map<string, number>
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  openedAt: number
  lastPingAt: number
  reconnectAt: number
  attempts: number
  watchdog: ReturnType<typeof setInterval> | null
}

const scope = globalThis as { __tradeLighterPriceHubs?: Map<NetworkId, Hub> }

function hubFor(network: NetworkId): Hub {
  const hubs = (scope.__tradeLighterPriceHubs ??= new Map())
  const found = hubs.get(network)
  if (found) return found
  const made: Hub = {
    network,
    prices: new Map(),
    socket: null,
    generation: 0,
    lastMessageAt: 0,
    openedAt: 0,
    lastPingAt: 0,
    reconnectAt: 0,
    attempts: 0,
    watchdog: null,
  }
  hubs.set(network, made)
  return made
}

export function openLighterLivePrices(network: NetworkId): void {
  /**
   * Lighter is mainnet only, and opening anything else does nothing at all
   * rather than throwing or retrying.
   *
   * Throwing here would take down a whole engine pass over five exchanges
   * because one saved market key named a network Lighter no longer serves.
   * Letting it connect would be worse: `lighterWsUrl` refuses, the refusal is
   * caught as a failed connection, and the hub would retry that same refusal
   * forever. Doing nothing leaves the feed unfresh, which sends the caller
   * down the REST path, where the refusal is named once and out loud.
   */
  if (network !== "mainnet") return
  const hub = hubFor(network)
  if (!hub.socket && hub.reconnectAt === 0) connect(hub)
}

export function readLighterLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
  ageMs: number
} {
  const hub = hubFor(network)
  return {
    prices: hub.prices,
    ageMs: hub.lastMessageAt === 0 ? Infinity : Date.now() - hub.lastMessageAt,
  }
}

export function lighterLivePricesFresh(network: NetworkId): boolean {
  return readLighterLivePrices(network).ageMs <= STALE_AFTER_MS
}

export function closeLighterLivePrices(network: NetworkId): void {
  const hub = hubFor(network)
  hub.generation += 1
  teardown(hub)
  if (hub.watchdog) clearInterval(hub.watchdog)
  hub.watchdog = null
  hub.prices.clear()
  hub.lastMessageAt = 0
  hub.openedAt = 0
  hub.reconnectAt = 0
  hub.attempts = 0
}

/**
 * Both the first `subscribed/market_stats` snapshot and every
 * `update/market_stats` push carry a map keyed by market id, each row naming
 * its own symbol and mark price. The mark is what Lighter liquidates and
 * funds against, so the mark is what the engine reads.
 */
function applyStats(hub: Hub, packet: unknown): void {
  if (!packet || typeof packet !== "object") return
  const stats = (packet as { market_stats?: unknown }).market_stats
  if (!stats || typeof stats !== "object") return
  let sawOne = false
  for (const raw of Object.values(stats)) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    if (typeof row.symbol !== "string" || row.symbol === "") continue
    const price = num(row.mark_price)
    if (price === null || !(price > 0)) continue
    hub.prices.set(row.symbol, price)
    sawOne = true
  }
  if (sawOne) hub.lastMessageAt = Date.now()
}

function teardown(hub: Hub): void {
  const socket = hub.socket
  hub.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // The socket is already gone.
    }
  }
}

function scheduleReconnect(hub: Hub): void {
  hub.reconnectAt = Date.now() + lighterReconnectDelay(hub.attempts)
  hub.attempts += 1
}

function sendCounted(hub: Hub, frame: object): void {
  const socket = hub.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(frame))
    countLighterSocketSend(hub.network)
  } catch {
    // The watchdog replaces a socket that cannot accept a frame.
  }
}

function connect(hub: Hub): void {
  const generation = (hub.generation += 1)
  teardown(hub)
  let socket: WebSocket
  try {
    // Read-only: this line carries public marks and never an account.
    socket = new WebSocket(`${lighterWsUrl(hub.network)}?readonly=true`)
  } catch {
    scheduleReconnect(hub)
    return
  }
  hub.socket = socket
  socket.addEventListener("open", () => {
    if (generation !== hub.generation) return
    hub.openedAt = Date.now()
    hub.lastPingAt = Date.now()
    sendCounted(hub, { type: "subscribe", channel: "market_stats/all" })
  })
  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    hub.attempts = 0
    try {
      applyStats(hub, JSON.parse(String(event.data)))
    } catch {
      // A malformed frame carries no usable price.
    }
  })
  const gone = () => {
    if (generation !== hub.generation) return
    teardown(hub)
    scheduleReconnect(hub)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  if (!hub.watchdog) {
    hub.watchdog = setInterval(() => {
      if (hub.reconnectAt > 0 && Date.now() >= hub.reconnectAt) {
        hub.reconnectAt = 0
        connect(hub)
        return
      }
      if (!hub.socket || hub.reconnectAt > 0) return
      // Lighter closes a line whose CLIENT stays silent for two minutes;
      // pushed marks do not count, so the hub pings on its own clock.
      if (Date.now() - hub.lastPingAt >= LIGHTER_KEEPALIVE_MS) {
        hub.lastPingAt = Date.now()
        sendCounted(hub, { type: "ping" })
      }
      const quietSince = Math.max(hub.lastMessageAt, hub.openedAt)
      if (Date.now() - quietSince <= STALE_AFTER_MS) return
      teardown(hub)
      scheduleReconnect(hub)
    }, WATCHDOG_EVERY_MS)
    hub.watchdog.unref?.()
  }
}
