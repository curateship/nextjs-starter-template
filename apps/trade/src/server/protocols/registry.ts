import type {
  CandleBar,
  CandleInterval,
  MarketCatalog,
  NetworkId,
  ProtocolCapabilities,
  ProtocolId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"
import { fetchHyperliquidAccount } from "@/server/protocols/hyperliquid/account"
import { fetchHyperliquidCandles } from "@/server/protocols/hyperliquid/candles"
import { fetchHyperliquidMarkets } from "@/server/protocols/hyperliquid/markets"

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
      interval: CandleInterval
    ): Promise<CandleBar[]>
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
