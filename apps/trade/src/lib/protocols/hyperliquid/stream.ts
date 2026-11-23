import {
  CANDLE_INTERVALS,
  type CandleInterval,
  type LiveFigures,
} from "@/lib/protocols/contracts"
import {
  namespaceMarketId,
  num,
  sameFigures,
  toLiveFigures,
} from "@/lib/protocols/hyperliquid/translate"
import {
  createSocketStream,
  type SocketStreamContext,
} from "@/lib/protocols/socket-stream"

const NAMES_GOOD_FOR_MS = 10 * 60_000

type State = {
  lastFigures: Map<string, LiveFigures>
  idByVenueIndex: Map<string, string[]>
  namesFetchedAt: number
}

async function connect(context: SocketStreamContext<State>) {
  const sdk = await import("@nktkas/hyperliquid")
  const needNames =
    context.state.idByVenueIndex.size === 0 ||
    Date.now() - context.state.namesFetchedAt > NAMES_GOOD_FOR_MS
  if (needNames) {
    const info = new sdk.InfoClient({
      transport: new sdk.HttpTransport({
        isTestnet: context.network === "testnet",
      }),
    })
    try {
      const [dexs, metas] = await Promise.all([
        info.perpDexs(),
        info.allPerpMetas(),
      ])
      context.state.idByVenueIndex = new Map(
        metas.map((meta, index) => {
          const dex = index === 0 ? null : dexs[index]
          const name = dex?.name ?? ""
          return [
            name,
            meta.universe.map((asset) => namespaceMarketId(name, asset.name)),
          ]
        })
      )
      context.state.namesFetchedAt = Date.now()
    } catch (error) {
      if (context.state.idByVenueIndex.size === 0) throw error
    }
  }

  const transport = new sdk.WebSocketTransport({
    isTestnet: context.network === "testnet",
  })
  const client = new sdk.SubscriptionClient({ transport })
  return { transport, client }
}

type Connection = Awaited<ReturnType<typeof connect>>

const stream = createSocketStream<State, Connection>({
  staleAfterMs: 8_000,
  watchdogEveryMs: 3_000,
  createState: () => ({
    lastFigures: new Map(),
    idByVenueIndex: new Map(),
    namesFetchedAt: 0,
  }),
  connect,
  close: (connection) => {
    void Promise.resolve(connection.transport.close()).catch(() => {})
  },
  figures: "always",
  subscribeFigures: async (context, connection) => {
    const subscription = await connection.client.allDexsAssetCtxs((event) => {
      context.markAlive()
      const updates = new Map<string, LiveFigures>()
      for (const [venue, rows] of event.ctxs) {
        const ids = context.state.idByVenueIndex.get(venue)
        if (!ids) continue
        rows.forEach((row, index) => {
          const marketId = ids[index]
          if (!marketId) return
          const figures = toLiveFigures(row)
          if (!figures) return
          const last = context.state.lastFigures.get(marketId)
          if (last && sameFigures(last, figures)) return
          context.state.lastFigures.set(marketId, figures)
          updates.set(marketId, figures)
        })
      }
      context.publishFigures(updates)
    })
    return () => void subscription.unsubscribe().catch(() => {})
  },
  subscribeCandle: async (context, connection, marketId, interval) => {
    const subscription = await connection.client.candle(
      { coin: marketId, interval },
      (event) => {
        context.markAlive()
        const open = num(event.o)
        const high = num(event.h)
        const low = num(event.l)
        const close = num(event.c)
        if (open === null || high === null || low === null || close === null) {
          return
        }
        context.publishCandle(marketId, interval, {
          openTime: event.t,
          open,
          high,
          low,
          close,
          volume: num(event.v) ?? 0,
        })
      }
    )
    return () => void subscription.unsubscribe().catch(() => {})
  },
  replayFigures: (state, listener) => {
    if (state.lastFigures.size > 0) listener(new Map(state.lastFigures))
  },
  resetState: (state) => state.lastFigures.clear(),
  acceptCandle: (interval: CandleInterval) =>
    CANDLE_INTERVALS.includes(interval),
  recoveryOn: "data",
})

export const watchFigures = stream.watchFigures
export const watchCandle = stream.watchCandle
export const watchCatchUp = stream.watchCatchUp
