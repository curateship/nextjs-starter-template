import type { NetworkId } from "@/lib/protocols/contracts"
import { num, phemexWsUrl } from "@/lib/protocols/phemex/translate"

/**
 * An open line to Phemex, on the server: prices arrive here, they are not
 * asked for. The same job — and deliberately the same shape — as the
 * Hyperliquid hub next door: one socket per network for the life of the
 * process, health judged by data arriving, stale answers marked stale, and
 * a caller that finds the feed quiet falls back to asking the REST way.
 *
 * The stream is `perp_market24h_pack_p` — every dollar-settled perpetual in
 * one message. Measured against the live exchange on 20 Aug 2026: one
 * `snapshot` of about 614 markets on subscribing, then an `incremental` of
 * the hundred-odd rows that moved, roughly every five seconds.
 *
 * Rows are bare arrays, and the legend naming the columns arrives ONCE, on
 * the snapshot. That is the whole subtlety of this file — see `applyPack`.
 * The legend is read off the message rather than hardcoded, so if the
 * exchange reorders its columns tomorrow the feed goes quiet here instead of
 * quietly serving the wrong column as a price.
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
  /**
   * Which column of a row is the symbol and which is the price.
   *
   * Worked out from the snapshot and kept, because Phemex names its columns
   * ONCE — see `applyPack`. Forgotten when the socket goes, since the next
   * connection opens with a snapshot of its own.
   */
  columns: { symbolAt: number; priceAt: number } | null
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
    columns: null,
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
  // Everything the line was carrying goes with it. Without this a shut feed
  // went on answering "fresh" with the last prices it ever had — the KuCoin
  // hub beside this one already clears, and the two are meant to be the same
  // shape.
  hub.prices.clear()
  hub.lastMessageAt = 0
  hub.reconnectAt = 0
  hub.attempts = 0
}

function teardown(hub: Hub): void {
  // The legend came from this socket's snapshot; the next connection sends
  // its own, and reading new rows with an old legend is how columns get
  // misread after a reconnect.
  hub.columns = null
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
 * One pack message applied to the price map.
 *
 * **Phemex names its columns once and then never again.** The first message
 * after subscribing is a `snapshot` carrying every market and a `fields`
 * legend; every message after it is an `incremental` carrying only the rows
 * that moved, with NO legend at all. Measured on 20 Aug 2026: one snapshot,
 * then ten legend-less updates a minute.
 *
 * So the legend is worked out once and kept. Requiring it on every message
 * meant every update was thrown away, and the feed — which had carried one
 * snapshot and looked perfectly healthy — went stale eight seconds later and
 * stayed stale, while the app fell back to asking for prices over and over.
 *
 * The two column names are measured too, and both guesses that came before
 * them were wrong: the hub asked for `markPriceRp` with `closeRp` as its
 * fallback, and Phemex sends `markRp` and `lastRp`. Mark price is preferred
 * because it is what every other price in this app is, and what a trigger
 * fires on.
 */
function applyPack(hub: Hub, message: unknown): void {
  const packet = message as {
    fields?: unknown
    data?: unknown
  }
  if (!Array.isArray(packet.data)) return

  if (Array.isArray(packet.fields)) {
    const symbolAt = packet.fields.indexOf("symbol")
    const priceAt = (() => {
      const mark = packet.fields.indexOf("markRp")
      if (mark >= 0) return mark
      return packet.fields.indexOf("lastRp")
    })()
    // A legend naming neither column is not a legend worth keeping — better
    // to hold the last one that worked than to blind the feed.
    if (symbolAt >= 0 && priceAt >= 0) hub.columns = { symbolAt, priceAt }
  }

  const columns = hub.columns
  // No legend yet, which means no snapshot has arrived on this socket. There
  // is nothing to read the rows with, and guessing the order is how the
  // wrong number ends up being traded on.
  if (!columns) return
  const { symbolAt, priceAt } = columns

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
