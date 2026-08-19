import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  PHEMEX_RESOLUTIONS,
  phemexWsUrl,
  toPhemexBar,
  toPhemexFigures,
} from "@/lib/protocols/phemex/translate"

/**
 * Phemex's live feed, in the browser — the working bar under the chart and
 * the market list's moving figures.
 *
 * One socket per network, shared by every watcher on the page. The 24-hour
 * pack (`perp_market24h_pack_p`) carries every market's figures in one
 * subscription and rows arrive as arrays with a `fields` legend, read off
 * the message itself; candles are subscribed per market and timeframe
 * (`kline_p`) and let go when the last watcher leaves.
 *
 * Health is judged by data arriving, not by what the socket claims: quiet
 * for too long and the connection is rebuilt on a backoff, and every
 * catch-up listener is told so screens can refetch what a gap may have
 * missed. Public data only — nothing here is signed.
 */

const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PING_EVERY_MS = 5_000

type FiguresListener = (updates: ReadonlyMap<string, LiveFigures>) => void
type CandleListener = (bar: CandleBar) => void

type Line = {
  network: NetworkId
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  attempts: number
  reconnectAt: number
  watchdog: ReturnType<typeof setInterval> | null
  pinger: ReturnType<typeof setInterval> | null
  /** Whether the connection has ever been lost — the next open is a recovery. */
  everLost: boolean
  figures: Set<FiguresListener>
  candles: Map<string, Set<CandleListener>>
  catchUp: Set<() => void>
  nextId: number
}

const lines = new Map<NetworkId, Line>()

function lineFor(network: NetworkId): Line {
  const found = lines.get(network)
  if (found) return found
  const made: Line = {
    network,
    socket: null,
    generation: 0,
    lastMessageAt: 0,
    attempts: 0,
    reconnectAt: 0,
    watchdog: null,
    pinger: null,
    everLost: false,
    figures: new Set(),
    candles: new Map(),
    catchUp: new Set(),
    nextId: 10,
  }
  lines.set(network, made)
  return made
}

const candleKey = (marketId: string, interval: CandleInterval) =>
  `${marketId}:${interval}`

function send(line: Line, method: string, params: unknown[]): void {
  const socket = line.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify({ id: line.nextId++, method, params }))
  } catch {
    // A send that fails is a socket the watchdog is about to replace.
  }
}

function subscribeAll(line: Line): void {
  if (line.figures.size > 0) {
    send(line, "perp_market24h_pack_p.subscribe", [])
  }
  for (const key of line.candles.keys()) {
    const [marketId, interval] = splitCandleKey(key)
    send(line, "kline_p.subscribe", [
      marketId,
      PHEMEX_RESOLUTIONS[interval],
    ])
  }
}

function splitCandleKey(key: string): [string, CandleInterval] {
  const at = key.lastIndexOf(":")
  return [key.slice(0, at), key.slice(at + 1) as CandleInterval]
}

function handleMessage(line: Line, message: unknown): void {
  const packet = message as {
    fields?: unknown
    data?: unknown
    kline_p?: unknown
    symbol?: unknown
  }

  // The 24-hour pack: arrays with a legend naming the columns.
  if (Array.isArray(packet.fields) && Array.isArray(packet.data)) {
    line.lastMessageAt = Date.now()
    const updates = new Map<string, LiveFigures>()
    for (const row of packet.data) {
      if (!Array.isArray(row)) continue
      const named: Record<string, unknown> = {}
      packet.fields.forEach((field, index) => {
        if (typeof field === "string") named[field] = row[index]
      })
      const symbol = named.symbol
      const figures = toPhemexFigures(named)
      if (typeof symbol === "string" && figures) updates.set(symbol, figures)
    }
    if (updates.size > 0) {
      for (const listener of line.figures) listener(updates)
    }
    return
  }

  // One market's candles: the last row is the working bar.
  if (Array.isArray(packet.kline_p) && typeof packet.symbol === "string") {
    line.lastMessageAt = Date.now()
    const rows = packet.kline_p
      .map(toPhemexBar)
      .filter((bar): bar is CandleBar => bar !== null)
    if (rows.length === 0) return
    const bar = rows.reduce((a, b) => (a.openTime > b.openTime ? a : b))
    // The push does not say which timeframe it answers, but the bar's own
    // open time is a multiple of exactly one subscribed resolution — every
    // listener whose timeframe fits the bar gets it.
    for (const [key, listeners] of line.candles) {
      const [marketId, interval] = splitCandleKey(key)
      if (marketId !== packet.symbol) continue
      if (bar.openTime % (PHEMEX_RESOLUTIONS[interval] * 1_000) !== 0) continue
      for (const listener of listeners) listener(bar)
    }
  }
}

