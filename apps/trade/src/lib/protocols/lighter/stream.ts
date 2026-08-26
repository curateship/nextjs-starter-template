import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  LIGHTER_INTERVALS,
  LIGHTER_KEEPALIVE_MS,
  lighterReconnectDelay,
  lighterWsUrl,
  toLighterBar,
  toLighterStatsFigures,
} from "@/lib/protocols/lighter/translate"

const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000
const IDLE_CLOSE_MS = 4_000

type FiguresListener = (updates: ReadonlyMap<string, LiveFigures>) => void
type CandleListener = (bar: CandleBar) => void

/**
 * One browser line per network.
 *
 * Lighter's socket names a market by a small integer, while the app's market
 * id is the symbol. The line therefore always subscribes `market_stats/all`
 * — the feed the figures come from anyway — and learns each symbol's number
 * from it. A candle watch asked for before its number is known waits in
 * `pendingCandles` and is subscribed the moment the first snapshot lands.
 */
type Line = {
  network: NetworkId
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  lastPingAt: number
  attempts: number
  reconnectAt: number
  watchdog: ReturnType<typeof setInterval> | null
  idleTimer: ReturnType<typeof setTimeout> | null
  everLost: boolean
  figures: Set<FiguresListener>
  candles: Map<string, Set<CandleListener>>
  catchUp: Set<() => void>
  idsBySymbol: Map<string, number>
  symbolsById: Map<number, string>
  pendingCandles: Set<string>
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
    lastPingAt: 0,
    attempts: 0,
    reconnectAt: 0,
    watchdog: null,
    idleTimer: null,
    everLost: false,
    figures: new Set(),
    candles: new Map(),
    catchUp: new Set(),
    idsBySymbol: new Map(),
    symbolsById: new Map(),
    pendingCandles: new Set(),
  }
  lines.set(network, made)
  return made
}

const candleKey = (marketId: string, interval: CandleInterval) =>
  `${marketId}:${interval}`

function splitCandleKey(key: string): [string, CandleInterval] {
  const at = key.lastIndexOf(":")
  return [key.slice(0, at), key.slice(at + 1) as CandleInterval]
}

function send(line: Line, frame: object): void {
  const socket = line.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    // The watchdog replaces a socket that cannot accept a frame.
  }
}

function candleChannel(line: Line, key: string): string | null {
  const [marketId, interval] = splitCandleKey(key)
  const id = line.idsBySymbol.get(marketId)
  if (id === undefined) return null
  return `candle/${id}/${LIGHTER_INTERVALS[interval]}`
}

function subscribeCandle(line: Line, key: string): void {
  const channel = candleChannel(line, key)
  if (channel === null) {
    line.pendingCandles.add(key)
    return
  }
  line.pendingCandles.delete(key)
  send(line, { type: "subscribe", channel })
}

/**
 * One pass over a `market_stats` push: it both carries the figures and is
 * where the line learns each symbol's number.
 *
 * Read once rather than twice. This runs on every push, and a measured
 * minute carried 7,636 market rows, so a second parse of each row is work
 * the browser does fifteen thousand times a minute for nothing.
 */
function handleStats(line: Line, packet: Record<string, unknown>): boolean {
  const stats = packet.market_stats
  if (!stats || typeof stats !== "object") return false
  const updates = new Map<string, LiveFigures>()
  let learnedOne = false
  for (const raw of Object.values(stats as Record<string, unknown>)) {
    const row = toLighterStatsFigures(raw)
    if (!row) continue
    if (!line.idsBySymbol.has(row.symbol)) learnedOne = true
    line.idsBySymbol.set(row.symbol, row.marketId)
    line.symbolsById.set(row.marketId, row.symbol)
    updates.set(row.symbol, row.figures)
  }
  // A candle watch asked for before its market's number was known is waiting.
  if (learnedOne && line.pendingCandles.size > 0) {
    for (const key of [...line.pendingCandles]) subscribeCandle(line, key)
  }
  if (updates.size > 0) {
    for (const listener of line.figures) listener(updates)
  }
  return updates.size > 0
}

/** A candle push names its channel "candle:{id}:{resolution}". */
function handleCandles(line: Line, packet: Record<string, unknown>): boolean {
  if (typeof packet.channel !== "string") return false
  const parts = packet.channel.split(":")
  if (parts[0] !== "candle" || parts.length !== 3) return false
  const symbol = line.symbolsById.get(Number(parts[1]))
  if (symbol === undefined) return false
  const interval = (
    Object.entries(LIGHTER_INTERVALS) as [CandleInterval, string][]
  ).find(([, name]) => name === parts[2])?.[0]
  if (!interval) return false
  const rows = Array.isArray(packet.candles) ? packet.candles : []
  const listeners = line.candles.get(candleKey(symbol, interval))
  let sawOne = false
  for (const raw of rows) {
    const bar = toLighterBar(raw)
    if (!bar) continue
    sawOne = true
    if (listeners) for (const listener of listeners) listener(bar)
  }
  return sawOne
}

