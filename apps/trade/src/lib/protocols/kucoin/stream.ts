import type { CandleInterval } from "@/lib/protocols/contracts"
import { loadLiveTicket } from "@/lib/api/trade/live-stream"
import {
  KUCOIN_GRANULARITIES,
  toKucoinPushedBar,
} from "@/lib/protocols/kucoin/translate"
import {
  createSocketStream,
  openJsonSocket,
  sendJson,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

type State = {
  pingEveryMs: number
  nextPingAt: number
}

function topicOf(marketId: string, interval: CandleInterval): string {
  return `/contractMarket/limitCandle:${marketId}_${KUCOIN_GRANULARITIES[interval]}min`
}

function send(socket: WebSocket, message: Record<string, unknown>): void {
  sendJson(socket, { id: crypto.randomUUID(), ...message })
}

function handleMessage(
  context: SocketStreamContext<State>,
  packet: unknown
): void {
  const message = packet as {
    type?: unknown
    topic?: unknown
    data?: { candles?: unknown } | null
  }
  if (message.type === "pong" || message.type === "welcome") {
    context.markAlive()
    return
  }
  if (message.type !== "message" || typeof message.topic !== "string") return
  const bar = toKucoinPushedBar(message.data?.candles)
  if (!bar) return
  context.markAlive()
  for (const want of context.candleWants()) {
    if (message.topic === topicOf(want.marketId, want.interval)) {
      context.publishCandle(want.marketId, want.interval, bar)
    }
  }
}

const stream = createSocketStream<State, WebSocket>({
  staleAfterMs: 90_000,
  watchdogEveryMs: 5_000,
  createState: () => ({ pingEveryMs: 10_000, nextPingAt: 0 }),
  connect: async (context, ready) => {
    const ticket = await loadLiveTicket("kucoin", context.network)
    context.state.pingEveryMs = Math.max(5_000, ticket.pingIntervalMs / 2)
    const url = `${ticket.endpoint}?token=${encodeURIComponent(ticket.token)}&connectId=${crypto.randomUUID()}`
    return openJsonSocket(
      url,
      context,
      (packet) => handleMessage(context, packet),
      ready
    )
  },
  readyOnReturn: false,
  close: (socket) => socket.close(),
  subscribeCandle: (_context, socket, marketId, interval) => {
    const topic = topicOf(marketId, interval)
    send(socket, { type: "subscribe", topic, response: true })
    return () => send(socket, { type: "unsubscribe", topic, response: true })
  },
  onConnected: (context) => {
    context.state.nextPingAt = Date.now() + context.state.pingEveryMs
  },
  onWatchdog: (context, socket, now) => {
    if (now < context.state.nextPingAt) return
    send(socket, { type: "ping" })
    context.state.nextPingAt = now + context.state.pingEveryMs
  },
  catchUpKeepsAlive: true,
})

export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp
