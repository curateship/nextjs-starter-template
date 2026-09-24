import type {
  CandleBar,
  MarketCatalog,
  NetworkId,
} from "@/lib/protocols/contracts"

/**
 * Robinhood Chain lists no markets yet, and says so with an empty list.
 *
 * The stock tokens and coins arrive with the markets task. Until then the
 * dashboard opens, a wallet can be added, and nothing can be bought, because
 * there is nothing to pick. An empty list is the truth; an error would say
 * the chain failed when it did not.
 */
export async function fetchRobinhoodMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  return {
    protocol: "robinhood",
    protocolLabel: "Robinhood Chain",
    network,
    networkLabel: "Mainnet",
    picker: {
      categories: "catalog",
      hip3: false,
      funding: false,
      openInterest: false,
    },
    rows: [],
  }
}

export async function robinhoodHasNoCandles(): Promise<CandleBar[]> {
  return []
}

export async function robinhoodHasNoPrices(): Promise<Map<string, number>> {
  return new Map()
}
