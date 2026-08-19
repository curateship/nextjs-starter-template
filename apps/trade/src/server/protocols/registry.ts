import type {
  CandleBar,
  CandleInterval,
  FundingRate,
  MarketCatalog,
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  ProtocolCapabilities,
  ProtocolId,
  WalletAccountFigures,
  WalletOrderFill,
  WalletOrderInfo,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { roundOrderPx } from "@/lib/protocols/hyperliquid/translate"
import { fetchHyperliquidAccount } from "@/server/protocols/hyperliquid/account"
import { verifyHyperliquidAgentKey } from "@/server/protocols/hyperliquid/agent"
import {
  candleIntervalMs,
  fetchHyperliquidCandleHistory,
  fetchHyperliquidCandles,
} from "@/server/protocols/hyperliquid/candles"
import { fetchHyperliquidMarkets } from "@/server/protocols/hyperliquid/markets"
import { fetchHyperliquidFunding } from "@/server/protocols/hyperliquid/funding"
import {
  cancelHyperliquidOrder,
  closeHyperliquidPosition,
  fetchHyperliquidOrderFills,
  fetchHyperliquidOrderInfo,
  fetchHyperliquidPortfolio,
  placeHyperliquidOrder,
  setHyperliquidBrackets,
  modifyHyperliquidOrder,
} from "@/server/protocols/hyperliquid/orders"
import { fetchHyperliquidPrices } from "@/server/protocols/hyperliquid/prices"
import {
  binanceFundingIntervalMs,
  fetchBinanceFunding,
} from "@/server/protocols/binance/funding"

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
  /** Networks this adapter can truthfully serve. */
  networks: readonly NetworkId[]
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
    /** One finished historical window, with `to` treated as exclusive. */
    history(
      network: NetworkId,
      marketId: string,
      interval: CandleInterval,
      from: number,
      to: number
    ): Promise<CandleBar[]>
    /** How long one bar of a timeframe lasts, in milliseconds. */
    intervalMs(interval: CandleInterval): number
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
  /** Absent where a market has no periodic position funding. */
  funding?: {
    fetch(
      network: NetworkId,
      marketId: string,
      from: number,
      to: number
    ): Promise<FundingRate[]>
    /** Regular time between funding settlements, in milliseconds. */
    intervalMs(marketId: string): number
  }
  /**
   * Absent on an exchange that cannot hold an account. `capabilities.accounts` is the flag; this is the code behind it. Optional so a markets-only exchange is a shorter entry rather than a set of stubs that throw — a stub is a door that looks open.
   */
  account?: {
    /** What the account at this public address holds and is worth. */
    fetch(network: NetworkId, address: string): Promise<WalletAccountFigures>
  }
  /**
   * Absent alongside `account`, for the same reason: a trading key only means something where there is trading.
   */
  agent?: {
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
  /**
   * Absent on an exchange that cannot place one. See `account` above.
   */
  orders?: {
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
    /** Moves one resting real order to a new price, keeping its size and side. */
    modify(
      network: NetworkId,
      auth: OrderAuth,
      params: {
        marketId: string
        orderId: string
        side: "buy" | "sell"
        px: number
        sz: number
        reduceOnly: boolean
      }
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
    fills(
      network: NetworkId,
      address: string,
      since: number
    ): Promise<WalletOrderFill[]>
    /**
     * What one order was, asked after it is gone — the only way to tell a
     * stop firing from an ordinary sell once the order itself has been
     * cancelled and forgotten.
     */
    orderInfo(
      network: NetworkId,
      address: string,
      orderId: string
    ): Promise<WalletOrderInfo>
  }
}

import {
  fetchBinanceCandleHistory,
  binanceIntervalMs,
  fetchBinanceCandles,
  fetchBinanceMarkets,
  fetchBinancePrices,
  roundBinancePx,
} from "@/server/protocols/binance/markets"

const PROTOCOLS: Record<ProtocolId, ProtocolEntry> = {
  hyperliquid: {
    id: "hyperliquid",
    label: "Hyperliquid",
    networks: ["mainnet", "testnet"],
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: true, orders: true },
    markets: {
      fetch: fetchHyperliquidMarkets,
      candles: fetchHyperliquidCandles,
      history: fetchHyperliquidCandleHistory,
      intervalMs: candleIntervalMs,
      prices: fetchHyperliquidPrices,
      roundPx: roundOrderPx,
    },
    funding: {
      fetch: fetchHyperliquidFunding,
      intervalMs: () => 3_600_000,
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
      modify: modifyHyperliquidOrder,
      close: closeHyperliquidPosition,
      setBrackets: setHyperliquidBrackets,
      portfolio: fetchHyperliquidPortfolio,
      fills: fetchHyperliquidOrderFills,
      orderInfo: fetchHyperliquidOrderInfo,
    },
  },
  /**
   * Prices and markets, no trading — yet.
   *
   * Binance is an exchange this app intends to trade on, so it is registered
   * as one from the start rather than kept as the backtest's private history
   * source. Switching trading on later means filling in `account` and `orders`
   * and flipping the two flags; nothing else moves, because no screen ever
   * asks which exchange it is holding — they read these capabilities.
   *
   * Those blocks are absent rather than stubbed with throwing functions. A
   * stub is a door that looks open: the flag says the door is not there, and
   * anything that ignored the flag should fail loudly at the missing block
   * rather than quietly at a thrown error deep in a settle.
   */
  binance: {
    id: "binance",
    label: "Binance",
    // Mainnet only. Binance runs a testnet, but it is not what this app's
    // practice wallets pretend against.
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: false, orders: false },
    markets: {
      fetch: fetchBinanceMarkets,
      candles: fetchBinanceCandles,
      history: fetchBinanceCandleHistory,
      intervalMs: binanceIntervalMs,
      prices: fetchBinancePrices,
      roundPx: roundBinancePx,
    },
    funding: {
      fetch: fetchBinanceFunding,
      intervalMs: binanceFundingIntervalMs,
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

/**
 * The owner of the current Trade dashboard.
 *
 * Other protocols keep their own dashboards instead of being folded into
 * this market list. Keeping that decision inside the registry also preserves
 * the rule that screens never compare protocol ids themselves.
 */
export function tradeDashboardProtocol(): ProtocolEntry {
  return PROTOCOLS.hyperliquid
}

/**
 * The trading side of an exchange that has one, or a refusal naming it.
 *
 * Not every exchange here can trade — Binance is listed for its markets and
 * its years of candles, and has no orders until somebody builds them. Rather
 * than let every call site guard, or worse leave the blocks as stubs that
 * throw from somewhere deep inside a settle, asking for them goes through
 * here and fails at the door with the exchange's name in the message.
 *
 * A caller reaching this is a bug, not a user's mistake: screens read
 * `capabilities` and never offer to trade a market that cannot be traded.
 */
export function ordersOf(protocol: ProtocolEntry) {
  if (!protocol.orders) {
    throw new Error(`PROTOCOL_NO_ORDERS:${protocol.id}`)
  }
  return protocol.orders
}

/** The funding feed for an exchange that has one, or a clear refusal. */
export function fundingOf(protocol: ProtocolEntry) {
  if (!protocol.funding) {
    throw new Error(`PROTOCOL_NO_FUNDING:${protocol.id}`)
  }
  return protocol.funding
}

export function accountOf(protocol: ProtocolEntry) {
  if (!protocol.account) {
    throw new Error(`PROTOCOL_NO_ACCOUNTS:${protocol.id}`)
  }
  return protocol.account
}

export function agentOf(protocol: ProtocolEntry) {
  if (!protocol.agent) {
    throw new Error(`PROTOCOL_NO_AGENT:${protocol.id}`)
  }
  return protocol.agent
}
