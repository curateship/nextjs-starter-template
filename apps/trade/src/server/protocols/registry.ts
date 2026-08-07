import type {
  CandleBar,
  CandleInterval,
  MarketCatalog,
  NetworkId,
  ProtocolCapabilities,
  ProtocolId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"
import { roundOrderPx } from "@/lib/protocols/hyperliquid/translate"
import { fetchHyperliquidAccount } from "@/server/protocols/hyperliquid/account"
import { fetchHyperliquidCandles } from "@/server/protocols/hyperliquid/candles"
import { fetchHyperliquidMarkets } from "@/server/protocols/hyperliquid/markets"
import { fetchHyperliquidPrices } from "@/server/protocols/hyperliquid/prices"

/**
 * The lookup between "a protocol id" and "the module that speaks it".
 *
 * Shared code hands in an id and gets adapters back; it never asks *which*
 * protocol it holds, and `fence.test.ts` fails anything outside a protocol's
 * own folder that tries. Adding an exchange is one new folder and one entry
 * here — that line is what "plug-in work" means, so it stays true.
 */

export type ProtocolEntry = {
  id: ProtocolId
  label: string
  /** Which network a screen should show when nothing has chosen one. */
  defaultNetwork: NetworkId
  capabilities: ProtocolCapabilities
  markets: {
    fetch(network: NetworkId): Promise<MarketCatalog>
    candles(
      network: NetworkId,
      marketId: string,
      interval: CandleInterval,
      /** Epoch ms to read from, instead of the recent slice a chart draws. */
      since?: number
    ): Promise<CandleBar[]>
    /**
     * Today's price for these markets and nothing else — the cheap read the
     * practice engine settles against, where `fetch` is the whole catalogue.
     * A market the exchange would not price is left out of the answer rather
     * than given a made-up one.
     */
    prices(
      network: NetworkId,
      marketIds: readonly string[]
    ): Promise<Map<string, number>>
    /**
     * The nearest price this exchange would accept for an order. Every
     * protocol has its own rule about how fine a price may be; asking here is
     * how the engine stays blind to which one it is talking to.
     */
    roundPx(px: number, sizeDecimals: number | null): number
  }
  account: {
    /** What the account at this public address holds and is worth. */
    fetch(network: NetworkId, address: string): Promise<WalletAccountFigures>
  }
}

const PROTOCOLS: Record<ProtocolId, ProtocolEntry> = {
  hyperliquid: {
    id: "hyperliquid",
    label: "Hyperliquid",
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: true },
    markets: {
      fetch: fetchHyperliquidMarkets,
      candles: fetchHyperliquidCandles,
      prices: fetchHyperliquidPrices,
      roundPx: roundOrderPx,
    },
    account: {
      fetch: fetchHyperliquidAccount,
    },
  },
}

export function getProtocol(id: ProtocolId): ProtocolEntry {
  return PROTOCOLS[id]
}

/** Every protocol this build ships, for screens that show one list per protocol. */
export function listProtocols(): ProtocolEntry[] {
  return Object.values(PROTOCOLS)
}