function handleMessage(line: Line, packet: unknown): void {
  if (!packet || typeof packet !== "object") return
  const message = packet as Record<string, unknown>
  const sawStats = handleStats(line, message)
  const sawCandle = handleCandles(line, message)
  if (sawStats || sawCandle) line.lastMessageAt = Date.now()
}

function teardown(line: Line): void {
  const socket = line.socket
  line.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // The socket is already gone.
    }
  }
}

function scheduleReconnect(line: Line): void {
  line.reconnectAt = Date.now() + lighterReconnectDelay(line.attempts)
  line.attempts += 1
}

function hasWatchers(line: Line): boolean {
  return (
    line.figures.size > 0 || line.candles.size > 0 || line.catchUp.size > 0
  )
}

function connect(line: Line): void {
  if (typeof document !== "undefined" && document.hidden) return
  const generation = (line.generation += 1)
  teardown(line)
  let socket: WebSocket
  try {
    // Read-only: this line carries public data and never an account.
    socket = new WebSocket(`${lighterWsUrl(line.network)}?readonly=true`)
  } catch {
    scheduleReconnect(line)
    return
  }
  line.socket = socket

  socket.addEventListener("open", () => {
    if (generation !== line.generation) return
    line.lastMessageAt = Date.now()
    line.lastPingAt = Date.now()
    if (line.everLost) for (const listener of line.catchUp) listener()
    send(line, { type: "subscribe", channel: "market_stats/all" })
    for (const key of line.candles.keys()) subscribeCandle(line, key)
  })
  socket.addEventListener("message", (event) => {
    if (generation !== line.generation) return
    line.attempts = 0
    try {
      handleMessage(line, JSON.parse(String(event.data)))
    } catch {
      // Acknowledgements and malformed frames carry no prices.
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
      if (
        !hasWatchers(line) ||
        (typeof document !== "undefined" && document.hidden)
      ) {
        return
      }
      if (line.reconnectAt > 0 && Date.now() >= line.reconnectAt) {
        line.reconnectAt = 0
        connect(line)
        return
      }
      if (!line.socket || line.reconnectAt > 0) return
      // Lighter closes a line whose client stays silent for two minutes.
      if (Date.now() - line.lastPingAt >= LIGHTER_KEEPALIVE_MS) {
        line.lastPingAt = Date.now()
        send(line, { type: "ping" })
      }
      if (Date.now() - line.lastMessageAt <= STALE_AFTER_MS) return
      line.everLost = true
      teardown(line)
      scheduleReconnect(line)
    }, WATCHDOG_EVERY_MS)
  }
}

function ensureOpen(line: Line): void {
  if (line.idleTimer) {
    clearTimeout(line.idleTimer)
    line.idleTimer = null
  }
  if (!line.socket && line.reconnectAt === 0) connect(line)
}

function closeIfIdle(line: Line): void {
  if (hasWatchers(line) || line.idleTimer) return
  line.idleTimer = setTimeout(() => {
    line.idleTimer = null
    if (hasWatchers(line)) return
    line.generation += 1
    teardown(line)
    if (line.watchdog) clearInterval(line.watchdog)
    line.watchdog = null
    line.reconnectAt = 0
    line.attempts = 0
    line.pendingCandles.clear()
  }, IDLE_CLOSE_MS)
}

/**
 * A hidden tab drops its socket and a visible one reconnects and catches up.
 * Private: the only caller is the listener below, and Lighter's browser line
 * has no other reason to be told about visibility.
 */
function setLighterPageVisible(visible: boolean): void {
  for (const line of lines.values()) {
    if (!visible) {
      line.generation += 1
      teardown(line)
      line.reconnectAt = 0
    } else if (hasWatchers(line)) {
      line.everLost = true
      connect(line)
    }
  }
}

function onVisibilityChange(): void {
  setLighterPageVisible(!document.hidden)
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", onVisibilityChange)
}

export function watchFigures(
  network: NetworkId,
  listener: FiguresListener
): () => void {
  const line = lineFor(network)
  line.figures.add(listener)
  ensureOpen(line)
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
  if (first) subscribeCandle(line, key)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      line.candles.delete(key)
      line.pendingCandles.delete(key)
      const channel = candleChannel(line, key)
      if (channel) send(line, { type: "unsubscribe", channel })
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
  ensureOpen(line)
  return () => {
    line.catchUp.delete(listener)
    closeIfIdle(line)
  }
}

/** Shuts one browser line. Tests and a page teardown after idle use this. */
export function closeLighterStream(network: NetworkId): void {
  const line = lineFor(network)
  line.generation += 1
  teardown(line)
  if (line.watchdog) clearInterval(line.watchdog)
  if (line.idleTimer) clearTimeout(line.idleTimer)
  line.watchdog = null
  line.idleTimer = null
  line.reconnectAt = 0
  line.attempts = 0
  line.figures.clear()
  line.candles.clear()
  line.catchUp.clear()
  line.pendingCandles.clear()
  line.idsBySymbol.clear()
  line.symbolsById.clear()
}
