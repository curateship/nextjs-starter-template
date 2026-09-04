/**
 * The shapes every screen and every exchange module agree on.
 *
 * This file is the whole boundary. Screens import these types and nothing
 * else; an exchange module's job is to produce them and keep its own SDK, its
 * endpoints and its response shapes to itself. A second exchange is a new
 * module that fills these same shapes — never a change to a screen.
 *
 * Browser-safe on purpose: nothing in here may import `@/server/*` or an
 * exchange package. `src/server/protocols/fence.test.ts` enforces both.
 */

import { dukascopySymbol } from "@/lib/protocols/dukascopy/naming"

/**
 * Every exchange this app knows how to talk to.
 *
 * A union rather than `string` so that a typo is a compile error, and so
 * adding an exchange is a deliberate edit here — the one shared file — plus a
 * new module behind it, never a stray name invented at a call site.
 */
export type ProtocolId =
  | "hyperliquid"
  | "binance"
  | "phemex"
  | "kucoin"
  | "aster"
  | "lighter"
  | "dukascopy"
  | "solana"

/** The two kinds of network an exchange runs: real money, or practice. */
export type NetworkId = "mainnet" | "testnet"

/**
 * How one exchange signs a person in, as data the wallet dialog renders —
 * labels, patterns and help copy, never a protocol id to compare against.
 *
 * Two families exist so far. Hyperliquid is wallet-shaped: a public account
 * address plus a separate trading key. A centralized exchange is API-key
 * shaped: the key's id (public enough to sit in the `address` column) plus a
 * secret, and on some venues a third value, the passphrase. The dialog draws
 * whichever fields the form names and sends them; the server packs them into
 * one encrypted blob whose format belongs to the protocol alone.
 */
export type CredentialForm = {
  /** What the public identifier is called: "Account address", "API key id". */
  addressLabel: string
  /** Example text for the identifier field. */
  addressHint: string
  /**
   * What the identifier must look like, as a regular expression source the
   * SERVER checks (the dialog may use it for early feedback). Kept simple on
   * purpose — shape, not truth; the verify call is what proves a credential.
   */
  addressPattern: string
  /** What the secret is called: "Trading key (agent key)", "API secret". */
  secretLabel: string
  /** True on an exchange that needs a passphrase beside the secret. */
  needsPassphrase: boolean
  /**
   * True when the secret is an EVM agent key — the dialog then applies the
   * agent-key shape checks and the "never your main key" warning that only
   * make sense for that family.
   */
  secretIsAgentKey: boolean
  /**
   * True on a venue whose wallet the app can make for you: the dialog then
   * offers "Make a new wallet" beside the paste fields. Only a chain wallet
   * can be made this way — an exchange account has to be opened on the
   * exchange.
   */
  canMakeWallet: boolean
  /** One short paragraph: where to make the credential and what it may do. */
  keyHelp: string
}

/**
 * What one protocol can and cannot do. Screens read these flags instead of
 * ever asking which protocol they are talking to.
 *
 * Flags are added when the screens that need them are built — a capability
 * nobody reads is a guess, and guesses drift. Order types and
 * protective orders get theirs with the ordering work.
 */
export type ProtocolCapabilities = {
  /** Can list its markets with live figures. */
  markets: boolean
  /** Can read what an account at an address holds and is worth. */
  accounts: boolean
  /** Can sign and place real orders for a live wallet. */
  orders: boolean
  /** Where a grid stop waits until its price is reached. */
  gridStop: "exchange" | "watched"
  /** Can change the leverage on a position that is already open. */
  changeLeverage: ProtocolAbility
  /** Can add or take back the cash behind an isolated position. */
  adjustMargin: ProtocolAbility
}

/**
 * Something one exchange can do and another cannot, with the reason attached.
 *
 * **The reason is the point.** A flag on its own lets a screen hide a button,
 * which leaves somebody looking for a button that is not there. Carrying the
 * sentence with the flag means the screen can say why instead — and the
 * sentence is written where the knowledge is, beside the exchange's own module,
 * rather than in a screen that would then have to know which exchange it was
 * looking at.
 */
export type ProtocolAbility =
  | { can: true }
  | {
      can: false
      /** Plain words for the screen: what cannot be done here, and why. */
      because: string
    }

