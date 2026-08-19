import type { NetworkId } from "@/lib/protocols/contracts"
import { num, phemexWsUrl } from "@/lib/protocols/phemex/translate"

/**
 * An open line to Phemex, on the server: prices arrive here, they are not
 * asked for. The same job — and deliberately the same shape — as the
 * Hyperliquid hub next door: one socket per network for the life of the
 * process, health judged by data arriving, stale answers marked stale, and
 * a caller that finds the feed quiet falls back to asking the REST way.
 *
 * The stream is `perp_market24h_pack_p` — every dollar-settled perpetual's
 * 24-hour figures, pushed about once a second in one message. Rows arrive as
 * arrays with a `fields` legend naming the columns, so the legend is read
 * off the message itself rather than hardcoded: if the exchange reorders its
 * columns tomorrow, the feed goes quiet here instead of quietly serving the
 * wrong column as a price.
 *
 * Public market data only. No key, no session, nothing signed.
 */

const STALE_AFTER_MS = 8_000
const WATCHDOG_EVERY_MS = 3_000
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const STEADY_AFTER_MS = 30_000
/** The exchange drops a silent socket; it asks for a heartbeat under 30s. */
const PING_EVERY_MS = 5_000

type Hub = {
  network: NetworkId
  openedAt: number
  prices: Map<string, number>
  lastMessageAt: number
  generation: number
  socket: WebSocket | null
  watchdog: ReturnType<typeof setInterval> | null
  pinger: ReturnType<typeof setInterval> | null
  reconnectAt: number
  attempts: number
}

// On `globalThis` rather than module scope: the dev server reloads modules
// in place, and a module-scoped map would leave the old socket open behind
// the new one.
const scope = globalThis as { __tradePhemexPriceHubs?: Map<NetworkId, Hub> }

function hubFor(network: NetworkId): Hub {
  const hubs = (scope.__tradePhemexPriceHubs ??= new Map())
  const found = hubs.get(network)
  if (found) return found
  const made: Hub = {
    network,
    openedAt: 0,
    prices: new Map(),
    lastMessageAt: 0,
    generation: 0,
    socket: null,
    watchdog: null,
    pinger: null,
    reconnectAt: 0,
    attempts: 0,
  }
  hubs.set(network, made)
  return made
}

export function openPhemexLivePrices(network: NetworkId): void {
  const hub = hubFor(network)
  if (hub.socket) return
  connect(hub)
}

export function readPhemexLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
  ageMs: number
} {
  const hub = hubFor(network)
  return {
    prices: hub.prices,
    ageMs: hub.lastMessageAt === 0 ? Infinity : Date.now() - hub.lastMessageAt,
  }
}

export function phemexLivePricesFresh(network: NetworkId): boolean {
  return readPhemexLivePrices(network).ageMs <= STALE_AFTER_MS
}

/** Shuts the line. Only the tests and a clean process exit need this. */
export function closePhemexLivePrices(network: NetworkId): void {
  const hub = hubFor(network)
  hub.generation += 1
  teardown(hub)
  if (hub.watchdog) {
    clearInterval(hub.watchdog)
    hub.watchdog = null
  }
}

function teardown(hub: Hub): void {
  if (hub.pinger) {
    clearInterval(hub.pinger)
    hub.pinger = null
  }
  const socket = hub.socket
  hub.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // A socket that refuses to close is already gone.
    }
  }
}

function scheduleReconnect(hub: Hub): void {
  const wait =
    RECONNECT_BACKOFF_MS[Math.min(hub.attempts, RECONNECT_BACKOFF_MS.length - 1)]
  hub.attempts += 1
  hub.reconnectAt = Date.now() + wait
}

/**
 * One pack message applied to the price map. The legend names the columns;
 * a message without one, or without the two columns needed, changes nothing.
 */
function applyPack(hub: Hub, message: unknown): void {
  const packet = message as {
    fields?: unknown
    data?: unknown
  }
  if (!Array.isArray(packet.fields) || !Array.isArray(packet.data)) return
  const symbolAt = packet.fields.indexOf("symbol")
  // Mark price first — it is what every other price in the app is — with the
  // last trade as the fallback on packs that carry only one.
  const priceAt = (() => {
    const mark = packet.fields.indexOf("markPriceRp")
    if (mark >= 0) return mark
    return packet.fields.indexOf("closeRp")
  })()
  if (symbolAt < 0 || priceAt < 0) return

  let sawOne = false
  for (const row of packet.data) {
    if (!Array.isArray(row)) continue
    const symbol = row[symbolAt]
    const price = num(row[priceAt])
    if (typeof symbol !== "string" || price === null || !(price > 0)) continue
    hub.prices.set(symbol, price)
    sawOne = true
  }
  if (sawOne) hub.lastMessageAt = Date.now()
}

function connect(hub: Hub): void {
  const generation = (hub.generation += 1)
  teardown(hub)

  let socket: WebSocket
  try {
    socket = new WebSocket(phemexWsUrl(hub.network))
  } catch {
    scheduleReconnect(hub)
    return
  }
  hub.socket = socket

  socket.addEventListener("open", () => {
    if (generation !== hub.generation) return
    hub.openedAt = Date.now()
    // The message id is noise here — nothing waits on the replies.
    socket.send(
      JSON.stringify({
        id: 1,
        method: "perp_market24h_pack_p.subscribe",
        params: [],
      })
    )
    hub.pinger = setInterval(() => {
      try {
        socket.send(JSON.stringify({ id: 2, method: "server.ping", params: [] }))
      } catch {
        // The watchdog handles a dead socket; the ping just must not throw.
      }
    }, PING_EVERY_MS)
    hub.pinger.unref?.()
  })

  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    if (hub.attempts > 0 && Date.now() - hub.openedAt > STEADY_AFTER_MS) {
      hub.attempts = 0
    }
    try {
      applyPack(hub, JSON.parse(String(event.data)))
    } catch {
      // A message that is not JSON is not a price.
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
      if (Date.now() - hub.lastMessageAt <= STALE_AFTER_MS) return
      // The socket may still claim to be healthy; the data disagrees, and
      // the data is what a trade is decided on.
      teardown(hub)
      scheduleReconnect(hub)
    }, WATCHDOG_EVERY_MS)
    hub.watchdog.unref?.()
  }
}
