import type {
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  LIGHTER_INTERVALS,
  LIGHTER_KEEPALIVE_MS,
  lighterWsUrl,
  toLighterBar,
  toLighterStatsFigures,
} from "@/lib/protocols/lighter/translate"
import {
  candleKey,
  createSocketStream,
  openJsonSocket,
  sendJson,
  splitCandleKey,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

type State = {
  idsBySymbol: Map<string, number>
  symbolsById: Map<number, string>
  pendingCandles: Set<string>
  nextPingAt: number
}

function candleChannel(state: State, key: string): string | null {
  const [marketId, interval] = splitCandleKey(key)
  const id = state.idsBySymbol.get(marketId)
  if (id === undefined) return null
  return `candle/${id}/${LIGHTER_INTERVALS[interval]}`
}

function subscribeCandle(state: State, socket: WebSocket, key: string): void {
  const channel = candleChannel(state, key)
  if (channel === null) {
    state.pendingCandles.add(key)
    return
  }
  state.pendingCandles.delete(key)
  sendJson(socket, { type: "subscribe", channel })
}

function handleStats(
  context: SocketStreamContext<State>,
  socket: WebSocket,
  packet: Record<string, unknown>
): boolean {
  const stats = packet.market_stats
  if (!stats || typeof stats !== "object") return false
  const updates = new Map<string, LiveFigures>()
  let learnedOne = false
  for (const raw of Object.values(stats as Record<string, unknown>)) {
    const row = toLighterStatsFigures(raw)
    if (!row) continue
    if (!context.state.idsBySymbol.has(row.symbol)) learnedOne = true
    context.state.idsBySymbol.set(row.symbol, row.marketId)
    context.state.symbolsById.set(row.marketId, row.symbol)
    updates.set(row.symbol, row.figures)
  }
  if (learnedOne) {
    for (const key of [...context.state.pendingCandles]) {
      subscribeCandle(context.state, socket, key)
    }
  }
  context.publishFigures(updates)
  return updates.size > 0
}

function handleCandles(
  context: SocketStreamContext<State>,
  packet: Record<string, unknown>
): boolean {
  if (typeof packet.channel !== "string") return false
  const parts = packet.channel.split(":")
  if (parts[0] !== "candle" || parts.length !== 3) return false
  const symbol = context.state.symbolsById.get(Number(parts[1]))
  if (symbol === undefined) return false
  const interval = (
    Object.entries(LIGHTER_INTERVALS) as [CandleInterval, string][]
  ).find(([, name]) => name === parts[2])?.[0]
  if (!interval) return false
  let sawOne = false
  for (const raw of Array.isArray(packet.candles) ? packet.candles : []) {
    const bar = toLighterBar(raw)
    if (!bar) continue
    sawOne = true
    context.publishCandle(symbol, interval, bar)
  }
  return sawOne
}

function handleMessage(
  context: SocketStreamContext<State>,
  socket: WebSocket,
  packet: unknown
): void {
  if (!packet || typeof packet !== "object") return
  const message = packet as Record<string, unknown>
  const sawStats = handleStats(context, socket, message)
  const sawCandle = handleCandles(context, message)
  if (sawStats || sawCandle) context.markAlive()
}

const stream = createSocketStream<State, WebSocket>({
  staleAfterMs: 12_000,
  watchdogEveryMs: 4_000,
  createState: () => ({
    idsBySymbol: new Map(),
    symbolsById: new Map(),
    pendingCandles: new Set(),
    nextPingAt: 0,
  }),
  connect: (context, ready) =>
    openJsonSocket(
      `${lighterWsUrl(context.network)}?readonly=true`,
      context,
      (packet, socket) => handleMessage(context, socket, packet),
      ready
    ),
  readyOnReturn: false,
  close: (socket) => socket.close(),
  figures: "always",
  subscribeFigures: (_context, socket) => {
    sendJson(socket, { type: "subscribe", channel: "market_stats/all" })
  },
  subscribeCandle: (context, socket, marketId, interval) => {
    const key = candleKey(marketId, interval)
    subscribeCandle(context.state, socket, key)
    return () => {
      context.state.pendingCandles.delete(key)
      const channel = candleChannel(context.state, key)
      if (channel) sendJson(socket, { type: "unsubscribe", channel })
    }
  },
  onConnected: (context) => {
    context.state.nextPingAt = Date.now() + LIGHTER_KEEPALIVE_MS
  },
  onWatchdog: (context, socket, now) => {
    if (now < context.state.nextPingAt) return
    sendJson(socket, { type: "ping" })
    context.state.nextPingAt = now + LIGHTER_KEEPALIVE_MS
  },
  resetState: (state, reason) => {
    state.pendingCandles.clear()
    if (reason === "close") {
      state.idsBySymbol.clear()
      state.symbolsById.clear()
    }
  },
  catchUpKeepsAlive: true,
})

export const watchFigures = stream.watchFigures
export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp

/** Shuts one browser line. Tests and a page teardown use this. */
export function closeLighterStream(network: NetworkId): void {
  stream.close(network)
}
