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
  adjustHyperliquidMargin,
  setHyperliquidLeverage,
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
  adjustPhemexMargin,
  setPhemexLeverage,
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
  adjustKucoinMargin,
  setKucoinLeverage,
  setKucoinBrackets,
} from "@/server/protocols/kucoin/orders"
import {
  KUCOIN_DEFAULT_FUNDING_MS,
  kucoinIntervalMs,
} from "@/lib/protocols/kucoin/translate"
import { asterIntervalMs, roundAsterPx } from "@/lib/protocols/aster/translate"
import {
  fetchAsterAccount,
  fetchAsterPortfolio,
} from "@/server/protocols/aster/account"
import { verifyAsterAgentKey } from "@/server/protocols/aster/agent"
import { packAsterCredential } from "@/server/protocols/aster/client"
import {
  asterLivePricesFresh,
  openAsterLivePrices,
  readAsterLivePrices,
} from "@/server/protocols/aster/live-prices"
import {
  ASTER_HISTORY_BATCH_BARS,
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
  asterPricesWereRationed,
} from "@/server/protocols/aster/markets"
import {
  cancelAsterOrder,
  closeAsterPosition,
  fetchAsterOrderFills,
  fetchAsterOrderInfo,
  fetchAsterOrderPortfolio,
  modifyAsterOrder,
  placeAsterOrder,
  adjustAsterMargin,
  setAsterBrackets,
  setAsterLeverage,
} from "@/server/protocols/aster/orders"
import {
  asterFillsNeedRecovery,
  watchAsterFills,
} from "@/server/protocols/aster/user-stream"
import {
  LIGHTER_HISTORY_BATCH_BARS,
  fetchLighterCandleHistory,
  fetchLighterCandles,
} from "@/server/protocols/lighter/candles"
import {
  fetchLighterFunding,
  lighterFundingIntervalMs,
} from "@/server/protocols/lighter/funding"
import {
  fetchLighterMarkets,
  fetchLighterPrices,
  lighterPricesWereRationed,
} from "@/server/protocols/lighter/markets"
import {
  lighterLivePricesFresh,
  openLighterLivePrices,
  readLighterLivePrices,
} from "@/server/protocols/lighter/live-prices"
import {
  lighterIntervalMs,
  roundLighterPx,
} from "@/lib/protocols/lighter/translate"
import {
  fetchLighterAccount,
  fetchLighterPortfolio,
} from "@/server/protocols/lighter/account"
import { verifyLighterAgentKey } from "@/server/protocols/lighter/agent"
import { packLighterCredential } from "@/server/protocols/lighter/client"

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
    /**
     * Bars the candle store hands this adapter at once. The adapter may split
     * the range into its own exchange-sized pages and run them together.
     */
    historyBatchBars?: number
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
    /**
     * True when this exchange states what each individual sale made, at the
     * moment that sale happens.
     *
     * **False is not a smaller version of true, it is a different meaning for
     * the same zero.** On a venue that only pays out a figure when a whole
     * position closes, every partial sale before that reports zero money, and
     * that zero means "not stated yet" rather than "made nothing". Counting
     * those zeros as real would report a day's trading as flat.
     *
     * The Dashboard's settled-money sum reads this instead of asking which
     * exchange it is holding, which is the whole point of the fence: the fact
     * lives once, on the exchange it is true of.
     */
    profitPerSale: boolean
    /** Read-only positions while an exchange's order path is still closed. */
    portfolio?(
      network: NetworkId,
      address: string,
      credential: () => string | null
    ): Promise<WalletPortfolio>
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
    ): Promise<{
      validUntil: number | null
      /** Account-wide direction setting where the exchange exposes one. */
      positionMode?: "one-way" | "two-sided" | null
    }>
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
      params: {
        marketId: string
        szi: number
        priceTick?: number | null
        priceMultiplierUp?: number | null
        priceMultiplierDown?: number | null
      }
    ): Promise<{ avgPx: number | null; filledSz: number | null }>
    /**
     * Changes the leverage on a position that is already open.
     *
     * Optional, and `capabilities.changeLeverage` is the flag the screens
     * read. Present only where the venue really allows it, so the button is
     * hidden rather than offered and refused — a stub that throws is a door
     * that looks open.
     */
    setLeverage?(
      network: NetworkId,
      auth: OrderAuth,
      params: { marketId: string; leverage: number; szi: number }
    ): Promise<void>
    /**
     * Adds or takes back the cash behind one isolated position. `dollars` is
     * signed: negative takes margin out. Optional, like `setLeverage`.
     */
    adjustMargin?(
      network: NetworkId,
      auth: OrderAuth,
      params: { marketId: string; szi: number; dollars: number }
    ): Promise<void>
    /**
     * Replaces the stop and target riding on a real position.
     *
     * `slSz` null means the stop closes the whole position, however big the
     * position is when it fires — the only stop most positions ever carry. A
     * number is a fixed-size stop that sells exactly that many coins, the way
     * a target with a size does, so a second strategy's coins on the same
     * position survive it. The app layer has already checked the size against
     * what is held; a venue that cannot place a fixed-size stop throws
     * `LIVE_SIZED_STOP_UNSUPPORTED` rather than placing something that would
     * close more than it promised.
     *
     * Answers with the new stop's own order id when the venue names one, so a
     * caller that owns its stop — a grid running above a ladder — can cancel
     * or move that one order later without touching anything else.
     */
    setBrackets(
      network: NetworkId,
      auth: OrderAuth,
      params: {
        marketId: string
        position: Pick<WalletPosition, "szi" | "protectionOrderIds">
        targets: Array<{ px: number; sz: number | null }>
        slPx: number | null
        slSz: number | null
      }
    ): Promise<{ slOrderId: string | null }>
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
    /** Opens the venue's private fill stream and keeps this listener current. */
    watchFills?(
      network: NetworkId,
      address: string,
      listenerId: string,
      credential: () => string | null,
      onFill: (fill: WalletOrderFill) => void
    ): void
    /** True once a pushed feed is up and needs one gap-closing REST read. */
    fillsNeedRecovery?(network: NetworkId, address: string): boolean
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
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
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
      profitPerSale: true,
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
      setLeverage: setHyperliquidLeverage,
      adjustMargin: adjustHyperliquidMargin,
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
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
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
      profitPerSale: true,
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
      setLeverage: setPhemexLeverage,
      adjustMargin: adjustPhemexMargin,
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
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
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
      // KuCoin pays out a figure when a position CLOSES, not when part of one
      // is sold. Its fills reader pins each payout onto the last fill before
      // the close, so every other sell carries a zero that means "KuCoin has
      // not said". The Dashboard counts those as unpriced rather than as
      // nothing earned.
      profitPerSale: false,
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
      setLeverage: setKucoinLeverage,
      adjustMargin: adjustKucoinMargin,
      setBrackets: setKucoinBrackets,
      portfolio: fetchKucoinPortfolio,
      fills: fetchKucoinOrderFills,
      orderInfo: fetchKucoinOrderInfo,
    },
  },
  /**
   * Aster V3 market data, accounts and orders on both networks.
   */
  aster: {
    id: "aster",
    label: "Aster",
    networks: ["mainnet", "testnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
    markets: {
      fetch: fetchAsterMarkets,
      candles: fetchAsterCandles,
      history: fetchAsterCandleHistory,
      historyBatchBars: ASTER_HISTORY_BATCH_BARS,
      intervalMs: asterIntervalMs,
      prices: fetchAsterPrices,
      roundPx: roundAsterPx,
      pricesWereRationed: asterPricesWereRationed,
    },
    livePrices: {
      open: openAsterLivePrices,
      read: readAsterLivePrices,
      fresh: asterLivePricesFresh,
    },
    funding: {
      fetch: fetchAsterFunding,
      intervalMs: asterFundingIntervalMs,
    },
    account: {
      fetch: fetchAsterAccount,
      portfolio: fetchAsterPortfolio,
      profitPerSale: true,
    },
    agent: { verify: verifyAsterAgentKey },
    credentials: {
      form: {
        addressLabel: "Main Aster wallet address",
        addressHint: "0x…",
        addressPattern: "^0x[0-9a-fA-F]{40}$",
        secretLabel: "API wallet key",
        needsPassphrase: false,
        secretIsAgentKey: true,
        keyHelp:
          "Make a separate Pro API wallet on Aster's API Wallet page and give it perpetual trading permission. The first field takes your main Aster login wallet. Paste the generated API wallet private key here. Trade derives the generated API wallet address, so you do not paste that address.",
      },
      pack: packAsterCredential,
    },
    orders: {
      place: placeAsterOrder,
      cancel: cancelAsterOrder,
      modify: modifyAsterOrder,
      close: closeAsterPosition,
      setLeverage: setAsterLeverage,
      adjustMargin: adjustAsterMargin,
      setBrackets: setAsterBrackets,
      portfolio: fetchAsterOrderPortfolio,
      fills: fetchAsterOrderFills,
      orderInfo: fetchAsterOrderInfo,
      watchFills: watchAsterFills,
      fillsNeedRecovery: asterFillsNeedRecovery,
    },
  },
  /**
   * Markets, charts, funding and a connected wallet. No orders yet.
   *
   * Lighter is the one venue here that runs its own chain and signs with its
   * own maths rather than Ethereum signing, so it carries a vendored copy of
   * Lighter's own compiled signer — see `lighter/signer/PROVENANCE.md`. That
   * signer works and is proven by a test that really runs it, which is why a
   * wallet can be connected. Placing orders is the next stage.
   *
   * A Standard account gets only 60 requests a minute, REST and socket
   * together, so the socket does nearly all the reading and every REST call
   * goes through `lighter/budget.ts`.
   *
   * Mainnet only, decided 26 Aug 2026. Lighter runs a testnet and it is not
   * worth carrying: it held three markets, had been reset two days earlier,
   * and served no candles at all. The order path will be proven the way
   * Phemex's and KuCoin's were, with signed reads first and then one tiny
   * real order behind both real-money switches.
   */
  lighter: {
    id: "lighter",
    label: "Lighter",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: false,
      changeLeverage: {
        can: false,
        because:
          "Trade cannot place Lighter orders yet, so it cannot change this position's leverage either. Use Lighter's own site until that is built.",
      },
      adjustMargin: {
        can: false,
        because:
          "Trade cannot place Lighter orders yet, so it cannot move this position's margin either. Use Lighter's own site until that is built.",
      },
    },
    markets: {
      fetch: fetchLighterMarkets,
      candles: fetchLighterCandles,
      history: fetchLighterCandleHistory,
      historyBatchBars: LIGHTER_HISTORY_BATCH_BARS,
      intervalMs: lighterIntervalMs,
      prices: fetchLighterPrices,
      roundPx: roundLighterPx,
      pricesWereRationed: lighterPricesWereRationed,
    },
    livePrices: {
      open: openLighterLivePrices,
      read: readLighterLivePrices,
      fresh: lighterLivePricesFresh,
    },
    funding: {
      fetch: fetchLighterFunding,
      // Hourly, measured 26 Aug 2026: three days of rows sat exactly one
      // hour apart.
      intervalMs: lighterFundingIntervalMs,
    },
    account: {
      fetch: fetchLighterAccount,
      // Positions only. Read-only while the order path is still closed, so
      // the panel can show what is held without offering to change it.
      portfolio: fetchLighterPortfolio,
      // Lighter states a realized figure per position rather than per sale,
      // and nothing has been measured yet because no fill has come from
      // Trade. Left at the safe answer until a real fill proves otherwise:
      // counting an unstated zero as "made nothing" would report a day of
      // trading as flat.
      profitPerSale: false,
    },
    agent: { verify: verifyLighterAgentKey },
    credentials: {
      form: {
        addressLabel: "Lighter account address",
        addressHint: "0x…",
        addressPattern: "^0x[0-9a-fA-F]{40}$",
        secretLabel: "API private key",
        needsPassphrase: false,
        /**
         * False, though this task's own notes asked for true.
         *
         * That flag turns on the dialog's EVM agent-key checks, and those
         * insist a key is 32 bytes. Lighter's are 40 — its own signer
         * refuses anything else, naming the length — so the dialog refused
         * every real Lighter key with "a key is exactly 64 characters"
         * before one could be saved. The warning that comes with the flag
         * does not fit either: a Lighter API key is not an Ethereum key at
         * all, so "never your main key" is about the wrong thing.
         *
         * The length rule still exists; it lives in `packLighterCredential`,
         * where the right number is.
         */
        secretIsAgentKey: false,
        keyHelp:
          "Make an API key on Lighter's own site and paste the private key it " +
          "shows you. The first field takes the wallet address you trade with " +
          "on Lighter. Trade finds your account number and which key slot it " +
          "sits in by itself, and never asks for the wallet's own Ethereum " +
          "key.",
      },
      pack: packLighterCredential,
    },
  },
  binance: {
    id: "binance",
    label: "Binance",
    // Mainnet only. Binance runs a testnet, but it is not what this app's
    // practice wallets pretend against.
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: false,
      orders: false,
      changeLeverage: {
        can: false,
        because:
          "Binance is here for its candles only — no wallet trades on it.",
      },
      adjustMargin: {
        can: false,
        because:
          "Binance is here for its candles only — no wallet trades on it.",
      },
    },
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

/**
 * Whether this exchange states what each individual sale made.
 *
 * Answered by id rather than by entry because the caller adding up a day's
 * fills has a market key in its hand, not a protocol entry. An exchange with
 * no accounts has no fills either, so its answer never gets used; it reads
 * true because a stated figure of zero, on a venue that states them, is zero.
 */
export function pricesEverySale(id: ProtocolId): boolean {
  return getProtocol(id).account?.profitPerSale ?? true
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
