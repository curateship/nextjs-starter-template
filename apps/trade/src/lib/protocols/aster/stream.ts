import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  ASTER_INTERVALS,
  asterReconnectDelay,
  asterWsUrl,
  num,
  toAsterPushedFigures,
  toAsterTickerFigures,
} from "@/lib/protocols/aster/translate"

const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000
const IDLE_CLOSE_MS = 4_000

type FiguresListener = (updates: ReadonlyMap<string, LiveFigures>) => void
type CandleListener = (bar: CandleBar) => void
type TickerFigures = ReturnType<typeof toAsterTickerFigures>

type Line = {
  network: NetworkId
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  attempts: number
  reconnectAt: number
  watchdog: ReturnType<typeof setInterval> | null
  idleTimer: ReturnType<typeof setTimeout> | null
  everLost: boolean
  figures: Set<FiguresListener>
  candles: Map<string, Set<CandleListener>>
  catchUp: Set<() => void>
  tickers: Map<string, TickerFigures>
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
    idleTimer: null,
    everLost: false,
    figures: new Set(),
    candles: new Map(),
    catchUp: new Set(),
    tickers: new Map(),
    nextId: 1,
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

function subscribedStreams(line: Line): string[] {
  const streams = line.figures.size > 0 ? ["!markPrice@arr@1s", "!ticker@arr"] : []
  for (const key of line.candles.keys()) {
    const [marketId, interval] = splitCandleKey(key)
    streams.push(`${marketId.toLowerCase()}@kline_${ASTER_INTERVALS[interval]}`)
  }
  return streams
}

function sendSubscription(line: Line, method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
  if (params.length === 0) return
  const socket = line.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify({ method, params, id: line.nextId++ }))
  } catch {
    // The watchdog replaces a socket that cannot accept a command.
  }
}

function pushedRows(packet: unknown): unknown[] {
  if (Array.isArray(packet)) return packet
  if (!packet || typeof packet !== "object") return []
  const data = (packet as { data?: unknown }).data
  return Array.isArray(data) ? data : [data ?? packet]
}

function handleMessage(line: Line, packet: unknown): void {
  const figureUpdates = new Map<string, LiveFigures>()
  let sawData = false

  for (const raw of pushedRows(packet)) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const kind = row.e
    const symbol = row.s

    if (kind === "24hrTicker" && typeof symbol === "string") {
      line.tickers.set(symbol, toAsterTickerFigures(row))
      sawData = true
      continue
    }
    if (kind === "markPriceUpdate" && typeof symbol === "string") {
      const figures = toAsterPushedFigures(row.p, line.tickers.get(symbol) ?? null)
      if (figures) figureUpdates.set(symbol, figures)
      sawData = sawData || figures !== null
      continue
    }
    if (kind === "kline" && typeof symbol === "string") {
      const kline = row.k as Record<string, unknown> | undefined
      if (!kline) continue
      const interval = Object.entries(ASTER_INTERVALS).find(([, value]) => value === kline.i)?.[0] as CandleInterval | undefined
      if (!interval) continue
      const bar = {
        openTime: num(kline.t),
        open: num(kline.o),
        high: num(kline.h),
        low: num(kline.l),
        close: num(kline.c),
        volume: num(kline.v) ?? 0,
      }
      if (bar.openTime === null || bar.open === null || bar.high === null || bar.low === null || bar.close === null) continue
      const listeners = line.candles.get(candleKey(symbol, interval))
      if (listeners) for (const listener of listeners) listener(bar as CandleBar)
      sawData = true
    }
  }

  if (figureUpdates.size > 0) {
    for (const listener of line.figures) listener(figureUpdates)
  }
  if (sawData) line.lastMessageAt = Date.now()
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
  line.reconnectAt = Date.now() + asterReconnectDelay(line.attempts)
  line.attempts += 1
}

function hasWatchers(line: Line): boolean {
  return line.figures.size > 0 || line.candles.size > 0 || line.catchUp.size > 0
}

function connect(line: Line): void {
  if (typeof document !== "undefined" && document.hidden) return
  const generation = (line.generation += 1)
  teardown(line)
  let socket: WebSocket
  try {
    socket = new WebSocket(asterWsUrl(line.network))
  } catch {
    scheduleReconnect(line)
    return
  }
  line.socket = socket

  socket.addEventListener("open", () => {
    if (generation !== line.generation) return
    line.lastMessageAt = Date.now()
    if (line.everLost) for (const listener of line.catchUp) listener()
    sendSubscription(line, "SUBSCRIBE", subscribedStreams(line))
  })
  socket.addEventListener("message", (event) => {
    if (generation !== line.generation) return
    line.attempts = 0
    try {
      handleMessage(line, JSON.parse(String(event.data)))
    } catch {
      // Aster acknowledgements and malformed frames carry no prices.
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
      if (!hasWatchers(line) || (typeof document !== "undefined" && document.hidden)) return
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
    line.tickers.clear()
  }, IDLE_CLOSE_MS)
}

export function setAsterPageVisible(visible: boolean): void {
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
  setAsterPageVisible(!document.hidden)
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", onVisibilityChange)
}

export function watchFigures(network: NetworkId, listener: FiguresListener): () => void {
  const line = lineFor(network)
  const first = line.figures.size === 0
  line.figures.add(listener)
  ensureOpen(line)
  if (first) sendSubscription(line, "SUBSCRIBE", ["!markPrice@arr@1s", "!ticker@arr"])
  return () => {
    line.figures.delete(listener)
    if (line.figures.size === 0) sendSubscription(line, "UNSUBSCRIBE", ["!markPrice@arr@1s", "!ticker@arr"])
    closeIfIdle(line)
  }
}

export function watchCandle(network: NetworkId, marketId: string, interval: CandleInterval, listener: CandleListener): () => void {
  const line = lineFor(network)
  const key = candleKey(marketId, interval)
  const listeners = line.candles.get(key) ?? new Set<CandleListener>()
  const first = listeners.size === 0
  listeners.add(listener)
  line.candles.set(key, listeners)
  ensureOpen(line)
  const stream = `${marketId.toLowerCase()}@kline_${ASTER_INTERVALS[interval]}`
  if (first) sendSubscription(line, "SUBSCRIBE", [stream])
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      line.candles.delete(key)
      sendSubscription(line, "UNSUBSCRIBE", [stream])
    }
    closeIfIdle(line)
  }
}

export function watchCatchUp(network: NetworkId, listener: () => void): () => void {
  const line = lineFor(network)
  line.catchUp.add(listener)
  ensureOpen(line)
  return () => {
    line.catchUp.delete(listener)
    closeIfIdle(line)
  }
}

/** Shuts one browser line. Tests and a page teardown after an idle spell use this. */
export function closeAsterStream(network: NetworkId): void {
  const line = lineFor(network)
  line.generation += 1
  teardown(line)
  if (line.watchdog) clearInterval(line.watchdog)
  if (line.idleTimer) clearTimeout(line.idleTimer)
  line.watchdog = null
  line.idleTimer = null
  line.reconnectAt = 0
  line.attempts = 0
  line.tickers.clear()
  line.figures.clear()
  line.candles.clear()
  line.catchUp.clear()
}
