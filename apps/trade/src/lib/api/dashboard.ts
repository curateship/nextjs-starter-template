import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  parseMarketKey,
  protocolFirstPaintMs,
  type CandleBar,
  type CandleInterval,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import type { CardFolds } from "@/lib/trade/card-folds"
import type { ChartOptions } from "@/lib/trade/chart-options"
import type { ChartView } from "@/lib/trade/chart-view"
import type { IndicatorSettings } from "@/lib/trade/indicators/registry"
import {
  filterMarketsByVolume,
  type FilteredMarketCatalog,
} from "@/lib/trade/market-volume"
import type { DcaParams } from "@/lib/trade/dca"
import type { GridParams } from "@/lib/trade/grid"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import { DEFAULT_CHART_INTERVAL } from "@/lib/trade/chart-interval"
import type { Drawing } from "@/lib/trade/drawings"
import {
  RUNNING_BOTS_READ_ERROR,
  type RunningBot,
} from "@/lib/trade/running-bots"
import type { MarketFolder, MarketPanelRows } from "@/lib/trade/market-folders"
import type {
  TradeSoundCursor,
  TradeSoundEvent,
} from "@/lib/trade/trade-sounds"
import type { TradeWallet, WalletAccountSummary } from "@/lib/trade/wallets"
import { userGet } from "@/server/guards"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { getProtocol } from "@/server/protocols/registry"
import { loadProtocolCandles } from "@/server/trade/candles"
import { loadChartDrawings } from "@/server/trade/drawings"
import { loadMarketFolders } from "@/server/trade/market-folders"
import { tradeSoundEventsAfter } from "@/server/trade/notice-links"
import { loadDashboardPrefs, loadLastWalletIds } from "@/server/trade/prefs"
import { listRunningBots } from "@/server/trade/running-bots"
import { loadWalletSummaries } from "@/server/trade/wallets"

import { getCandlesErrorMessage } from "./candles"
import { getMarketsErrorMessage } from "./markets"

/**
 * Everything a dashboard needs before it can paint, in ONE server call.
 *
 * A dashboard used to open with eight server functions fired together: the
 * market list, the stars, and six preferences. Every one of the eight paid
 * its own session lookup (two or three database round trips) before doing
 * anything, and six of them then read the same preference row. Against a
 * database 120 ms away that added up to two dozen round trips for one row
 * and one catalogue. This call pays the lookup once, reads the row once, and
 * asks the exchange once.
 *
 * The single-purpose loaders in `markets.ts`, `chart-view.ts` and the rest
 * still exist for the screens that want one thing on its own.
 */
export type DashboardBootstrap = {
  markets: { catalogs: FilteredMarketCatalog[]; error: string | null }
  folders: MarketFolder[]
  /** Where the two rows that are not folders sit in the markets panel. */
  panelRows: MarketPanelRows
  lastMarketKey: string | null
  chartView: ChartView | null
  chartOptions: ChartOptions
  indicators: IndicatorSettings
  cardFolds: CardFolds
  quickOrder: QuickOrderPrefs
  /**
   * The smart-order windows' saved settings, carried with the page so the
   * first right-click after a load opens on them with nothing to fetch.
   */
  smartDca: DcaParams | null
  smartGrid: GridParams | null
  /** The Bots tab's first answer, carried with the rest of the dashboard. */
  runningBots: { rows: RunningBot[]; error: string | null }
  /** The remembered market's first paint; deeper history still follows. */
  initialChart: {
    key: string
    interval: CandleInterval
    candles: CandleBar[]
    error: string | null
  } | null
  /** The remembered market's saved lines, read without another session check. */
  drawings: {
    marketKey: string | null
    rows: Drawing[]
    error: string | null
  }
  /** The account switch and the opening cursor for fill and stop sounds. */
  tradeSounds: {
    enabled: boolean
    events: TradeSoundEvent[]
    cursor: TradeSoundCursor
    error: string | null
  }
  /** The account panel's first answer; its 15-second refresh remains. */
  wallets: {
    rows: TradeWallet[]
    summaries: WalletAccountSummary[]
    lastWalletIds: Record<string, string>
    error: string | null
  }
}

const bootstrapSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
})

const loadDashboardBootstrapFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(bootstrapSchema)
  .handler(async ({ data, context }): Promise<DashboardBootstrap> => {
    const protocol = getProtocol(data.protocol)
    // A network the exchange does not run is refused, not answered with an
    // empty list that reads as "no markets today".
    if (!protocol.networks.includes(data.network)) {
      throw new Error(`PROTOCOL_NO_NETWORK:${data.protocol}:${data.network}`)
    }
    const openedAt = Date.now()
    const soundCursor: TradeSoundCursor = { afterAt: openedAt, afterId: "" }
    const prefsPromise = loadDashboardPrefs(context.user.id, data)
    const drawingsPromise = prefsPromise.then(async (prefs) => {
      const marketKey = marketOnDashboard(
        prefs.lastMarketKey,
        data.protocol,
        data.network
      )
      if (!marketKey) {
        return { marketKey: null, rows: [], error: null }
      }
      return loadChartDrawings(context.user.id, marketKey).then(
        (rows) => ({ marketKey, rows, error: null as string | null }),
        () => ({
          marketKey,
          rows: [] as Drawing[],
          error: "Your drawings for this market could not be loaded.",
        })
      )
    })
    const initialChartPromise = prefsPromise.then(async (prefs) => {
      const marketKey = marketOnDashboard(
        prefs.lastMarketKey,
        data.protocol,
        data.network
      )
      if (!marketKey) return null
      const interval = DEFAULT_CHART_INTERVAL
      return loadProtocolCandles(
        marketKey,
        interval,
        openedAt - protocolFirstPaintMs(data.protocol)
      ).then(
        (candles) => ({
          key: `${marketKey}@${interval}`,
          interval,
          candles,
          error: null as string | null,
        }),
        (error: unknown) => ({
          key: `${marketKey}@${interval}`,
          interval,
          candles: [] as CandleBar[],
          error: getCandlesErrorMessage(error),
        })
      )
    })
    const [
      catalog,
      prefs,
      folders,
      runningBots,
      drawings,
      initialChart,
      tradeSounds,
      wallets,
    ] = await Promise.all([
      // A dead exchange must not take the page down with it: the workspace
      // still opens, and the list explains itself and offers a retry.
      loadRawMarketCatalog(data.protocol, data.network).then(
        (value) => ({ catalog: value, error: null as string | null }),
        (error: unknown) => ({
          catalog: null,
          error: getMarketsErrorMessage(error),
        })
      ),
      prefsPromise,
      // Losing folders must not keep the rest of the dashboard from opening.
      loadMarketFolders(context.user.id, data.protocol, data.network).catch(
        () => [] as MarketFolder[]
      ),
      // The bot list must not take the trading screen down. Its own tab says
      // when this read failed and can retry it without reloading the page.
      listRunningBots(context.user.id, data.protocol).then(
        (rows) => ({ rows, error: null as string | null }),
        () => ({
          rows: [] as RunningBot[],
          error: RUNNING_BOTS_READ_ERROR,
        })
      ),
      drawingsPromise,
      initialChartPromise,
      Promise.all([
        prefsPromise,
        tradeSoundEventsAfter(context.user.id, soundCursor),
      ]).then(
        ([soundPrefs, soundEvents]) => ({
          enabled: soundPrefs.tradeSoundsEnabled,
          ...soundEvents,
          error: null as string | null,
        }),
        () => ({
          enabled: false,
          events: [] as TradeSoundEvent[],
          cursor: soundCursor,
          error: "Trade sounds could not be read.",
        })
      ),
      Promise.all([
        loadWalletSummaries(context.user.id, data.protocol),
        loadLastWalletIds(context.user.id),
      ]).then(
        ([answer, lastWalletIds]) => ({
          rows: answer.wallets,
          summaries: answer.summaries,
          lastWalletIds,
          error: null as string | null,
        }),
        () => ({
          rows: [] as TradeWallet[],
          summaries: [] as WalletAccountSummary[],
          lastWalletIds: {},
          error: "The wallets could not be loaded.",
        })
      ),
    ])
    return {
      markets: catalog.catalog
        ? {
            catalogs: [
              filterMarketsByVolume(
                catalog.catalog,
                prefs.minimumMarketVolumeUsd
              ),
            ],
            error: null,
          }
        : { catalogs: [], error: catalog.error },
      folders,
      panelRows: prefs.marketPanelRows,
      lastMarketKey: prefs.lastMarketKey,
      chartView: prefs.chartView,
      chartOptions: prefs.chartOptions,
      indicators: prefs.indicators,
      cardFolds: prefs.cardFolds,
      quickOrder: prefs.quickOrder,
      smartDca: prefs.smartDca,
      smartGrid: prefs.smartGrid,
      runningBots,
      initialChart,
      drawings,
      tradeSounds,
      wallets,
    }
  })

function marketOnDashboard(
  marketKey: string | null,
  protocol: ProtocolId,
  network: NetworkId
): string | null {
  if (!marketKey) return null
  const ref = parseMarketKey(marketKey)
  return ref?.protocol === protocol && ref.network === network
    ? marketKey
    : null
}

export function loadDashboardBootstrap(
  protocol: ProtocolId,
  network: NetworkId
): Promise<DashboardBootstrap> {
  return loadDashboardBootstrapFn({ data: { protocol, network } })
}
