import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey } from "@/lib/protocols/contracts"
import { listDukascopyInstruments } from "@/lib/protocols/dukascopy/instruments"
import {
  dukascopyCategory,
  dukascopySymbol,
} from "@/lib/protocols/dukascopy/naming"
import { candleIntervalMs } from "@/lib/protocols/timing"

/**
 * Dukascopy as a protocol: markets and candles, nothing else.
 *
 * Dukascopy is a Swiss bank that publishes years of price history for stocks,
 * indices, metals and currency pairs as public files, no key needed. It is
 * registered like Binance, with accounts and orders switched off, because the
 * candle store reaches every source through the registry and a source that
 * lived outside it would be a second way to ask for one thing.
 *
 * Its market list is the instruments this app can map a venue market onto:
 * every US stock and the aliased metals, energy, indices and pairs. It carries
 * no live price or volume, because Dukascopy publishes finished bars and this
 * app never trades on it. A row's figures are zero, not guessed.
 *
 * Tyler, 2 Sep 2026: "Dukascopy is for the stocks, Binance is for cryptos."
 */

function requireMainnet(network: NetworkId): void {
  if (network !== "mainnet") throw new Error("DUKASCOPY_NETWORK_UNSUPPORTED")
}

let catalog: MarketCatalog | null = null

/** Every instrument the app maps to, from the generated table. */
export async function fetchDukascopyMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  requireMainnet(network)
  if (catalog) return catalog

  const rows: MarketRow[] = listDukascopyInstruments().map((instrument) => ({
    key: marketKey({ protocol: "dukascopy", network, marketId: instrument.id }),
    marketId: instrument.id,
    symbol: dukascopySymbol(instrument.id),
    quoteAsset: "USD",
    subExchange: null,
    category: dukascopyCategory(instrument.id),
    // Nothing trades here, so no size step, tick or minimum applies. Null
    // says "not stated"; a number would be one a screen could size an order
    // from.
    sizeDecimals: null,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price: 0,
    change24h: null,
    volume24hUsd: 0,
    fundingHourly: null,
    openInterestUsd: null,
  }))

  catalog = {
    protocol: "dukascopy",
    protocolLabel: "Dukascopy",
    network,
    networkLabel: "Mainnet",
    picker: {
      categories: "full",
      hip3: false,
      funding: false,
      openInterest: false,
    },
    rows,
  }
  return catalog
}

export function dukascopyIntervalMs(
  interval: Parameters<typeof candleIntervalMs>[0]
): number {
  return candleIntervalMs(interval)
}

/**
 * Dukascopy publishes no live price, so the answer is always empty. The
 * practice engine only settles markets somebody trades, and nobody trades
 * here; an empty map is "not asked", which is the honest one.
 */
export async function fetchDukascopyPrices(
  network: NetworkId
): Promise<Map<string, number>> {
  requireMainnet(network)
  return new Map()
}

/** No order is ever placed here, so no price is ever rounded for one. */
export function roundDukascopyPx(px: number): number {
  return px
}
