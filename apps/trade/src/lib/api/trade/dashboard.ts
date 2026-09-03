import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  parseMarketKey,
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
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"
import type { PriceAlert } from "@/lib/trade/price-alerts"
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
  TradeSoundSettings,
} from "@/lib/trade/trade-sounds"
import type { TradeWallet, WalletAccountSummary } from "@/lib/trade/wallets"
import { userGet } from "@/server/guards"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { getProtocol } from "@/server/protocols/registry"
import { maybeCleanTradeCaches } from "@/server/trade/cache-cleanup"
import { loadProtocolCandles } from "@/server/trade/candles"
import { loadChartDrawings } from "@/server/trade/drawings"
import { loadMarketFolders } from "@/server/trade/market-folders"
import { tradeSoundEventsAfter } from "@/server/trade/notice-links"
import { loadArmedPriceAlerts } from "@/server/trade/price-alerts"
import { loadDashboardPrefs, loadLastWalletIds } from "@/server/trade/prefs"
import { listRunningBots } from "@/server/trade/running-bots"
import { loadWalletSummaries } from "@/server/trade/wallets"

import { getCandlesErrorMessage } from "./candles"
import { getMarketsErrorMessage } from "./markets"

/**
 * Everything a dashboard needs before it can paint, in TWO server calls that
 * leave together.
 *
 * The first, `loadDashboardCore`, is database reads only — preferences,
 * folders, bots, drawings, price alerts and the sound cursor. The route loader
 * awaits it, so the document goes out as soon as the database answers and the
 * page paints in its saved arrangement.
 *
 * The second, `loadDashboardExchange`, is everything that has to ask the
 * exchange over the internet — the market catalogue, the first chart slice,
 * and the per-wallet account figures. The loader starts it but does not wait:
 * its answer streams into the already-painted page. Before this split the
 * document's first byte waited on the slowest exchange answer, so a fresh
 * open was a blank tab until Hyperliquid had answered everything.
 *
 * Both calls read the one preference row; that duplicate read is the price of
 * letting the exchange half start without waiting for the core half.
 *
 * The single-purpose loaders in `markets.ts`, `chart-view.ts` and the rest
 * still exist for the screens that want one thing on its own.
 */
export type DashboardCore = {
  folders: MarketFolder[]
  /** Where the two rows that are not folders sit in the markets panel. */
  panelRows: MarketPanelRows
  lastMarketKey: string | null
  chartView: ChartView | null
  chartOptions: ChartOptions
  indicators: IndicatorSettings
  cardFolds: CardFolds
  quickOrder: QuickOrderPrefs
  panelLayouts: TradePanelLayouts
  /**
   * The smart-order windows' saved settings, carried with the page so the
   * first right-click after a load opens on them with nothing to fetch.
   */
  smartDca: DcaParams | null
  smartGrid: GridParams | null
  /** The Bots tab's first answer, carried with the rest of the dashboard. */
  runningBots: { rows: RunningBot[]; error: string | null }
  /** The remembered market's saved lines, read without another session check. */
  drawings: {
    marketKey: string | null
    rows: Drawing[]
    error: string | null
  }
  /** Every armed line, shared by the panel and whichever chart is open. */
  priceAlerts: { rows: PriceAlert[]; error: string | null }
  /** The account switches and opening cursor for trade sounds. */
  tradeSounds: {
    settings: TradeSoundSettings
    events: TradeSoundEvent[]
    cursor: TradeSoundCursor
    error: string | null
  }
  /** The wallet the account panel last had active on each exchange. */
  lastWalletIds: Record<string, string>
}

/** The exchange-facing half, streamed into the page after it has painted. */
export type DashboardExchange = {
  markets: { catalogs: FilteredMarketCatalog[]; error: string | null }
  /** The remembered market's first paint; deeper history still follows. */
  initialChart: {
    key: string
    interval: CandleInterval
    candles: CandleBar[]
    error: string | null
  } | null
  /** The account panel's first answer; its 15-second refresh remains. */
  wallets: {
    rows: TradeWallet[]
    summaries: WalletAccountSummary[]
    error: string | null
  }
}

/**
 * What the workspace is handed once the page has put the two halves
 * together. `pending: true` means the exchange half has not landed yet; each
 * surface shows a loading state instead of claiming an empty answer.
 */