function connect(line: Line): void {
  const generation = (line.generation += 1)
  teardown(line)

  let socket: WebSocket
  try {
    socket = new WebSocket(phemexWsUrl(line.network))
  } catch {
    scheduleReconnect(line)
    return
  }
  line.socket = socket

  socket.addEventListener("open", () => {
    if (generation !== line.generation) return
    line.lastMessageAt = Date.now()
    if (line.everLost) {
      // The moment to refetch what the gap may have missed — fired on the
      // recovery, not the first connect, which missed nothing.
      for (const listener of line.catchUp) listener()
    }
    subscribeAll(line)
    line.pinger = setInterval(
      () => send(line, "server.ping", []),
      PING_EVERY_MS
    )
  })

  socket.addEventListener("message", (event) => {
    if (generation !== line.generation) return
    line.attempts = 0
    try {
      handleMessage(line, JSON.parse(String(event.data)))
    } catch {
      // Not JSON, not a price.
    }
  })

  const gone = () => {
    if (generation !== line.generation) return
    line.everLost = true
    teardown(line)
    scheduleReconnect(line)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  if (!line.watchdog) {
    line.watchdog = setInterval(() => {
      if (!hasWatchers(line)) return
      if (line.reconnectAt > 0 && Date.now() >= line.reconnectAt) {
        line.reconnectAt = 0
        connect(line)
        return
      }
      if (!line.socket || line.reconnectAt > 0) return
      if (Date.now() - line.lastMessageAt <= STALE_AFTER_MS) return
      line.everLost = true
      teardown(line)
      scheduleReconnect(line)
    }, WATCHDOG_EVERY_MS)
  }
}

function teardown(line: Line): void {
  if (line.pinger) {
    clearInterval(line.pinger)
    line.pinger = null
  }
  const socket = line.socket
  line.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // Already gone.
    }
  }
}

function scheduleReconnect(line: Line): void {
  const wait =
    RECONNECT_BACKOFF_MS[
      Math.min(line.attempts, RECONNECT_BACKOFF_MS.length - 1)
    ]
  line.attempts += 1
  line.reconnectAt = Date.now() + wait
}

function hasWatchers(line: Line): boolean {
  return (
    line.figures.size > 0 || line.candles.size > 0 || line.catchUp.size > 0
  )
}

function ensureOpen(line: Line): void {
  if (line.socket || line.reconnectAt > 0) return
  connect(line)
}

/** Closes the line once nobody is listening — tabs navigate, sockets should follow. */
function closeIfIdle(line: Line): void {
  if (hasWatchers(line)) return
  line.generation += 1
  teardown(line)
  if (line.watchdog) {
    clearInterval(line.watchdog)
    line.watchdog = null
  }
  line.reconnectAt = 0
  line.attempts = 0
}

export function watchFigures(
  network: NetworkId,
  listener: FiguresListener
): () => void {
  const line = lineFor(network)
  const first = line.figures.size === 0
  line.figures.add(listener)
  ensureOpen(line)
  if (!first) {
    // Already subscribed — nothing to send.
  } else {
    send(line, "perp_market24h_pack_p.subscribe", [])
  }
  return () => {
    line.figures.delete(listener)
    closeIfIdle(line)
  }
}

export function watchCandle(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  listener: CandleListener
): () => void {
  const line = lineFor(network)
  const key = candleKey(marketId, interval)
  const listeners = line.candles.get(key) ?? new Set<CandleListener>()
  const first = listeners.size === 0
  listeners.add(listener)
  line.candles.set(key, listeners)
  ensureOpen(line)
  if (first) {
    send(line, "kline_p.subscribe", [marketId, PHEMEX_RESOLUTIONS[interval]])
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      line.candles.delete(key)
      send(line, "kline_p.unsubscribe", [
        marketId,
        PHEMEX_RESOLUTIONS[interval],
      ])
    }
    closeIfIdle(line)
  }
}

export function watchCatchUp(
  network: NetworkId,
  listener: () => void
): () => void {
  const line = lineFor(network)
  line.catchUp.add(listener)
  return () => {
    line.catchUp.delete(listener)
    closeIfIdle(line)
  }
}
