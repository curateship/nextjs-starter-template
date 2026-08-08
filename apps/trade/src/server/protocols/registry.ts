import type {
  CandleBar,
  CandleInterval,
  MarketCatalog,
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  ProtocolCapabilities,
  ProtocolId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { roundOrderPx } from "@/lib/protocols/hyperliquid/translate"
import { fetchHyperliquidAccount } from "@/server/protocols/hyperliquid/account"
import { verifyHyperliquidAgentKey } from "@/server/protocols/hyperliquid/agent"
import { fetchHyperliquidCandles } from "@/server/protocols/hyperliquid/candles"
import { fetchHyperliquidMarkets } from "@/server/protocols/hyperliquid/markets"
import {
  cancelHyperliquidOrder,
  closeHyperliquidPosition,
  fetchHyperliquidPortfolio,
  placeHyperliquidOrder,
  setHyperliquidBrackets,
} from "@/server/protocols/hyperliquid/orders"
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
  agent: {
    /**
     * Proves a pasted trading key before it is stored: refuses the account's
     * own key outright, and asks the exchange whether this key is really
     * approved to trade for that account. Answers the approval's expiry.
     */
    verify(
      network: NetworkId,
      accountAddress: string,
      agentKey: string
    ): Promise<{ validUntil: number | null }>
  }
  orders: {
    /** Signs and places one real order, with optional protection legs. */
    place(
      network: NetworkId,
      auth: OrderAuth,
      params: PlaceOrderParams
    ): Promise<PlaceOrderOutcome>
    /** Cancels one resting real order. */
    cancel(
      network: NetworkId,
      auth: OrderAuth,
      params: { marketId: string; orderId: string }
    ): Promise<void>
    /** Closes a real position at a capped market price. */
    close(
      network: NetworkId,
      auth: OrderAuth,
      params: { marketId: string; szi: number }
    ): Promise<{ avgPx: number | null; filledSz: number | null }>
    /** Replaces the stop and target riding on a real position. */
    setBrackets(
      network: NetworkId,
      auth: OrderAuth,
      params: {
        marketId: string
        position: Pick<WalletPosition, "szi" | "tpOrderId" | "slOrderId">
        tpPx: number | null
        slPx: number | null
      }
    ): Promise<void>
    /** What a live wallet holds and has waiting, from the exchange itself. */
    portfolio(network: NetworkId, address: string): Promise<WalletPortfolio>
  }
}

const PROTOCOLS: Record<ProtocolId, ProtocolEntry> = {
  hyperliquid: {
    id: "hyperliquid",
    label: "Hyperliquid",
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: true, orders: true },
    markets: {
      fetch: fetchHyperliquidMarkets,
      candles: fetchHyperliquidCandles,
      prices: fetchHyperliquidPrices,
      roundPx: roundOrderPx,
    },
    account: {
      fetch: fetchHyperliquidAccount,
    },
    agent: {
      verify: verifyHyperliquidAgentKey,
    },
    orders: {
      place: placeHyperliquidOrder,
      cancel: cancelHyperliquidOrder,
      close: closeHyperliquidPosition,
      setBrackets: setHyperliquidBrackets,
      portfolio: fetchHyperliquidPortfolio,
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
