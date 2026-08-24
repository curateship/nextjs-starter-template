import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
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
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import type {
  MarketFolder,
  MarketPanelRows,
} from "@/lib/trade/market-folders"
import { userGet } from "@/server/guards"
import { getProtocol } from "@/server/protocols/registry"
import { loadMarketFolders } from "@/server/trade/market-folders"
import { loadDashboardPrefs } from "@/server/trade/prefs"

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
    const [catalog, prefs, folders] = await Promise.all([
      // A dead exchange must not take the page down with it: the workspace
      // still opens, and the list explains itself and offers a retry.
      protocol.markets.fetch(data.network).then(
        (value) => ({ catalog: value, error: null as string | null }),
        (error: unknown) => ({
          catalog: null,
          error: getMarketsErrorMessage(error),
        })
      ),
      loadDashboardPrefs(context.user.id, data),
      // Losing folders must not keep the rest of the dashboard from opening.
      loadMarketFolders(context.user.id, data.protocol, data.network).catch(
        () => [] as MarketFolder[]
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
    }
  })

export function loadDashboardBootstrap(
  protocol: ProtocolId,
  network: NetworkId
): Promise<DashboardBootstrap> {
  return loadDashboardBootstrapFn({ data: { protocol, network } })
}
