import type {
  CandleBar,
  CandleInterval,
  CredentialForm,
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
import {
  fetchHyperliquidPrices,
  pricesWereRationed as hyperliquidPricesWereRationed,
} from "@/server/protocols/hyperliquid/prices"
import {
  livePrices as readHyperliquidLivePrices,
  livePricesFresh as hyperliquidLivePricesFresh,
  openLivePrices as openHyperliquidLivePrices,
} from "@/server/protocols/hyperliquid/live-prices"
import {
  binanceFundingIntervalMs,
  fetchBinanceFunding,
} from "@/server/protocols/binance/funding"
import {
  phemexIntervalMs,
  roundPhemexPx,
} from "@/lib/protocols/phemex/translate"
import { fetchPhemexAccount } from "@/server/protocols/phemex/account"
import { verifyPhemexAgentKey } from "@/server/protocols/phemex/agent"
import {
  fetchPhemexCandleHistory,
  fetchPhemexCandles,
} from "@/server/protocols/phemex/candles"
import { packPhemexCredential } from "@/server/protocols/phemex/client"
import {
  fetchPhemexFunding,
  phemexFundingIntervalMs,
} from "@/server/protocols/phemex/funding"
import {
  closePhemexPosition,
  cancelPhemexOrder,
  fetchPhemexOrderFills,
  fetchPhemexOrderInfo,
  fetchPhemexPortfolio,
  modifyPhemexOrder,
  placePhemexOrder,
  setPhemexBrackets,
} from "@/server/protocols/phemex/orders"
import {
  fetchPhemexMarkets,
  fetchPhemexPrices,
  phemexPricesWereRationed,
} from "@/server/protocols/phemex/markets"
import {
  openPhemexLivePrices,
  phemexLivePricesFresh,
  readPhemexLivePrices,
} from "@/server/protocols/phemex/live-prices"
import { fetchKucoinAccount } from "@/server/protocols/kucoin/account"
import { verifyKucoinAgentKey } from "@/server/protocols/kucoin/agent"
import {
  fetchKucoinCandleHistory,
  fetchKucoinCandles,
} from "@/server/protocols/kucoin/candles"
import { packKucoinCredential } from "@/server/protocols/kucoin/client"
import { fetchKucoinFunding } from "@/server/protocols/kucoin/funding"
import {
  kucoinLivePricesFresh,
  openKucoinLivePrices,
  readKucoinLivePrices,
} from "@/server/protocols/kucoin/live-prices"
import { kucoinLiveTicket } from "@/server/protocols/kucoin/live-ticket"
import {
  fetchKucoinMarkets,
  fetchKucoinPrices,
  kucoinPricesWereRationed,
  roundKucoinPx,
} from "@/server/protocols/kucoin/markets"
import {
  cancelKucoinOrder,
  closeKucoinPosition,
  fetchKucoinOrderFills,
  fetchKucoinOrderInfo,
  fetchKucoinPortfolio,
  modifyKucoinOrder,
  placeKucoinOrder,
  setKucoinBrackets,
} from "@/server/protocols/kucoin/orders"
import {
  KUCOIN_DEFAULT_FUNDING_MS,
  kucoinIntervalMs,
} from "@/lib/protocols/kucoin/translate"
import { asterIntervalMs, roundAsterPx } from "@/lib/protocols/aster/translate"
import {
  fetchAsterCandleHistory,
  fetchAsterCandles,
} from "@/server/protocols/aster/candles"
import {
  asterFundingIntervalMs,
  fetchAsterFunding,
} from "@/server/protocols/aster/funding"
import {
  fetchAsterMarkets,
  fetchAsterPrices,
} from "@/server/protocols/aster/markets"

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
     * how the engine stays blind to which one it is talking to. Exchanges
     * that state a per-market tick read `priceTick`; exchanges with a rule
     * instead (Hyperliquid's five significant figures) ignore it.
     */
    roundPx(
      px: number,
      sizeDecimals: number | null,
      priceTick: number | null
    ): number
    /**
     * Whether the last `prices` answer for this market was served from a
     * stale cache because the exchange was rationing requests — the
     * difference between "this coin has no price" (permanent, worth looking
     * at) and "the exchange is busy" (clears on its own). Absent where the
     * prices layer never rations.
     */
    pricesWereRationed?(network: NetworkId, marketId: string): boolean
  }
  /**
   * The pushed-price line the trading engine reads instead of asking — one
   * websocket per network, opened on first use and shared by everything.
   * Absent on a protocol nothing trades on yet: the engine then falls back
   * to `markets.prices`, which is correct, just rationed.
   */
  livePrices?: {
    /**
     * Makes sure the line for this network is up, and carrying these markets.
     * Free once it is open and they are already on it.
     *
     * Most exchanges push every market down one feed and ignore the list.
     * KuCoin subscribes per market, so it is told which ones matter — the
     * ones the engine is actually settling, never the whole catalogue.
     */
    open(network: NetworkId, marketIds?: readonly string[]): void
    /** The pushed prices by the exchange's own market id. */
    read(network: NetworkId): { prices: ReadonlyMap<string, number> }
    /** Whether the feed is currently worth reading — data arriving, not claims. */
    fresh(network: NetworkId): boolean
  }
  /**
   * A one-use ticket for the browser's live stream, on an exchange whose
   * socket demands a token the browser cannot fetch itself (KuCoin's
   * bullet-token handshake is cross-origin). Absent where the public socket
   * is open to anyone.
   */
  liveTicket?(network: NetworkId): Promise<{
    endpoint: string
    token: string
    pingIntervalMs: number
  }>
  /** Absent where a market has no periodic position funding. */
  funding?: {
    fetch(
      network: NetworkId,
      marketId: string,
      from: number,
      to: number
    ): Promise<FundingRate[]>
    /** Regular time between funding settlements, in milliseconds. */
    intervalMs(network: NetworkId, marketId: string): number
  }
  /**
   * Absent on an exchange that cannot hold an account. `capabilities.accounts` is the flag; this is the code behind it. Optional so a markets-only exchange is a shorter entry rather than a set of stubs that throw — a stub is a door that looks open.
   */
  account?: {
    /**
     * What the account holds and is worth. `credential` hands over the
     * decrypted blob for an exchange whose accounts cannot be read without
     * it — an API-key venue. It is a function on purpose: a venue whose
     * accounts are public by address (Hyperliquid) never calls it, so the
     * plaintext never even exists on that path. A connector that calls it
     * and gets null throws `LIVE_WALLET_KEY` rather than answering with a
     * guess.
     */
    fetch(
      network: NetworkId,
      address: string,
      credential: () => string | null
    ): Promise<WalletAccountFigures>
  }
  /**
   * Absent alongside `account`, for the same reason: a trading key only means something where there is trading.
   */
  agent?: {
    /**
     * Proves a pasted credential before it is stored. On Hyperliquid:
     * refuses the account's own key outright, and asks the exchange whether
     * this key is really approved to trade for that account. On an API-key
     * exchange: one signed harmless read with the packed blob. Answers the
     * approval's expiry where the venue states one.
     */
    verify(
      network: NetworkId,
      accountAddress: string,
      agentKey: string
    ): Promise<{ validUntil: number | null }>
  }
  /**
   * How this exchange's sign-in fields are drawn and packed. Present exactly
   * where `account` is — a venue that cannot hold an account has nothing to
   * sign in to.
   */
  credentials?: {
    /** The dialog's labels, patterns and help copy, as data. */
    form: CredentialForm
    /**
     * Folds the dialog's fields into the ONE string that gets encrypted into
     * `agent_key_encrypted` and later handed back as `OrderAuth.agentKey`.
     * The format belongs to this protocol alone; a missing required field is
     * refused here with a named `KEY_…` error, before anything is stored.
     */
    pack(input: {
      /** The public identifier the dialog collected — some blobs carry it. */
      address?: string
      agentKey?: string
      secret?: string
      passphrase?: string
    }): string
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
        /** Coins the target sells; null sells the whole position. */
        tpSz: number | null
        slPx: number | null
      }
    ): Promise<void>
    /**
     * What a live wallet holds and has waiting, from the exchange itself.
     * `credential` as on `account.fetch`: needed by API-key venues, ignored
     * by venues whose accounts are public by address.
     */
    portfolio(
      network: NetworkId,
      address: string,
      credential: () => string | null
    ): Promise<WalletPortfolio>
    fills(
      network: NetworkId,
      address: string,
      since: number,
      credential: () => string | null
    ): Promise<WalletOrderFill[]>
    /**
     * What one order was, asked after it is gone — the only way to tell a
     * stop firing from an ordinary sell once the order itself has been
     * cancelled and forgotten. `marketId` rides along because some venues
     * only answer this per market (Phemex); venues that don't ignore it.
     */
    orderInfo(
      network: NetworkId,
      address: string,
      orderId: string,
      marketId: string,
      credential: () => string | null
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
      pricesWereRationed: hyperliquidPricesWereRationed,
    },
    livePrices: {
      open: openHyperliquidLivePrices,
      read: readHyperliquidLivePrices,
      fresh: hyperliquidLivePricesFresh,
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
    credentials: {
      form: {
        addressLabel: "Account address",
        addressHint: "0x…",
        addressPattern: "^0x[0-9a-fA-F]{40}$",
        secretLabel: "Trading key (agent key)",
        needsPassphrase: false,
        secretIsAgentKey: true,
        keyHelp:
          "An agent key made on the exchange's API page — approved to trade " +
          "for this account and nothing more. Never the account's own key, " +
          "which can move money out and is refused here.",
      },
      // The blob IS the agent key: one hex string, stored as-is. The shape
      // and never-your-main-key checks run in `verify` before anything is
      // stored, so pack only refuses emptiness.
      pack: (input) => {
        const agentKey = input.agentKey?.trim() ?? ""
        if (!agentKey) throw new Error("KEY_REQUIRED")
        return agentKey
      },
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
  /**
   * A full trading venue, spoken through its dollar-settled (USDT-margined)
   * perpetual API only — real decimal prices. Unlike Hyperliquid it signs
   * with an API key id and secret, and its accounts cannot be read without
   * the secret.
   *
   * Mainnet only, decided 19 Aug 2026: the practice network is not worth
   * carrying, so the order path is proven the way KuCoin's will be — reads
   * first (free), then one deliberately tiny real order behind both
   * real-money switches.
   */
  phemex: {
    id: "phemex",
    label: "Phemex",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: true, orders: true },
    markets: {
      fetch: fetchPhemexMarkets,
      candles: fetchPhemexCandles,
      history: fetchPhemexCandleHistory,
      intervalMs: phemexIntervalMs,
      prices: fetchPhemexPrices,
      roundPx: roundPhemexPx,
      pricesWereRationed: phemexPricesWereRationed,
    },
    livePrices: {
      open: openPhemexLivePrices,
      read: readPhemexLivePrices,
      fresh: phemexLivePricesFresh,
    },
    funding: {
      fetch: fetchPhemexFunding,
      intervalMs: phemexFundingIntervalMs,
    },
    account: {
      fetch: fetchPhemexAccount,
    },
    agent: {
      verify: verifyPhemexAgentKey,
    },
    credentials: {
      form: {
        addressLabel: "API key ID",
        addressHint: "The key's ID from Phemex's API Management page",
        // Phemex issues UUID-shaped ids; kept tolerant on purpose — shape,
        // not truth. The verify call is what proves the credential.
        addressPattern: "^[0-9A-Za-z-]{16,42}$",
        secretLabel: "API secret",
        needsPassphrase: false,
        secretIsAgentKey: false,
        keyHelp:
          "Made on Phemex under API Management — give it trade permission, " +
          "and copy both the ID and the secret while they are shown.",
      },
      pack: packPhemexCredential,
    },
    orders: {
      place: placePhemexOrder,
      cancel: cancelPhemexOrder,
      modify: modifyPhemexOrder,
      close: closePhemexPosition,
      setBrackets: setPhemexBrackets,
      portfolio: fetchPhemexPortfolio,
      fills: fetchPhemexOrderFills,
      orderInfo: fetchPhemexOrderInfo,
    },
  },
  /**
   * A full trading venue, dollar-settled perpetuals only, and mainnet only —
   * KuCoin shut its practice environment down in 2023, so there is nowhere to
   * rehearse and the real-money gate is the only thing standing between a
   * click and money.
   *
   * Two of its habits show up in this entry. Its accounts need three values
   * to sign rather than two, so the credential form asks for a passphrase.
   * And its socket will not open without a ticket the browser cannot fetch,
   * which is what `liveTicket` is for. Its price hub is told which markets
   * to carry for the same reason: the exchange publishes no all-markets feed,
   * so it is subscribed per market rather than to everything.
   */
  kucoin: {
    id: "kucoin",
    label: "KuCoin",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: true, orders: true },
    markets: {
      fetch: fetchKucoinMarkets,
      candles: fetchKucoinCandles,
      history: fetchKucoinCandleHistory,
      intervalMs: kucoinIntervalMs,
      prices: fetchKucoinPrices,
      roundPx: roundKucoinPx,
      pricesWereRationed: kucoinPricesWereRationed,
    },
    liveTicket: kucoinLiveTicket,
    livePrices: {
      open: openKucoinLivePrices,
      read: readKucoinLivePrices,
      fresh: kucoinLivePricesFresh,
    },
    funding: {
      fetch: fetchKucoinFunding,
      // Eight hours on every KuCoin market seen so far. The contract states
      // its own granularity and the catalogue reads it; this answer is the
      // one the shared funding store asks for without a market in hand.
      intervalMs: () => KUCOIN_DEFAULT_FUNDING_MS,
    },
    account: {
      fetch: fetchKucoinAccount,
    },
    agent: {
      verify: verifyKucoinAgentKey,
    },
    credentials: {
      form: {
        addressLabel: "API key",
        addressHint: "The key from KuCoin's API Management page",
        // KuCoin issues 24-character hex ids; kept tolerant on purpose —
        // shape, not truth. The verify call proves the credential.
        addressPattern: "^[0-9A-Za-z]{16,42}$",
        secretLabel: "API secret",
        needsPassphrase: true,
        secretIsAgentKey: false,
        keyHelp:
          "Made on KuCoin under API Management, with Futures trading " +
          "permission. Copy all three — the key, the secret and the " +
          "passphrase you chose — while they are shown. If the key is " +
          "restricted to certain addresses, this server's address must be " +
          "on that list.",
      },
      pack: packKucoinCredential,
    },
    orders: {
      place: placeKucoinOrder,
      cancel: cancelKucoinOrder,
      modify: modifyKucoinOrder,
      close: closeKucoinPosition,
      setBrackets: setKucoinBrackets,
      portfolio: fetchKucoinPortfolio,
      fills: fetchKucoinOrderFills,
      orderInfo: fetchKucoinOrderInfo,
    },
  },
  /**
   * Public Aster V3 market data on both networks. Accounts, credentials and
   * orders stay absent until their own tasks prove those private paths.
   */
  aster: {
    id: "aster",
    label: "Aster",
    networks: ["mainnet", "testnet"],
    defaultNetwork: "mainnet",
    capabilities: { markets: true, accounts: false, orders: false },
    markets: {
      fetch: fetchAsterMarkets,
      candles: fetchAsterCandles,
      history: fetchAsterCandleHistory,
      intervalMs: asterIntervalMs,
      prices: fetchAsterPrices,
      roundPx: roundAsterPx,
    },
    funding: {
      fetch: fetchAsterFunding,
      intervalMs: asterFundingIntervalMs,
    },
  },
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

/** The sign-in form and blob packer for an exchange that holds accounts. */
export function credentialsOf(protocol: ProtocolEntry) {
  if (!protocol.credentials) {
    throw new Error(`PROTOCOL_NO_CREDENTIALS:${protocol.id}`)
  }
  return protocol.credentials
}
