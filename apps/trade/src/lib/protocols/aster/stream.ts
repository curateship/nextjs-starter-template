import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  ASTER_INTERVALS,
  asterWsUrl,
  num,
  toAsterPushedFigures,
  toAsterTickerFigures,
} from "@/lib/protocols/aster/translate"
import {
  createSocketStream,
  openJsonSocket,
  sendJson,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

type State = {
  tickers: Map<string, ReturnType<typeof toAsterTickerFigures>>
  nextId: number
}

function pushedRows(packet: unknown): unknown[] {
  if (Array.isArray(packet)) return packet
  if (!packet || typeof packet !== "object") return []
  const data = (packet as { data?: unknown }).data
  return Array.isArray(data) ? data : [data ?? packet]
}

function handleMessage(
  context: SocketStreamContext<State>,
  packet: unknown
): void {
  const figureUpdates = new Map<string, LiveFigures>()
  let sawData = false

  for (const raw of pushedRows(packet)) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const kind = row.e
    const symbol = row.s

    if (kind === "24hrTicker" && typeof symbol === "string") {
      context.state.tickers.set(symbol, toAsterTickerFigures(row))
      sawData = true
      continue
    }
    if (kind === "markPriceUpdate" && typeof symbol === "string") {
      const figures = toAsterPushedFigures(
        row.p,
        context.state.tickers.get(symbol) ?? null
      )
      if (figures) figureUpdates.set(symbol, figures)
      sawData = sawData || figures !== null
      continue
    }
    if (kind !== "kline" || typeof symbol !== "string") continue
    const kline = row.k as Record<string, unknown> | undefined
    if (!kline) continue
    const interval = Object.entries(ASTER_INTERVALS).find(
      ([, value]) => value === kline.i
    )?.[0] as CandleInterval | undefined
    if (!interval) continue
    const bar = {
      openTime: num(kline.t),
      open: num(kline.o),
      high: num(kline.h),
      low: num(kline.l),
      close: num(kline.c),
      volume: num(kline.v) ?? 0,
    }
    if (
      bar.openTime === null ||
      bar.open === null ||
      bar.high === null ||
      bar.low === null ||
      bar.close === null
    ) {
      continue
    }
    context.publishCandle(symbol, interval, bar as CandleBar)
    sawData = true
  }

  context.publishFigures(figureUpdates)
  if (sawData) context.markAlive()
}

function sendSubscription(
  state: State,
  socket: WebSocket,
  method: "SUBSCRIBE" | "UNSUBSCRIBE",
  params: string[]
): void {
  if (params.length === 0) return
  sendJson(socket, { method, params, id: state.nextId++ })
}

const stream = createSocketStream<State, WebSocket>({
  staleAfterMs: 12_000,
  watchdogEveryMs: 4_000,
  createState: () => ({ tickers: new Map(), nextId: 1 }),
  connect: (context, ready) =>
    openJsonSocket(
      asterWsUrl(context.network),
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
    const params = ["!markPrice@arr@1s", "!ticker@arr"]
    sendSubscription(context.state, socket, "SUBSCRIBE", params)
    return () => sendSubscription(context.state, socket, "UNSUBSCRIBE", params)
  },
  subscribeCandle: (context, socket, marketId, interval) => {
    const topic = `${marketId.toLowerCase()}@kline_${ASTER_INTERVALS[interval]}`
    sendSubscription(context.state, socket, "SUBSCRIBE", [topic])
    return () => sendSubscription(context.state, socket, "UNSUBSCRIBE", [topic])
  },
  resubscribe: (context, socket) => {
    const params = context.figuresWatched()
      ? ["!markPrice@arr@1s", "!ticker@arr"]
      : []
    for (const { marketId, interval } of context.candleWants()) {
      params.push(
        `${marketId.toLowerCase()}@kline_${ASTER_INTERVALS[interval]}`
      )
    }
    sendSubscription(context.state, socket, "SUBSCRIBE", params)
  },
  unsubscribeFigures: (context, socket) => {
    sendSubscription(context.state, socket, "UNSUBSCRIBE", [
      "!markPrice@arr@1s",
      "!ticker@arr",
    ])
  },
  unsubscribeCandle: (context, socket, marketId, interval) => {
    sendSubscription(context.state, socket, "UNSUBSCRIBE", [
      `${marketId.toLowerCase()}@kline_${ASTER_INTERVALS[interval]}`,
    ])
  },
  resetState: (state) => state.tickers.clear(),
  catchUpKeepsAlive: true,
})

export const watchFigures = stream.watchFigures
export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp

export function setAsterPageVisible(visible: boolean): void {
  stream.setVisible(visible)
}

/** Shuts one browser line. Tests and a page teardown use this. */
export function closeAsterStream(network: NetworkId): void {
  stream.close(network)
}
