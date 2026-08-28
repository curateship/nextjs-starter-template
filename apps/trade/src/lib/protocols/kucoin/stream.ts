import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import { loadLiveTicket } from "@/lib/api/live-stream"
import {
  KUCOIN_GRANULARITIES,
  toKucoinPushedBar,
} from "@/lib/protocols/kucoin/translate"
import { reconnectDelay } from "@/lib/protocols/timing"

/**
 * KuCoin's live feed in the browser — the working bar under the chart.
 *
 * Two things make this exchange's stream different from the others.
 *
 * **The socket needs a ticket.** KuCoin will not accept a connection without
 * a token fetched over HTTP first, and the browser cannot fetch it itself —
 * the exchange's REST host refuses a cross-origin request. So the server
 * fetches it and hands it over (`loadLiveTicket`); the socket itself then
 * connects from the browser perfectly well. A ticket is good for one
 * connection, so a reconnect fetches a fresh one.
 *
 * **There is no all-markets topic**, so this adapter offers no `watchFigures`
 * at all — following six hundred coins would mean six hundred subscriptions.
 * The market list draws from the catalogue and redraws when the page does;
 * the chart, which watches one market, ticks. That absence is the honest
 * shape, and `LiveAdapter` allows it.
 *
 * Health is judged by data arriving, not by what the socket claims: quiet for
 * too long and the connection is rebuilt on a backoff, and every catch-up
 * listener is told so screens can refetch what a gap may have missed.
 */

const STALE_AFTER_MS = 90_000
const WATCHDOG_EVERY_MS = 5_000
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
  connecting: boolean
  /** Whether the connection has ever been lost — the next open is a recovery. */
  everLost: boolean
  candles: Map<string, Set<CandleListener>>
  catchUp: Set<() => void>
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
    connecting: false,
    everLost: false,
    candles: new Map(),
    catchUp: new Set(),
  }
  lines.set(network, made)
  return made
}

/** KuCoin's candle topic names the timeframe in minutes. */
const topicOf = (marketId: string, interval: CandleInterval) =>
  `/contractMarket/limitCandle:${marketId}_${KUCOIN_GRANULARITIES[interval]}min`

const candleKey = (marketId: string, interval: CandleInterval) =>
  `${marketId}:${interval}`

function splitCandleKey(key: string): [string, CandleInterval] {
  const at = key.lastIndexOf(":")
  return [key.slice(0, at), key.slice(at + 1) as CandleInterval]
}

function send(line: Line, message: Record<string, unknown>): void {
  const socket = line.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify({ id: crypto.randomUUID(), ...message }))
  } catch {
    // A send that fails is a socket the watchdog is about to replace.
  }
}

function subscribeAll(line: Line): void {
  for (const key of line.candles.keys()) {
    const [marketId, interval] = splitCandleKey(key)
    send(line, {
      type: "subscribe",
      topic: topicOf(marketId, interval),
      response: true,
    })
  }
}

/**
 * One pushed candle applied to its listeners, read with the socket's OWN
 * shape — its column order and its time unit both differ from the REST
 * klines, so the two readers are deliberately separate.
 */
function handleMessage(line: Line, message: unknown): void {
  const packet = message as {
    type?: unknown
    topic?: unknown
    data?: { candles?: unknown; symbol?: unknown } | null
  }
  if (packet.type === "pong" || packet.type === "welcome") {
    line.lastMessageAt = Date.now()
    return
  }
  if (packet.type !== "message" || typeof packet.topic !== "string") return

  const bar = toKucoinPushedBar(packet.data?.candles)
  if (!bar) return
  line.lastMessageAt = Date.now()

  for (const [key, listeners] of line.candles) {
    const [marketId, interval] = splitCandleKey(key)
    if (packet.topic !== topicOf(marketId, interval)) continue
    for (const listener of listeners) listener(bar)
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
  const wait = reconnectDelay(line.attempts)
  line.attempts += 1
  line.reconnectAt = Date.now() + wait
}

function hasWatchers(line: Line): boolean {
  return line.candles.size > 0 || line.catchUp.size > 0
}

async function connect(line: Line): Promise<void> {
  if (line.connecting) return
  line.connecting = true
  const generation = (line.generation += 1)
  teardown(line)

  try {
    const ticket = await loadLiveTicket("kucoin", line.network)
    if (generation !== line.generation) return

    // The exchange names its own address and asks to be greeted at its own
    // pace; both come with the ticket rather than being assumed here.
    const url = `${ticket.endpoint}?token=${encodeURIComponent(ticket.token)}&connectId=${crypto.randomUUID()}`
    const socket = new WebSocket(url)
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
        () => send(line, { type: "ping" }),
        Math.max(5_000, ticket.pingIntervalMs / 2)
      )
    })

    socket.addEventListener("message", (event) => {
      if (generation !== line.generation) return
      line.attempts = 0
      try {
        handleMessage(line, JSON.parse(String(event.data)))
      } catch {
        // Not JSON, not a candle.
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
  } catch {
    // No ticket, no socket — the watchdog tries again on a backoff, and the
    // chart keeps the bars it already fetched meanwhile.
    line.everLost = true
    scheduleReconnect(line)
  } finally {
    line.connecting = false
  }

  if (!line.watchdog) {
    line.watchdog = setInterval(() => {
      if (!hasWatchers(line)) return
      if (line.reconnectAt > 0 && Date.now() >= line.reconnectAt) {
        line.reconnectAt = 0
        void connect(line)
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
  if (line.socket || line.reconnectAt > 0 || line.connecting) return
  void connect(line)
}

/** Closes the line once nobody is listening — tabs navigate, sockets follow. */
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
    send(line, {
      type: "subscribe",
      topic: topicOf(marketId, interval),
      response: true,
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      line.candles.delete(key)
      send(line, {
        type: "unsubscribe",
        topic: topicOf(marketId, interval),
        response: true,
      })
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