/**
 * How a saved market is written down: protocol, network, and the market's own
 * id, joined into one string — `"hyperliquid:mainnet:BTC"`.
 *
 * Never the symbol alone. BTC exists on every exchange, so a bare "BTC" stops
 * meaning anything the day a second protocol arrives. Favourites use this key
 * today; alerts, scanner rules and bots use it when they are built.
 */
export type MarketKey = string

export type MarketRef = {
  protocol: ProtocolId
  network: NetworkId
  /** The exchange's own id for the market — its coin name on Hyperliquid. */
  marketId: string
}

/**
 * Every id, as a value — exported so the endpoints that accept a protocol
 * from the browser build their allow-lists from this one list instead of
 * hardcoding a copy that would silently miss the next exchange.
 */
export const KNOWN_PROTOCOLS = [
  "hyperliquid",
  "binance",
  "phemex",
  "kucoin",
  "aster",
  "lighter",
  "dukascopy",
  "solana",
] as const satisfies readonly ProtocolId[]

/**
 * Each exchange's printed name. A lookup rather than capitalising the id,
 * because real names do not follow from ids ("KuCoin" will not), and kept in
 * this one protocol-aware file so no screen ever spells an exchange itself.
 */
const PROTOCOL_LABELS: Record<ProtocolId, string> = {
  hyperliquid: "Hyperliquid",
  binance: "Binance",
  phemex: "Phemex",
  // Capital C, which is why this is a lookup and not a capitalised id.
  kucoin: "KuCoin",
  aster: "Aster",
  lighter: "Lighter",
  dukascopy: "Dukascopy",
  solana: "Solana",
}

export function protocolLabel(id: ProtocolId): string {
  return PROTOCOL_LABELS[id]
}
const KNOWN_NETWORKS: readonly NetworkId[] = ["mainnet", "testnet"]

/** The one way a market key is ever built. */
export function marketKey(ref: MarketRef): MarketKey {
  return `${ref.protocol}:${ref.network}:${ref.marketId}`
}

/**
 * The one way a market key is ever read. Returns null for anything that is
 * not a well-formed key for a protocol and network this app knows — a saved
 * key from a bad hand-edit or an old build resolves to "not available", never
 * to some other market.
 */
export function parseMarketKey(key: string): MarketRef | null {
  const first = key.indexOf(":")
  const second = key.indexOf(":", first + 1)
  if (first <= 0 || second <= first + 1 || second === key.length - 1) {
    return null
  }

  const protocol = key.slice(0, first) as ProtocolId
  const network = key.slice(first + 1, second) as NetworkId
  const marketId = key.slice(second + 1)

  if (!KNOWN_PROTOCOLS.includes(protocol)) return null
  if (!KNOWN_NETWORKS.includes(network)) return null
  return { protocol, network, marketId }
}

/**
 * How a market key reads on screen: "hyperliquid:mainnet:BTC" is BTC.
 *
 * The key itself when it cannot be read, because a row still has to say which
 * market it is about, and a blank cell in a table of money is worse than an
 * ugly one. Written here, beside the only other way a key is ever read, so
 * every panel says the same thing.
 */
export function marketSymbol(key: string): string {
  const ref = parseMarketKey(key)
  if (!ref) return key
  // Dukascopy's ids are lowercase and carry the quote currency: `tslaususd`
  // is TSLA.
  if (ref.protocol === "dukascopy") return dukascopySymbol(ref.marketId)
  // A Solana id is the coin's mint address, because two coins can share a
  // ticker there and only the address is unique. The ticker is not in the
  // key and cannot be derived from it, so a caller holding only a key shows
  // the address shortened the way every other address here is shown. Every
  // caller that HAS the row — the list, the picker, the market header —
  // prints `row.symbol` and shows the real ticker.
  if (ref.protocol === "solana" && ref.marketId.length > 12) {
    return `${ref.marketId.slice(0, 6)}…${ref.marketId.slice(-4)}`
  }
  return ref.marketId
}

const PROTOCOL_DASHBOARD_PATHS: Partial<Record<ProtocolId, string>> = {
  hyperliquid: "/admin/hyper-liquid",
  phemex: "/admin/phemex",
  kucoin: "/admin/kucoin",
  aster: "/admin/aster",
  lighter: "/admin/lighter",
  solana: "/admin/solana",
}

