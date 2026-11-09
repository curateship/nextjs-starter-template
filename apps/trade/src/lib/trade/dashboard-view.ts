import {
  DASHBOARD_PROTOCOLS,
  dashboardHasPractice,
  hasDashboard,
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { resolveTradeNetwork } from "@/lib/trade/trade-network"

/**
 * What the Trade dashboard at `/trade` shows (Tyler, 8 Nov 2026: "consolidate
 * everything into one 3 panel dashboard"). The left page's Protocols block
 * picks it: Overview, its first row, fills the middle with widgets, and an
 * exchange's row shows that exchange's chart and tables.
 *
 * The address says what is picked:
 *
 * - `?view=overview` is Overview.
 * - `?view=<id>` is an exchange, on the market it was last on.
 * - `?market=<key>` is that market, on its own exchange: a market key names
 *   its exchange, so it wins over `view`.
 * - `?network=testnet` opens an exchange's practice network, on one that has
 *   one, the same door `resolveTradeNetwork` describes.
 * - A bare `/trade` opens on the row picked last, saved on the account, and
 *   on Overview the first time ("Last one you had").
 */

/** Overview, the widgets, as the address names it. */
export const OVERVIEW_VIEW = "overview"

export type DashboardView = typeof OVERVIEW_VIEW | ProtocolId

export type TradeDashboardSearch = {
  view?: DashboardView
  market?: string
  network?: "testnet" | "mainnet"
}

export function isDashboardView(value: unknown): value is DashboardView {
  return value === OVERVIEW_VIEW || (typeof value === "string" && hasDashboard(value))
}

/** The address's search params, each checked and dropped when it is not usable. */
export function readTradeDashboardSearch(search: Record<string, unknown>): TradeDashboardSearch {
  return {
    view: isDashboardView(search.view) ? search.view : undefined,
    market: typeof search.market === "string" && search.market.length <= 120 ? search.market : undefined,
    network: search.network === "testnet" ? "testnet" : search.network === "mainnet" ? "mainnet" : undefined,
  }
}

/** The exchange a market key in the address names, when it has a dashboard. */
export function marketProtocol(market: string | undefined): ProtocolId | null {
  const protocol = market ? parseMarketKey(market)?.protocol : undefined
  return protocol && hasDashboard(protocol) ? protocol : null
}

/**
 * The row the address picks, or null for a bare `/trade`, which opens on the
 * row saved last. A market picks its own exchange.
 */
export function viewFromSearch(search: TradeDashboardSearch): DashboardView | null {
  return marketProtocol(search.market) ?? search.view ?? null
}

/**
 * Which network an exchange's chart is on: the market's own, then the
 * address's choice, then mainnet, and always mainnet on an exchange with no
 * practice network.
 */
export function dashboardNetwork(protocol: ProtocolId, search: TradeDashboardSearch): NetworkId {
  if (!dashboardHasPractice(protocol)) return "mainnet"
  const market = marketProtocol(search.market) === protocol ? search.market : undefined
  return resolveTradeNetwork(market, search.network)
}

/** The exchange the dashboard falls back to with nothing saved: the Protocols block's first. */
export const FIRST_DASHBOARD_PROTOCOL: ProtocolId = DASHBOARD_PROTOCOLS[0]

/**
 * The exchanges the Protocols block lists: every one, in order, less those
 * hidden in the left page's ⋮ (Tyler, 8 Nov 2026: "Pick in the ⋮"). The
 * exchange on screen always stays, so hiding it never leaves the page
 * showing a row that is not there.
 */
export function shownProtocols(hidden: readonly ProtocolId[], showing: ProtocolId | null): ProtocolId[] {
  return DASHBOARD_PROTOCOLS.filter((id) => id === showing || !hidden.includes(id))
}

/** A stored list of hidden exchanges, cleaned: known ids only, once each, in the block's order. */
export function readHiddenProtocols(value: unknown): ProtocolId[] {
  if (!Array.isArray(value)) return []
  return DASHBOARD_PROTOCOLS.filter((id) => value.includes(id))
}