export type DashboardBootstrap = Omit<DashboardCore, "lastWalletIds"> & {
  markets: { catalogs: FilteredMarketCatalog[]; error: string | null }
  initialChart: {
    key: string
    interval: CandleInterval
    candles: CandleBar[]
    error: string | null
    pending: boolean
  } | null
  wallets: {
    rows: TradeWallet[]
    summaries: WalletAccountSummary[]
    lastWalletIds: Record<string, string>
    error: string | null
    pending: boolean
  }
}

const bootstrapSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
})

/**
 * A network the exchange does not run is refused, not answered with an empty
 * list that reads as "no markets today".
 */
function requireNetwork(protocol: ProtocolId, network: NetworkId) {
  if (!getProtocol(protocol).networks.includes(network)) {
    throw new Error(`PROTOCOL_NO_NETWORK:${protocol}:${network}`)
  }
}

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

const loadDashboardCoreFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(bootstrapSchema)
  .handler(async ({ data, context }): Promise<DashboardCore> => {
    requireNetwork(data.protocol, data.network)
    const openedAt = Date.now()
    const soundCursor: TradeSoundCursor = { afterAt: openedAt, afterId: "" }
    // The daily cache sweep still rides a real dashboard open, but it no
    // longer delays one: it is started and left to finish on its own. It
    // catches and logs its own failures, so a failed sweep is a logged
    // error, never a failed page.
    void maybeCleanTradeCaches()
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
    const [
      prefs,
      folders,
      runningBots,
      drawings,
      priceAlerts,
      tradeSounds,
      lastWalletIds,
    ] = await Promise.all([
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
      loadArmedPriceAlerts(context.user.id).then(
        (rows) => ({ rows, error: null as string | null }),
        () => ({
          rows: [] as PriceAlert[],
          error: "Your price alerts could not be loaded.",
        })
      ),
      Promise.all([
        prefsPromise,
        tradeSoundEventsAfter(context.user.id, soundCursor),
      ]).then(
        ([soundPrefs, soundEvents]) => ({
          settings: {
            fillsAndStops: soundPrefs.tradeSoundsEnabled,
            alerts: soundPrefs.tradeAlertSoundsEnabled,
          },
          ...soundEvents,
          error: null as string | null,
        }),
        () => ({
          settings: { fillsAndStops: false, alerts: false },
          events: [] as TradeSoundEvent[],
          cursor: soundCursor,
          error: "Trade sounds could not be read.",
        })
      ),
      // Losing the remembered wallet choice only costs the memory.
      loadLastWalletIds(context.user.id).catch(
        () => ({}) as Record<string, string>
      ),
    ])
    return {
      folders,
      panelRows: prefs.marketPanelRows,
      lastMarketKey: prefs.lastMarketKey,
      chartView: prefs.chartView,
      chartOptions: prefs.chartOptions,
      indicators: prefs.indicators,
      cardFolds: prefs.cardFolds,
      quickOrder: prefs.quickOrder,
      panelLayouts: prefs.panelLayouts,
      smartDca: prefs.smartDca,
      smartGrid: prefs.smartGrid,
      runningBots,
      drawings,
      priceAlerts,
      tradeSounds,
      lastWalletIds,
    }
  })

const loadDashboardExchangeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(bootstrapSchema)
  .handler(async ({ data, context }): Promise<DashboardExchange> => {
    requireNetwork(data.protocol, data.network)
    // Read again rather than passed in from the browser: the remembered
    // market and the volume cutoff stay the server's own saved row, and the
    // catalogue and wallet reads below do not wait for it.
    const prefsPromise = loadDashboardPrefs(context.user.id, data)
    const [catalog, prefs, initialChart, wallets] = await Promise.all([
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
      prefsPromise.then(async (prefs) => {
        const marketKey = marketOnDashboard(
          prefs.lastMarketKey,
          data.protocol,
          data.network
        )
        if (!marketKey) return null
        const interval = DEFAULT_CHART_INTERVAL
        return loadProtocolCandles(marketKey, interval).then(
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
      }),
      loadWalletSummaries(context.user.id, data.protocol).then(
        (answer) => ({
          rows: answer.wallets,
          summaries: answer.summaries,
          error: null as string | null,
        }),
        () => ({
          rows: [] as TradeWallet[],
          summaries: [] as WalletAccountSummary[],
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
      initialChart,
      wallets,
    }
  })

export function loadDashboardCore(
  protocol: ProtocolId,
  network: NetworkId
): Promise<DashboardCore> {
  return loadDashboardCoreFn({ data: { protocol, network } })
}

export function loadDashboardExchange(
  protocol: ProtocolId,
  network: NetworkId
): Promise<DashboardExchange> {
  return loadDashboardExchangeFn({ data: { protocol, network } })
}