/** The chart address for a market whose protocol has a trading dashboard. */
export function marketChartHref(key: MarketKey): string | null {
  const ref = parseMarketKey(key)
  if (!ref) return null
  const path = PROTOCOL_DASHBOARD_PATHS[ref.protocol]
  return path ? `${path}?market=${encodeURIComponent(key)}` : null
}

/**
 * What kind of thing a market is, in the app's own words. Exchanges say this
 * in their own vocabularies; each module translates into this one.
 */
export const MARKET_CATEGORIES = [
  "crypto",
  "stocks",
  "indices",
  "commodities",
  "forex",
  "other",
] as const

export type MarketCategory = (typeof MARKET_CATEGORIES)[number]

/**
 * One market, in the app's own words. This is what screens draw — no screen
 * ever sees an exchange's raw response.
 *
 * Figures are numbers, not the exchange's strings, and the fractions are
 * fractions: `change24h` of 0.024 is a 2.4% rise. Formatting belongs to the
 * screen, precision to the exchange module that produced the row.
 */
export type MarketRow = {
  key: MarketKey
  /** The exchange's own id — what goes in the key. */
  marketId: string
  /** What to print. The same as marketId on Hyperliquid. */
  symbol: string
  /** The dollar token printed beside the market, such as USDC or USDT. Plain USD on a price feed that settles nothing. */
  quoteAsset: "USDC" | "USDT" | "USD"
  /**
   * The sub-exchange this market trades on, by its full name — the extra
   * venues an exchange hosts beside its main one — or null on the main one.
   * Carried for the screens that must say which "BTC" this is.
   */
  subExchange: string | null
  /** What kind of market this is, for filtering the list. */
  category: MarketCategory
  /**
   * How many decimal places an order's size may have — 3 means the smallest
   * size step is 0.001 of the coin. Null when the exchange does not say.
   */
  sizeDecimals: number | null
  /** The least coin size accepted, or null when the exchange does not say. */
  minOrderSize?: number | null
  /**
   * The smallest price step this market accepts — 0.5 means $100.5 is a
   * legal price and $100.3 is not. Null on an exchange that states no tick
   * and rounds by its own rule instead (Hyperliquid's five significant
   * figures). `roundPx` is where either answer is applied.
   */
  priceTick: number | null
  /** Highest allowed order-price multiplier over the mark, when stated. */
  priceMultiplierUp?: number | null
  /** Lowest allowed order-price multiplier under the mark, when stated. */
  priceMultiplierDown?: number | null
  /** The least dollar notional this market accepts, or null when unstated. */
  minOrderValueUsd: number | null
  /** The most leverage this market allows, or null when the exchange does not say. */
  maxLeverage: number | null
  /** This market only trades isolated: a trade's stake is all it can lose. */
  isolatedOnly: boolean
  /**
   * Where the exchange serves this market's logo, or null when it has none.
   * Carried as data so no screen ever builds an exchange's URL itself.
   */
  iconUrl: string | null
  /** Last mark price, in dollars. */
  price: number
  /** Move over the last day as a fraction, or null when the exchange had no yesterday price. */
  change24h: number | null
  /** Dollars traded over the last day. */
  volume24hUsd: number
  /** The hourly funding rate as a fraction, or null where funding does not apply. */
  fundingHourly: number | null
  /** Open interest in dollars, or null where the exchange does not say. */
  openInterestUsd: number | null
  /**
   * A coin the venue itself warns about. Absent on an exchange that vets
   * every listing; set on an open network where anyone can mint a coin
   * (Solana), where "unverified" means nobody has vouched for it and
   * "suspicious" means the venue's own audit flagged it. The list prints
   * the word beside the name and never hides the coin.
   */
  caution?: "unverified" | "suspicious" | null
}

/**
 * A protocol's market list plus who it came from, so every screen can say
 * which exchange and which network it is showing — the label that stops two
 * markets with the same name being read as each other.
 */
export type MarketCatalog = {
  protocol: ProtocolId
  protocolLabel: string
  network: NetworkId
  networkLabel: string
  /** What this exchange can truthfully show in the full market picker. */
  picker: MarketPickerCapabilities
  rows: MarketRow[]
}

