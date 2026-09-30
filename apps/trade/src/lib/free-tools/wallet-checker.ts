import { marketKey, marketSymbol, type WalletOrderFill } from "@/lib/protocols/contracts"
import { buildLiveTrades, type LiveFill } from "@/lib/trade/live-trades"
import {
  publicFigures,
  windowStart,
  type PublicFigures,
  type RecordFillMoney,
} from "@/lib/trade/public-profile/figures"
import { moneyForWalletFill } from "@/lib/trade/wallets"

/**
 * The wallet checker (`/tools/wallet-checker`), in the app's own words: what
 * a typed address has to look like, and the shape of the answer.
 *
 * Browser-safe. The server file (`@/server/free-tools/wallet-checker.ts`)
 * asks Hyperliquid and works the figures out.
 */

/**
 * A Hyperliquid address: `0x` and forty hex digits, nothing else. Either
 * case, because a checksummed address is half uppercase and somebody pasting
 * one should not be told it is wrong.
 */
const WALLET_ADDRESS_PATTERN = /^0[xX][0-9a-fA-F]{40}$/

/**
 * Hyperliquid answers one fills question with at most this many rows, and
 * only ever the most recent ones.
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */
export const HYPERLIQUID_FILL_LIMIT = 2000

/** How long one address's answer is kept and handed to every later visitor. */
export const WALLET_CHECK_KEEP_MS = 10 * 60_000

/** How many addresses one visitor may check in a minute. */
export const WALLET_CHECK_PER_VISITOR = 5

/**
 * How many addresses the whole server may check in a minute.
 *
 * One check costs 22 of the 1,200 request-weight a minute Hyperliquid allows
 * this machine: 20 for the fills and 2 for the positions
 * (`workspace/docs/protocols/hyperliquid-rate-limits.md`). Twelve checks is
 * 264 a minute, a fifth of the budget, so the trading engine keeps the rest
 * however popular the page gets. A kept copy costs nothing and is not counted.
 */
export const WALLET_CHECK_PER_MINUTE = 12

/** The typed address, trimmed and lowercased, or null when it is not one. */
export function readWalletAddress(typed: string): string | null {
  const cleaned = typed.trim()
  return WALLET_ADDRESS_PATTERN.test(cleaned) ? cleaned.toLowerCase() : null
}

/** What is wrong with the typed address, in a sentence, or null. */
export function walletAddressProblem(typed: string): string | null {
  const cleaned = typed.trim()
  if (!cleaned) return "Paste a Hyperliquid wallet address."
  if (readWalletAddress(cleaned)) return null
  return "That is not a wallet address. One starts with 0x and has 40 characters after it."
}

/** The single worst finished trade: what it lost, on which coin, and when. */
type WorstTrade = {
  /** The coin, as the exchange names it: "ETH". */
  symbol: string
  /** Dollars, negative. */
  pnl: number
  closedAt: number
}

export type WalletCheckReport = {
  /** Lowercase, full. The page shortens it for the heading. */
  address: string
  /** The earliest fill the exchange returned, or null when it has none. */
  historyStart: number | null
  /**
   * The exchange returned everything it will for one question, so the wallet
   * traded before `historyStart` and those trades are not counted.
   */
  historyCapped: boolean
  /**
   * The 30-day figure covers only part of the 30 days, because the exchange's
   * history ran out inside the window. The page says so instead of showing a
   * figure that reads as the whole month.
   */
  thirtyDaysPartial: boolean
  figures: PublicFigures
  worstTrade: WorstTrade | null
  /** Positions open right now on Hyperliquid's main perps market. */
  openPositions: number
  /** The handle of the public Trade profile this wallet belongs to, or null. */
  profileHandle: string | null
  /** When the server asked the exchange. A kept copy carries the first time. */
  readAt: number
}

