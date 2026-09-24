import type { LiveFigures, NetworkId } from "@/lib/protocols/contracts"
import {
  EDGEX_ALL_TICKERS,
  edgexPong,
  toEdgexFigures,
} from "@/lib/protocols/edgex/translate"
import { reconnectDelay } from "@/lib/protocols/timing"
import { loadEdgexCatalogue } from "@/server/protocols/edgex/catalogue"
import { edgexWsBase } from "@/server/protocols/edgex/client"

/**
 * edgeX's prices, pushed, for the trading engine and for the market list's
 * figures.
 *
 * One connection carries every contract: `ticker.all.1s`. Measured
 * 24 Sep 2026 over 20 seconds: the first frame came 1.1 seconds after
 * connecting and held all 180 contracts; after that a frame of all 180
 * arrived every second, the first called a snapshot and the rest "changed".
 * Both are applied the same way, row by row.
 *
 * **edgeX's list has no all-contracts price read any more.** On 5 Sep 2026
 * `getTicker` with no contract answered every contract; on 24 Sep 2026 it
 * answered an empty list. So the market list's figures come from here.
 *
 * edgeX pings this socket (the first came 8.9 seconds in) and the app answers
 * each with a pong carrying the same time. Every reconnect re-reads the
 * catalogue first, so a contract listed since the last connect is picked up.
 */
const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000

type Hub = {
  network: NetworkId
  figures: Map<string, LiveFigures>
  prices: Map<string, number>
  /** False on a stock contract whose exchange is shut right now. */
  open: Map<string, boolean>
  /** Hours between funding settlements per market, from the catalogue. */
  fundingHours: Map<string, number>
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  openedAt: number
  reconnectAt: number
  attempts: number
  watchdog: ReturnType<typeof setInterval> | null
  firstData: Array<() => void>
}

const scope = globalThis as { __tradeEdgexPriceHubs?: Map<NetworkId, Hub> }

function hubFor(network: NetworkId): Hub {
  const hubs = (scope.__tradeEdgexPriceHubs ??= new Map())
  const found = hubs.get(network)
  if (found) return found
  const made: Hub = {
    network,
    figures: new Map(),
    prices: new Map(),
    open: new Map(),
    fundingHours: new Map(),
    socket: null,
    generation: 0,
    lastMessageAt: 0,
    openedAt: 0,
    reconnectAt: 0,
    attempts: 0,
    watchdog: null,
    firstData: [],
  }
  hubs.set(network, made)
  return made
}

/**
 * Makes sure the line is up. Free once it is. Mainnet only, and anything else
 * does nothing rather than throwing: one saved key naming a network edgeX is
 * not carried on must not take down an engine pass over every exchange.
 */
export function openEdgexLivePrices(network: NetworkId): void {
  if (network !== "mainnet") return
  const hub = hubFor(network)
  if (!hub.socket && hub.reconnectAt === 0) void connect(hub)
}

export function readEdgexLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
} {
  return { prices: hubFor(network).prices }
}

export function edgexLivePricesFresh(network: NetworkId): boolean {
  const hub = hubFor(network)
  return hub.lastMessageAt > 0 && Date.now() - hub.lastMessageAt <= STALE_AFTER_MS
}

/**
 * Whether the feed says this market is closed right now: a stock contract
 * outside its exchange's hours. Null when the feed has nothing fresh.
 */
export function edgexMarketOpen(network: NetworkId, marketId: string): boolean | null {
  if (!edgexLivePricesFresh(network)) return null
  return hubFor(network).open.get(marketId) ?? null
}

/**
 * Every contract's moving figures, or null when the feed has nothing fresh
 * to give. `waitMs` opens the line and waits that long for its first frame,
 * which is how the market list gets its figures in one push.
 */
export async function edgexLiveFigures(
  network: NetworkId,
  waitMs = 0
): Promise<ReadonlyMap<string, LiveFigures> | null> {
  if (network !== "mainnet") return null
  openEdgexLivePrices(network)
  const hub = hubFor(network)
  if (!edgexLivePricesFresh(network) && waitMs > 0) {
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
  return edgexLivePricesFresh(network) ? hub.figures : null
}

/**
 * One frame, applied. Answers true when it carried a market price, which is
 * what "fresh" is judged by. A ping is answered with its own time.
 */
export function applyEdgexFrame(
  state: Pick<Hub, "figures" | "prices" | "open" | "fundingHours">,
  packet: unknown,
  reply: (frame: object) => void
): boolean {
  if (!packet || typeof packet !== "object") return false
  const frame = packet as Record<string, unknown>
  const pong = edgexPong(frame)
  if (pong) {
    reply(pong)
    return false
  }
  if (frame.type !== "quote-event" || frame.channel !== EDGEX_ALL_TICKERS) return false
  const rows = (frame.content as { data?: unknown } | undefined)?.data
  if (!Array.isArray(rows)) return false
  let sawOne = false
  for (const raw of rows) {
    const name = (raw as { contractName?: unknown } | null)?.contractName
    if (typeof name !== "string") continue
    const hours = state.fundingHours.get(name)
    // A contract the catalogue does not list is not traded here.
    if (hours === undefined) continue
    const row = toEdgexFigures(raw, hours)
    if (!row) continue
    state.figures.set(row.marketId, row.figures)
    state.prices.set(row.marketId, row.figures.price)
    state.open.set(row.marketId, row.marketOpen)
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
    const { contracts } = await loadEdgexCatalogue(hub.network)
    if (generation !== hub.generation) return
    hub.fundingHours = new Map(contracts.map((one) => [one.marketId, one.fundingHours]))
  } catch {
    if (generation !== hub.generation) return
    scheduleReconnect(hub)
    startWatchdog(hub)
    return
  }
  hub.reconnectAt = 0
  let socket: WebSocket
  try {
    socket = new WebSocket(
      `${edgexWsBase(hub.network)}/api/v1/public/ws?timestamp=${Date.now()}`
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
    send(hub, { type: "subscribe", channel: EDGEX_ALL_TICKERS })
  })
  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    let packet: unknown
    try {
      packet = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (applyEdgexFrame(hub, packet, (frame) => send(hub, frame))) {
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
    const quietSince = Math.max(hub.lastMessageAt, hub.openedAt)
    if (now - quietSince <= STALE_AFTER_MS) return
    teardown(hub)
    scheduleReconnect(hub)
  }, WATCHDOG_EVERY_MS)
  hub.watchdog.unref?.()
}