export type MarketPickerCapabilities = {
  /** Full keeps all category tabs; catalog shows them only when rows differ. */
  categories: "full" | "catalog" | "crypto-only"
  hip3: boolean
  funding: boolean
  openInterest: boolean
  /**
   * True where the venue can find a market that is not in the loaded list,
   * by name or address — an open network lists more coins than any list
   * holds. The picker then offers a lookup when a search matches nothing.
   */
  search?: boolean
}

/**
 * The chart timeframes every protocol is asked in. The strings double as the
 * stored per-browser choice, so they never change meaning once shipped.
 */
export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const

export type CandleInterval = (typeof CANDLE_INTERVALS)[number]

/**
 * One bar of price history, in the app's own words: when it opened (epoch
 * milliseconds), the four prices, and how much traded. Screens draw these;
 * whatever shape the exchange sent stops at its own module.
 */
export type CandleBar = {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** One exchange funding settlement, normalized to its settlement hour. */
export type FundingRate = {
  /** Epoch ms of the settlement hour. */
  time: number
  /** Fraction of notional: positive means longs pay shorts. */
  rate: number
}

/**
 * What one account read says a wallet holds, in the app's own words and in
 * plain dollars. An exchange module produces exactly this; whatever richer
 * shape its API answered with stops at the module. The derived rows the panel
 * shows — settled, since-it-started — are arithmetic on top of these and live
 * in `@/lib/trade/wallets`, not here: deriving is the app's job, reporting is
 * the exchange's.
 */
export type WalletAccountFigures = {
  /** What the whole account is worth right now, in dollars. */
  equity: number
  /** Cash not committed to anything — free to place orders with. */
  free: number
  /** Margin the open positions are holding, in dollars. */
  inTrades: number
  /** What the open positions are up or down right now, in dollars. */
  openProfit: number
}

/** One fixed-size take-profit order attached to a position. */
export type TakeProfitTarget = {
  px: number
  /** Coins sold at this price. Null is only valid for a lone whole-position target. */
  sz: number | null
  /** The exchange order id. Practice targets have no exchange order. */
  orderId: string | null
}

/**
 * One real position a live wallet holds, in the app's own words. Everything
 * here is the exchange's OWN answer — margin held and the liquidation price
 * come from the exchange, never re-derived, because for a real account the
 * exchange's number is the one that will actually be enforced.
 */
export type WalletPosition = {
  /** The exchange's own id for the market. */
  marketId: string
  /** How much is held, signed: positive long, negative short. */
  szi: number
  entryPx: number
  leverage: number
  /** Dollars the exchange says this position is holding as margin. */
  marginUsed: number
  /** Where the exchange takes the trade away, or null when it says nothing. */
  liquidationPx: number | null
  /** Every take-profit order riding on the position, sorted by price. */
  targets: TakeProfitTarget[]
  /** First target, kept for one compatibility release. */
  tpPx: number | null
  /**
   * Coins the target's leg sells, when it covers less than the position.
   * Null means the whole position — the leg tracks the position's size.
   */
  tpSz: number | null
  slPx: number | null
  /** First target id and the stop id, kept for one compatibility release. */
  tpOrderId: string | null
  slOrderId: string | null
  /**
   * Every reduce-only protection order the exchange is holding on this market,
   * the two above included.
   *
   * A position is only supposed to carry one stop and one target, and the four
   * fields above say which. It can end up carrying more: brackets attached to
   * an entry order arrive as their own fixed-size legs, and a position that
   * later grows gets a second pair placed over the top. On 24 Aug 2026 one
   * Hyperliquid position was found holding four, a whole-position pair and a
   * 48% pair, drawn on the chart as two stray sell orders sitting exactly on
   * top of the stop and the target.
   *
   * `setBrackets` cancels this whole list rather than the two named ids, so
   * replacing a stop leaves one stop behind and never a pile. Without it every
   * extra leg is permanent: the app cannot see it, so it can never cancel it,
   * and the position quietly gets sold twice over.
   */
  protectionOrderIds: string[]
}

/** One real order still waiting on the exchange. */
export type WalletOpenOrder = {
  /** The exchange's own id for the order. */
  orderId: string
  marketId: string
  side: "buy" | "sell"
  px: number
  sz: number
  reduceOnly: boolean
  /** Waits at a trigger price rather than resting in the book. */
  trigger: boolean
}

/** Everything a live wallet holds and has waiting, in one read. */
export type WalletPortfolio = {
  positions: WalletPosition[]
  orders: WalletOpenOrder[]
}

/**
 * One trade the exchange actually made for this wallet.
 *
 * The last four fields are the exchange's own accounting, not ours. A closing
 * fill is the only place the money a trade made is stated by the venue that
 * paid it, and working it out from prices instead would quietly disagree with
 * the account — funding, partial closes and the venue's own rounding all land
 * in `closedPnl` and nowhere else.
 */
export type WalletOrderFill = {
  fillId: string
  orderId: string
  marketId: string
  side: "buy" | "sell"
  px: number
  sz: number
  at: number
  /** What this fill banked, in dollars. Zero on a fill that only opened. */
  closedPnl: number
  /** What the venue charged for it. A rebate comes back negative. */
  fee: number
  /** The venue's own words for what it did: "Close Long", "Open Short", … */
  dir: string
  /** True when the venue closed this position itself, not the account. */
  liquidation: boolean
}

/**
 * What one order turned out to be, asked of the exchange after the fact.
 *
 * This is how a fill months old is told from a stop firing: the exchange
 * reports a stop as an ordinary sell, and the only thing that says otherwise
 * is the order behind it — which it still remembers long after the order is
 * gone. "none" is a real answer and worth storing, so the same question is
 * never asked twice.
 *
 * `triggerPx` is null once an order has triggered — the exchange zeroes it —
 * so a recovered stop can say it WAS a stop without claiming a price it can no
 * longer prove.
 */
export type WalletOrderInfo = {
  kind: "stop" | "target" | "none"
  triggerPx: number | null
}

/**
 * What a protocol needs before it may sign anything: the decrypted
 * credentials, alive for this one call only, and the counter that hands out
 * order numbers. The counter lives with the app's database so two requests —
 * or a future background worker — can never hand the exchange the same
 * number twice.
 *
 * `agentKey` is the decrypted credential blob, and it is OPAQUE outside the
 * protocol's own folder: Hyperliquid reads it as a hex trading key, an
 * API-key exchange reads it as the JSON its own `credentials.pack` wrote —
 * `{"secret":…}`, plus a passphrase where the venue demands one. Nothing
 * between the decrypt and the connector may look inside it.
 */
export type OrderAuth = {
  agentKey: string
  /** The account this credential is allowed to trade for. */
  accountAddress?: string
  /** The next always-rising order number for this signing address. */
  allocateNonce: (signerAddress: string) => Promise<number>
}

export type PlaceOrderParams = {
  marketId: string
  side: "buy" | "sell"
  /** Market fills now, limit may cross, and post-only must rest or be refused. */
  kind: "market" | "limit" | "postOnly"
  px: number
  /** The market's legal price step, where the venue states one. */
  priceTick?: number | null
  priceMultiplierUp?: number | null
  priceMultiplierDown?: number | null
  sz: number
  reduceOnly: boolean
  /** Set when opening fresh; null leaves the account's own setting alone. */
  leverage: number | null
  /** The wallet's saved account mode, set before a fresh entry. */
  marginMode?: "cross" | "isolated" | null
  tpPx: number | null
  slPx: number | null
}

/**
 * What actually happened to a placed order. `protection` is the honesty flag
 * this app's rules require: "partial" means the entry stands but a stop or
 * take-profit leg was refused — which must be said out loud, never folded
 * into a success.
 */
export type PlaceOrderOutcome = {
  status: "resting" | "filled"
  orderId: string | null
  avgPx: number | null
  filledSz: number | null
  protection: "ok" | "partial" | null
  protectionNote: string | null
}

/**
 * The figures of one market that move while you watch — what a live feed
 * pushes, in the same units as `MarketRow`'s copies of them.
 */
export type LiveFigures = {
  price: number
  change24h: number | null
  volume24hUsd: number
  fundingHourly: number | null
  openInterestUsd: number | null
}

/**
 * The health of a live feed, as screens describe it. Judged by data arriving,
 * not by what the socket claims: "stale" means the numbers on screen may be
 * old, "paused" means a hidden tab let go of the connection on purpose.
 */
export type LiveFeedStatus = "connecting" | "live" | "stale" | "paused"