/** The sentence a failed check puts in front of the visitor. */
export function getWalletCheckErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (message.includes("WALLET_ADDRESS_INVALID")) {
    return "That is not a wallet address. One starts with 0x and has 40 characters after it."
  }
  if (message.includes("WALLET_CHECK_BUSY")) {
    return "Too many wallets are being checked right now. Try again in a minute."
  }
  if (message.includes("RATE_LIMITED")) {
    return `You can check ${WALLET_CHECK_PER_VISITOR} wallets a minute. Try again in a minute.`
  }
  if (message.includes("WALLET_CHECK_UNAVAILABLE")) {
    return "Hyperliquid did not answer. Try again in a minute."
  }
  return "This wallet could not be checked. Try again in a minute."
}

/** What `buildWalletReport` is handed once the exchange has answered. */
export type WalletCheckRead = {
  /** Lowercase, full. */
  address: string
  /** Every fill the exchange returned, in any order. */
  fills: readonly WalletOrderFill[]
  /** The exchange gave all it will for one question, so older fills exist. */
  capped: boolean
  openPositions: number
  /** The public Trade profile this wallet belongs to, or null. */
  profileHandle: string | null
  /** Whether the exchange states what each individual sale made. */
  profitPerSale: boolean
  now: number
}

/**
 * The whole answer, worked out from the fills alone.
 *
 * **The same counting as the P&L page.** A fill's money is the exchange's own
 * `closedPnl` less the fee it charged (`moneyForWalletFill`), trades are the
 * Journal's flat-to-flat trades (`buildLiveTrades`), and the windows are
 * `publicFigures`, the function a public trader profile already uses. A
 * wallet that is on a Trade profile therefore shows the same numbers in both
 * places.
 *
 * The one thing this cannot match is a grid's own pricing. A member's grid
 * sale is priced from the grid that made it, which only that member's account
 * knows; a stranger's wallet has the exchange's figure and nothing else.
 *
 * Nothing here talks to a database, an exchange or a clock.
 */
export function buildWalletReport(read: WalletCheckRead): WalletCheckReport {
  const fills: LiveFill[] = read.fills.map((fill) => ({
    fillId: fill.fillId,
    orderId: fill.orderId,
    walletId: read.address,
    marketKey: marketKey({
      protocol: "hyperliquid",
      network: "mainnet",
      marketId: fill.marketId,
    }),
    side: fill.side,
    px: fill.px,
    sz: fill.sz,
    at: fill.at,
    closedPnl: fill.closedPnl,
    fee: fill.fee,
    dir: fill.dir,
    liquidation: fill.liquidation,
    live: true,
  }))
  const money: RecordFillMoney[] = fills.map((fill) => ({
    at: fill.at,
    money: moneyForWalletFill({
      profitPerSale: read.profitPerSale,
      side: fill.side,
      closedPnl: fill.closedPnl,
      fee: fill.fee,
    }),
    fee: fill.fee,
  }))
  // No trigger orders are looked up: telling a stop from an ordinary sell
  // costs one exchange call per trade, and nothing on this page names how a
  // trade ended.
  const trades = buildLiveTrades(fills, new Map())
  const historyStart = fills.length
    ? Math.min(...fills.map((fill) => fill.at))
    : null

  return {
    address: read.address,
    historyStart,
    historyCapped: read.capped,
    thirtyDaysPartial:
      read.capped &&
      historyStart !== null &&
      historyStart > windowStart(30, read.now),
    figures: publicFigures(
      money,
      trades.map((trade) => ({ closedAt: trade.closedAt, pnl: trade.pnl })),
      read.now
    ),
    worstTrade: worstTradeOf(trades),
    openPositions: read.openPositions,
    profileHandle: read.profileHandle,
    readAt: read.now,
  }
}

/** The single worst finished trade, or null when none of them lost money. */
function worstTradeOf(
  trades: readonly { marketKey: string; pnl: number; closedAt: number }[]
): WorstTrade | null {
  let worst: { marketKey: string; pnl: number; closedAt: number } | null = null
  for (const trade of trades) {
    if (trade.pnl >= 0) continue
    if (!worst || trade.pnl < worst.pnl) worst = trade
  }
  return worst
    ? {
        symbol: marketSymbol(worst.marketKey),
        pnl: worst.pnl,
        closedAt: worst.closedAt,
      }
    : null
}
