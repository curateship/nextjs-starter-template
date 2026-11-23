import type { CandleInterval, LiveFigures } from "@/lib/protocols/contracts"
import {
  EDGEX_ALL_TICKERS,
  EDGEX_INTERVALS,
  edgexCandleChannel,
  edgexPong,
  edgexPublicWsUrl,
  toEdgexBar,
  toEdgexFigures,
} from "@/lib/protocols/edgex/translate"
import {
  createSocketStream,
  openJsonSocket,
  sendJson,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

/**
 * edgeX names a chart's channel by its contract number, and the browser only
 * holds the market's name. Every all-tickers frame carries both, so the
 * stream learns the numbers from them. A chart opened before the first frame
 * waits in `waiting` and is subscribed the moment its number is known.
 */
type State = {
  contractIds: Map<string, string>
  waiting: Map<string, { marketId: string; interval: CandleInterval }>
}

const INTERVAL_BY_NAME = new Map(
  (Object.entries(EDGEX_INTERVALS) as [CandleInterval, string][]).map(
    ([interval, name]) => [name, interval]
  )
)

function waitingKey(marketId: string, interval: CandleInterval): string {
  return `${marketId}\n${interval}`
}

/**
 * One edgeX frame routed to the screens. Answers true when it carried market
 * data, which is what keeps the line counted as alive.
 *
 * - `ticker.all.1s` publishes every contract's figures and teaches the
 *   stream each contract's number.
 * - `kline.LAST_PRICE.<id>.<interval>` publishes that market's working bar,
 *   named by the `contractName` each bar carries.
 * - edgeX's ping is answered with a pong carrying the same time.
 */
export function handleEdgexFrame(
  context: Pick<SocketStreamContext<State>, "publishFigures" | "publishCandle" | "state">,
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
  if (frame.type !== "quote-event" || typeof frame.channel !== "string") return false
  const content = frame.content as { data?: unknown } | undefined
  const rows = Array.isArray(content?.data) ? content.data : []
  if (frame.channel === EDGEX_ALL_TICKERS) {
    const updates = new Map<string, LiveFigures>()
    for (const raw of rows) {
      const row = toEdgexFigures(raw)
      if (!row) continue
      updates.set(row.marketId, row.figures)
      if (row.contractId) context.state.contractIds.set(row.marketId, row.contractId)
    }
    for (const [key, want] of context.state.waiting) {
      const contractId = context.state.contractIds.get(want.marketId)
      if (!contractId) continue
      context.state.waiting.delete(key)
      reply({ type: "subscribe", channel: edgexCandleChannel(want.interval, contractId) })
    }
    context.publishFigures(updates)
    return updates.size > 0
  }
  const [kind, , , name] = frame.channel.split(".")
  const interval = INTERVAL_BY_NAME.get(name ?? "")
  if (kind !== "kline" || !interval) return false
  let sawOne = false
  for (const raw of rows) {
    const bar = toEdgexBar(raw)
    const marketId = (raw as { contractName?: unknown }).contractName
    if (!bar || typeof marketId !== "string") continue
    sawOne = true
    context.publishCandle(marketId, interval, bar)
  }
  return sawOne
}

const stream = createSocketStream<State, WebSocket>({
  // edgeX pushes every contract every second, so twelve seconds of silence
  // is a dead line, the limit the other one-socket venues keep.
  staleAfterMs: 12_000,
  watchdogEveryMs: 4_000,
  createState: () => ({ contractIds: new Map(), waiting: new Map() }),
  connect: (context, ready) =>
    openJsonSocket(
      `${edgexPublicWsUrl(context.network)}?timestamp=${Date.now()}`,
      context,
      (packet, socket) => {
        if (handleEdgexFrame(context, packet, (frame) => sendJson(socket, frame))) {
          context.markAlive()
        }
      },
      ready
    ),
  readyOnReturn: false,
  close: (socket) => socket.close(),
  figures: "always",
  subscribeFigures: (_context, socket) => {
    sendJson(socket, { type: "subscribe", channel: EDGEX_ALL_TICKERS })
  },
  subscribeCandle: (context, socket, marketId, interval) => {
    const contractId = context.state.contractIds.get(marketId)
    if (!contractId) {
      const key = waitingKey(marketId, interval)
      context.state.waiting.set(key, { marketId, interval })
      return () => {
        context.state.waiting.delete(key)
        const known = context.state.contractIds.get(marketId)
        if (known) {
          sendJson(socket, { type: "unsubscribe", channel: edgexCandleChannel(interval, known) })
        }
      }
    }
    const channel = edgexCandleChannel(interval, contractId)
    sendJson(socket, { type: "subscribe", channel })
    return () => sendJson(socket, { type: "unsubscribe", channel })
  },
  // A new line starts with nothing waiting; the manager subscribes every
  // open chart again, and the numbers learned stay true across lines.
  resetState: (state) => state.waiting.clear(),
  catchUpKeepsAlive: true,
})

export const watchFigures = stream.watchFigures
export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp
