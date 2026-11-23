import type { LiveFigures, NetworkId } from "@/lib/protocols/contracts"
import {
  APEX_ALL_MARKETS_TOPIC,
  APEX_PING_EVERY_MS,
  num,
  toApexFigures,
} from "@/lib/protocols/apex/translate"
import { reconnectDelay } from "@/lib/protocols/timing"
import { loadApexContracts } from "@/server/protocols/apex/catalogue"
import { apexWsBase } from "@/server/protocols/apex/client"

/**
 * ApeX Omni's prices, pushed, for the trading engine and for the market
 * list's figures.
 *
 * One connection carries every market: `instrumentInfo.all`. Measured
 * 24 Sep 2026 over 20 seconds: the first frame came 1.0 seconds after
 * connecting, and a frame of all 368 markets (perpetuals, stocks and
 * prediction markets together) arrived every 2.0 seconds after that. ApeX
 * calls each one a snapshot; a frame it calls a delta is applied the same
 * way, row by row, so either kind keeps every market current.
 *
 * The prediction markets are dropped here, by keeping only the markets the
 * catalogue lists, which is also how a market listed since the last connect
 * is picked up: every reconnect re-reads the catalogue first.
 */
const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000

type Hub = {
  network: NetworkId
  figures: Map<string, LiveFigures>
  prices: Map<string, number>
  /**
   * The index price per market. ApeX prices an account's open profit on
   * the index (`unrealizePnlPriceType: "INDEX_PRICE"` in its account
   * answer), so the wallet card reads this rather than the mark.
   */
  index: Map<string, number>
  tradable: Set<string>
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  openedAt: number
  lastPingAt: number
  reconnectAt: number
  attempts: number
  watchdog: ReturnType<typeof setInterval> | null
  firstData: Array<() => void>
}

const scope = globalThis as { __tradeApexPriceHubs?: Map<NetworkId, Hub> }

function hubFor(network: NetworkId): Hub {
  const hubs = (scope.__tradeApexPriceHubs ??= new Map())
  const found = hubs.get(network)
  if (found) return found
  const made: Hub = {
    network,
    figures: new Map(),
    prices: new Map(),
    index: new Map(),
    tradable: new Set(),
    socket: null,
    generation: 0,
    lastMessageAt: 0,
    openedAt: 0,
    lastPingAt: 0,
    reconnectAt: 0,
    attempts: 0,
    watchdog: null,
    firstData: [],
  }
  hubs.set(network, made)
  return made
}

/**
 * Makes sure the line is up. Free once it is. Mainnet only, and anything
 * else does nothing rather than throwing, for the reason Lighter's feed
 * gives: one saved key naming a network ApeX is not carried on must not take
 * down an engine pass over every exchange.
 */
export function openApexLivePrices(network: NetworkId): void {
  if (network !== "mainnet") return
  const hub = hubFor(network)
  if (!hub.socket && hub.reconnectAt === 0) void connect(hub)
}

export function readApexLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
} {
  return { prices: hubFor(network).prices }
}

/** Index prices by market id, when the feed is fresh; empty otherwise. */
export function readApexIndexPrices(network: NetworkId): ReadonlyMap<string, number> {
  return apexLivePricesFresh(network) ? hubFor(network).index : new Map()
}

export function apexLivePricesFresh(network: NetworkId): boolean {
  const hub = hubFor(network)
  return hub.lastMessageAt > 0 && Date.now() - hub.lastMessageAt <= STALE_AFTER_MS
}

/**
 * Every tradable market's moving figures, or null when the feed has nothing
 * fresh to give. `waitMs` opens the line and waits that long for its first
 * frame, which is how the market list gets its figures in one push instead
 * of one ticker read per market.
 */
export async function apexLiveFigures(
  network: NetworkId,
  waitMs = 0
): Promise<ReadonlyMap<string, LiveFigures> | null> {
  if (network !== "mainnet") return null
  openApexLivePrices(network)
  const hub = hubFor(network)
  if (!apexLivePricesFresh(network) && waitMs > 0) {
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer)
        resolve()
      }
      // A wait that times out takes its waker with it, so a feed that stays
      // down does not collect one per market-list load.
      const timer = setTimeout(() => {
        const at = hub.firstData.indexOf(wake)
        if (at >= 0) hub.firstData.splice(at, 1)
        resolve()
      }, waitMs)
      hub.firstData.push(wake)
    })
  }
  return apexLivePricesFresh(network) ? hub.figures : null
}

/**
 * One frame, applied. Answers true when it carried a market price, which is
 * what "fresh" is judged by.
 *
 * ApeX's own ping is answered here with a pong carrying the same stamp, as
 * its Node connector does; a ping left unanswered is how a quote socket gets
 * dropped.
 */
export function applyApexFrame(
  state: Pick<Hub, "figures" | "prices" | "index" | "tradable">,
  packet: unknown,
  reply: (frame: object) => void
): boolean {
  if (!packet || typeof packet !== "object") return false
  const frame = packet as Record<string, unknown>
  if (frame.op === "ping") {
    reply({ op: "pong", args: Array.isArray(frame.args) ? frame.args : [String(Date.now())] })
    return false
  }
  if (frame.topic !== APEX_ALL_MARKETS_TOPIC || !Array.isArray(frame.data)) {
    return false
  }
  let sawOne = false
  for (const raw of frame.data) {
    const row = toApexFigures(raw)
    if (!row || !state.tradable.has(row.marketId)) continue
    state.figures.set(row.marketId, row.figures)
    state.prices.set(row.marketId, row.figures.price)
    const index = num((raw as { xp?: unknown }).xp)
    if (index !== null && index > 0) state.index.set(row.marketId, index)
    sawOne = true
  }
  return sawOne
}

function teardown(hub: Hub): void {
  const socket = hub.socket
  hub.socket = null
  if (!socket) return
  try {
    socket.close()
  } catch {
    // The socket is already gone.
  }
}

function scheduleReconnect(hub: Hub): void {
  hub.reconnectAt = Date.now() + reconnectDelay(hub.attempts)
  hub.attempts += 1
}

function send(hub: Hub, frame: object): void {
  const socket = hub.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    // The watchdog replaces a socket that cannot accept a frame.
  }
}

async function connect(hub: Hub): Promise<void> {
  const generation = (hub.generation += 1)
  teardown(hub)
  // Held open so a second `open` during the catalogue read does not start
  // another connection.
  hub.reconnectAt = Number.MAX_SAFE_INTEGER
  try {
    const contracts = await loadApexContracts(hub.network)
    if (generation !== hub.generation) return
    hub.tradable = new Set(contracts.map((one) => one.marketId))
  } catch {
    if (generation !== hub.generation) return
    // Without a catalogue there is no telling a perpetual from a
    // prediction, so nothing is connected until one reads.
    scheduleReconnect(hub)
    startWatchdog(hub)
    return
  }
  hub.reconnectAt = 0
  let socket: WebSocket
  try {
    socket = new WebSocket(
      `${apexWsBase(hub.network)}/realtime_public?v=2&timestamp=${Date.now()}`
    )
  } catch {
    scheduleReconnect(hub)
    startWatchdog(hub)
    return
  }
  hub.socket = socket
  hub.openedAt = Date.now()
  socket.addEventListener("open", () => {
    if (generation !== hub.generation) return
    hub.openedAt = Date.now()
    hub.lastPingAt = Date.now()
    send(hub, { op: "subscribe", args: [APEX_ALL_MARKETS_TOPIC] })
  })
  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    let packet: unknown
    try {
      packet = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (applyApexFrame(hub, packet, (frame) => send(hub, frame))) {
      hub.attempts = 0
      hub.lastMessageAt = Date.now()
      for (const wake of hub.firstData.splice(0)) wake()
    }
  })
  const gone = () => {
    if (generation !== hub.generation) return
    teardown(hub)
    scheduleReconnect(hub)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)
  startWatchdog(hub)
}

function startWatchdog(hub: Hub): void {
  if (hub.watchdog) return
  hub.watchdog = setInterval(() => {
    const now = Date.now()
    if (hub.reconnectAt > 0 && hub.reconnectAt !== Number.MAX_SAFE_INTEGER) {
      if (now >= hub.reconnectAt) {
        hub.reconnectAt = 0
        void connect(hub)
      }
      return
    }
    if (!hub.socket) return
    if (now - hub.lastPingAt >= APEX_PING_EVERY_MS) {
      hub.lastPingAt = now
      send(hub, { op: "ping", args: [String(now)] })
    }
    const quietSince = Math.max(hub.lastMessageAt, hub.openedAt)
    if (now - quietSince <= STALE_AFTER_MS) return
    teardown(hub)
    scheduleReconnect(hub)
  }, WATCHDOG_EVERY_MS)
  hub.watchdog.unref?.()
}
