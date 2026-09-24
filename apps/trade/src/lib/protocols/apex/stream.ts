import type { CandleInterval, LiveFigures } from "@/lib/protocols/contracts"
import {
  APEX_ALL_MARKETS_TOPIC,
  APEX_INTERVALS,
  APEX_PING_EVERY_MS,
  apexCandleTopic,
  apexPublicWsUrl,
  looksLikeApexContract,
  toApexBar,
  toApexFigures,
} from "@/lib/protocols/apex/translate"
import {
  createSocketStream,
  openJsonSocket,
  sendJson,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

type State = { nextPingAt: number }

const INTERVAL_BY_NAME = new Map(
  (Object.entries(APEX_INTERVALS) as [CandleInterval, string][]).map(
    ([interval, name]) => [name, interval]
  )
)

/**
 * One ApeX frame routed to the screens. Answers true when it carried market
 * data, which is what keeps the line counted as alive.
 *
 * `instrumentInfo.all` frames publish every contract's figures, prediction
 * markets dropped by the shape of their id. `candle.<interval>.<market>`
 * frames publish that market's working bar. ApeX's own ping is answered
 * with a pong carrying the same stamp, as its connector does.
 */
export function handleApexFrame(
  context: Pick<SocketStreamContext<State>, "publishFigures" | "publishCandle">,
  packet: unknown,
  reply: (frame: object) => void
): boolean {
  if (!packet || typeof packet !== "object") return false
  const frame = packet as Record<string, unknown>
  if (frame.op === "ping") {
    reply({ op: "pong", args: Array.isArray(frame.args) ? frame.args : [String(Date.now())] })
    return false
  }
  if (typeof frame.topic !== "string" || !Array.isArray(frame.data)) return false
  if (frame.topic === APEX_ALL_MARKETS_TOPIC) {
    const updates = new Map<string, LiveFigures>()
    for (const raw of frame.data) {
      const row = toApexFigures(raw)
      if (row && looksLikeApexContract(row.marketId)) {
        updates.set(row.marketId, row.figures)
      }
    }
    context.publishFigures(updates)
    return updates.size > 0
  }
  const [kind, name, marketId] = frame.topic.split(".")
  const interval = INTERVAL_BY_NAME.get(name ?? "")
  if (kind !== "candle" || !interval || !marketId) return false
  let sawOne = false
  for (const raw of frame.data) {
    const bar = toApexBar(raw)
    if (!bar) continue
    sawOne = true
    context.publishCandle(marketId, interval, bar)
  }
  return sawOne
}

const stream = createSocketStream<State, WebSocket>({
  // ApeX pushes every market every 2 seconds, so twelve seconds of silence
  // is six missed frames, the same limit Lighter and Aster keep.
  staleAfterMs: 12_000,
  watchdogEveryMs: 4_000,
  createState: () => ({ nextPingAt: 0 }),
  connect: (context, ready) =>
    openJsonSocket(
      `${apexPublicWsUrl(context.network)}&timestamp=${Date.now()}`,
      context,
      (packet, socket) => {
        if (handleApexFrame(context, packet, (frame) => sendJson(socket, frame))) {
          context.markAlive()
        }
      },
      ready
    ),
  readyOnReturn: false,
  close: (socket) => socket.close(),
  figures: "always",
  subscribeFigures: (_context, socket) => {
    sendJson(socket, { op: "subscribe", args: [APEX_ALL_MARKETS_TOPIC] })
  },
  subscribeCandle: (_context, socket, marketId, interval) => {
    const topic = apexCandleTopic(interval, marketId)
    sendJson(socket, { op: "subscribe", args: [topic] })
    return () => sendJson(socket, { op: "unsubscribe", args: [topic] })
  },
  onConnected: (context) => {
    context.state.nextPingAt = Date.now() + APEX_PING_EVERY_MS
  },
  onWatchdog: (context, socket, now) => {
    if (now < context.state.nextPingAt) return
    sendJson(socket, { op: "ping", args: [String(now)] })
    context.state.nextPingAt = now + APEX_PING_EVERY_MS
  },
  catchUpKeepsAlive: true,
})

export const watchFigures = stream.watchFigures
export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp
