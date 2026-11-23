import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  BINANCE_MARKET_SOCKET,
  binanceSymbolFor,
  coinNameFor,
} from "@/lib/protocols/binance/translate"
import { num } from "@/lib/protocols/number"
import {
  createSocketStream,
  openJsonSocket,
  sendJson,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

/**
 * Binance's live marks, daily figures and working candles for the browser.
 *
 * One socket carries everything: every market's mark once a second, every
 * market's daily figures, and the candle of whichever charts are open.
 * Binance names markets by symbol (`1000PEPEUSDT`); everything here is
 * handed on under the app's coin name (`kPEPE`), the id every Binance row
 * carries. Mainnet only, like the rest of Binance.
 */

type Daily = Pick<LiveFigures, "change24h" | "volume24hUsd">

type State = { daily: Map<string, Daily>; nextId: number }

const FIGURES = ["!markPrice@arr@1s", "!ticker@arr"]

function rowsOf(packet: unknown): unknown[] {
  if (Array.isArray(packet)) return packet
  if (!packet || typeof packet !== "object") return []
  const data = (packet as { data?: unknown }).data
  if (data === undefined) return [packet]
  return Array.isArray(data) ? data : [data]
}

function candleTopic(marketId: string, interval: CandleInterval): string | null {
  const symbol = binanceSymbolFor(marketId)
  // Binance spells its intervals the way the app does.
  return symbol ? `${symbol.toLowerCase()}@kline_${interval}` : null
}

/** Reads one pushed frame. Exported for its test. */
export function readBinanceFrame(
  daily: Map<string, Daily>,
  packet: unknown
): {
  figures: Map<string, LiveFigures>
  candles: Array<{ marketId: string; interval: CandleInterval; bar: CandleBar }>
  sawData: boolean
} {
  const figures = new Map<string, LiveFigures>()
  const candles: Array<{
    marketId: string
    interval: CandleInterval
    bar: CandleBar
  }> = []
  let sawData = false
  for (const raw of rowsOf(packet)) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const coin = typeof row.s === "string" ? coinNameFor(row.s) : null
    if (coin === null) continue
    if (row.e === "24hrTicker") {
      const change = num(row.P)
      daily.set(coin, {
        change24h: change === null ? null : change / 100,
        volume24hUsd: num(row.q) ?? 0,
      })
      sawData = true
      continue
    }
    if (row.e === "markPriceUpdate") {
      const price = num(row.p)
      const day = daily.get(coin)
      // A mark is only drawn once the day's figures have arrived, so the
      // list never shows a price beside a blank change.
      if (price === null || !(price > 0) || !day) continue
      figures.set(coin, {
        price,
        change24h: day.change24h,
        volume24hUsd: day.volume24hUsd,
        fundingHourly: null,
        openInterestUsd: null,
      })
      sawData = true
      continue
    }
    if (row.e !== "kline") continue
    const k = row.k as Record<string, unknown> | undefined
    const interval = k?.i as CandleInterval | undefined
    if (!k || !interval || candleTopic(coin, interval) === null) continue
    const openTime = num(k.t)
    const open = num(k.o)
    const high = num(k.h)
    const low = num(k.l)
    const close = num(k.c)
    if (
      openTime === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue
    }
    candles.push({
      marketId: coin,
      interval,
      bar: { openTime, open, high, low, close, volume: num(k.v) ?? 0 },
    })
    sawData = true
  }
  return { figures, candles, sawData }
}

function handleMessage(context: SocketStreamContext<State>, packet: unknown): void {
  const frame = readBinanceFrame(context.state.daily, packet)
  for (const one of frame.candles) {
    context.publishCandle(one.marketId, one.interval, one.bar)
  }
  context.publishFigures(frame.figures)
  if (frame.sawData) context.markAlive()
}

function send(
  state: State,
  socket: WebSocket,
  method: "SUBSCRIBE" | "UNSUBSCRIBE",
  params: Array<string | null>
): void {
  const topics = params.filter((one): one is string => one !== null)
  if (topics.length === 0) return
  sendJson(socket, { method, params: topics, id: state.nextId++ })
}

const stream = createSocketStream<State, WebSocket>({
  staleAfterMs: 12_000,
  watchdogEveryMs: 4_000,
  createState: () => ({ daily: new Map(), nextId: 1 }),
  connect: (context, ready) =>
    openJsonSocket(
      BINANCE_MARKET_SOCKET,
      context,
      (packet) => handleMessage(context, packet),
      ready
    ),
  readyOnReturn: false,
  close: (socket) => socket.close(),
  figures: "watched",
  subscribeFigures: (context, socket) => {
    send(context.state, socket, "SUBSCRIBE", FIGURES)
    return () => send(context.state, socket, "UNSUBSCRIBE", FIGURES)
  },
  subscribeCandle: (context, socket, marketId, interval) => {
    const topic = candleTopic(marketId, interval)
    send(context.state, socket, "SUBSCRIBE", [topic])
    return () => send(context.state, socket, "UNSUBSCRIBE", [topic])
  },
  resubscribe: (context, socket) => {
    const params: Array<string | null> = context.figuresWatched()
      ? [...FIGURES]
      : []
    for (const { marketId, interval } of context.candleWants()) {
      params.push(candleTopic(marketId, interval))
    }
    send(context.state, socket, "SUBSCRIBE", params)
  },
  unsubscribeFigures: (context, socket) => {
    send(context.state, socket, "UNSUBSCRIBE", FIGURES)
  },
  unsubscribeCandle: (context, socket, marketId, interval) => {
    send(context.state, socket, "UNSUBSCRIBE", [candleTopic(marketId, interval)])
  },
  resetState: (state) => state.daily.clear(),
  catchUpKeepsAlive: true,
})

function mainnetOnly<T extends unknown[]>(
  watch: (network: NetworkId, ...rest: T) => () => void
) {
  return (network: NetworkId, ...rest: T): (() => void) =>
    network === "mainnet" ? watch(network, ...rest) : () => {}
}

export const watchFigures = mainnetOnly(stream.watchFigures)
export const watchCandle = mainnetOnly(stream.watchCandle)
export const watchCatchUp = mainnetOnly(stream.watchCatchUp)
