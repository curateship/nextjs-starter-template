import type { CandleBar, LiveFigures } from "@/lib/protocols/contracts"
import {
  PHEMEX_RESOLUTIONS,
  phemexWsUrl,
  toPhemexBar,
  toPhemexFigures,
} from "@/lib/protocols/phemex/translate"
import {
  createSocketStream,
  openJsonSocket,
  sendJson,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

type State = {
  nextId: number
  nextPingAt: number
}

function send(
  state: State,
  socket: WebSocket,
  method: string,
  params: unknown[]
): void {
  sendJson(socket, { id: state.nextId++, method, params })
}

function handleMessage(
  context: SocketStreamContext<State>,
  packet: unknown
): void {
  const message = packet as {
    fields?: unknown
    data?: unknown
    kline_p?: unknown
    symbol?: unknown
  }

  if (Array.isArray(message.fields) && Array.isArray(message.data)) {
    context.markAlive()
    const updates = new Map<string, LiveFigures>()
    for (const row of message.data) {
      if (!Array.isArray(row)) continue
      const named: Record<string, unknown> = {}
      message.fields.forEach((field, index) => {
        if (typeof field === "string") named[field] = row[index]
      })
      const symbol = named.symbol
      const figures = toPhemexFigures(named)
      if (typeof symbol === "string" && figures) updates.set(symbol, figures)
    }
    context.publishFigures(updates)
    return
  }

  if (!Array.isArray(message.kline_p) || typeof message.symbol !== "string") {
    return
  }
  context.markAlive()
  const rows = message.kline_p
    .map(toPhemexBar)
    .filter((bar): bar is CandleBar => bar !== null)
  if (rows.length === 0) return
  const bar = rows.reduce((left, right) =>
    left.openTime > right.openTime ? left : right
  )
  for (const want of context.candleWants()) {
    if (want.marketId !== message.symbol) continue
    if (bar.openTime % (PHEMEX_RESOLUTIONS[want.interval] * 1_000) !== 0) {
      continue
    }
    context.publishCandle(want.marketId, want.interval, bar)
  }
}

const stream = createSocketStream<State, WebSocket>({
  staleAfterMs: 12_000,
  watchdogEveryMs: 4_000,
  createState: () => ({ nextId: 10, nextPingAt: 0 }),
  connect: (context, ready) =>
    openJsonSocket(
      phemexWsUrl(context.network),
      context,
      (packet) => {
        handleMessage(context, packet)
      },
      ready
    ),
  readyOnReturn: false,
  close: (socket) => socket.close(),
  figures: "watched",
  subscribeFigures: (context, socket) => {
    send(context.state, socket, "perp_market24h_pack_p.subscribe", [])
  },
  subscribeCandle: (context, socket, marketId, interval) => {
    const params = [marketId, PHEMEX_RESOLUTIONS[interval]]
    send(context.state, socket, "kline_p.subscribe", params)
    return () => send(context.state, socket, "kline_p.unsubscribe", params)
  },
  onConnected: (context) => {
    context.state.nextPingAt = Date.now() + 5_000
  },
  onWatchdog: (context, socket, now) => {
    if (now < context.state.nextPingAt) return
    send(context.state, socket, "server.ping", [])
    context.state.nextPingAt = now + 5_000
  },
  catchUpKeepsAlive: true,
})

export const watchFigures = stream.watchFigures
export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp
