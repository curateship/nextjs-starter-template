import type { ProtocolId } from "@/lib/protocols/contracts"
import { formatPrice, formatWholeUsd } from "@/lib/trade/format"

/**
 * Following and copying a trader, in the app's own words. Browser-safe: the
 * limits, the shapes, the checks on what a copier types, and the one decision
 * every trader trade goes through. The server (`@/server/trade/copy-*.ts`)
 * reads and writes the rows and places the orders.
 *
 * `workspace/docs/social/copy-a-trader.md` is the plain-words version.
 */

/** Tyler, 25 Sep 2026: 0.1% of each copied trade, half of it to the trader. */
export const COPY_FEE_RATE_DEFAULT = 0.001
export const COPY_TRADER_SHARE_DEFAULT = 0.5

/**
 * The most Hyperliquid lets an app add to a perp order: 0.1%. Its builder fee
 * is counted in tenths of a basis point, so 0.1% is 100.
 */
export const HYPERLIQUID_MAX_BUILDER_FEE = 0.001

/** A fee rate in Hyperliquid's own unit, tenths of a basis point. */
export function builderFeeTenthsBps(rate: number): number {
  return Math.round(rate * 100_000)
}

/** A rate as Hyperliquid's approval wants it written: "0.1%". */
export function builderFeePercent(rate: number): string {
  return `${Number((rate * 100).toFixed(4))}%`
}

/**
 * The exchanges real money may copy on. Tyler, 25 Sep 2026: Hyperliquid only,
 * because it tells Trade about a trade within seconds and lets Trade add its
 * fee. Every other exchange can be copied with a practice wallet.
 */
export const REAL_MONEY_COPY_PROTOCOLS: readonly ProtocolId[] = ["hyperliquid"]

/** The price may move this far past the trader's before a copy is skipped. */
export const COPY_PRICE_ALLOWANCE_DEFAULT = 0.01
export const COPY_PRICE_ALLOWANCE_MAX = 0.05

/**
 * A market must trade at least this much a day to be copied, so a trader
 * cannot buy a thin coin, let the copiers push its price up, and sell to them.
 */
export const COPY_MIN_DAILY_VOLUME_USD = 1_000_000

/**
 * Copied orders on one market never add up to more than this share of what
 * the market traded in the last day: 1 dollar in every 100.
 */
export const COPY_MAX_SHARE_OF_DAILY_VOLUME = 0.01

/**
 * A trade heard later than this is too old to copy. Hyperliquid pushes a
 * trade within seconds; the slowest exchange Trade reads by asking is asked
 * every two minutes.
 */
export const COPY_MAX_LATE_MS = 5 * 60_000

/** "Sold within five minutes of their copiers buying" on the profile. */
export const SOLD_INTO_COPIERS_MS = 5 * 60_000

export const COPY_DOLLARS_MIN = 10
export const COPY_DOLLARS_MAX = 100_000
export const COPY_COINS_MAX = 50

/** What a copier chooses in the Copy window. */
export type CopySettings = {
  /** One of the copier's own wallets on the trader's exchange. */
  walletId: string
  dollarsPerTrade: number
  /** The most money in copied positions at once. */
  maxOpenUsd: number
  /** The highest leverage the copier accepts. */
  maxLeverage: number
  /** Market ids to copy, or null for every coin. */
  coins: string[] | null
  /** How far the price may move past the trader's, as a share of it. */
  priceAllowance: number
  /** Copying pauses once copied trades have lost this many dollars. */
  lossLimitUsd: number | null
}

export type CopyStatus = "active" | "paused" | "stopped"

/** The first thing wrong with a copy's settings, or null. */
export function copySettingsProblem(
  settings: CopySettings
): { field: keyof CopySettings; message: string } | null {
  const { dollarsPerTrade, maxOpenUsd, maxLeverage } = settings
  if (!settings.walletId) {
    return { field: "walletId", message: "Pick the wallet the copies go in." }
  }
  if (
    !Number.isFinite(dollarsPerTrade) ||
    dollarsPerTrade < COPY_DOLLARS_MIN ||
    dollarsPerTrade > COPY_DOLLARS_MAX
  ) {
    return {
      field: "dollarsPerTrade",
      message: `Dollars per trade must be between ${formatWholeUsd(COPY_DOLLARS_MIN)} and ${formatWholeUsd(COPY_DOLLARS_MAX)}.`,
    }
  }
  if (!Number.isFinite(maxOpenUsd) || maxOpenUsd < dollarsPerTrade) {
    return {
      field: "maxOpenUsd",
      message:
        "The most in copied positions at once must be at least one trade's dollars.",
    }
  }
  if (maxOpenUsd > COPY_DOLLARS_MAX * 10) {
    return {
      field: "maxOpenUsd",
      message: `The most in copied positions at once can be up to ${formatWholeUsd(COPY_DOLLARS_MAX * 10)}.`,
    }
  }
  if (!Number.isFinite(maxLeverage) || maxLeverage < 1 || maxLeverage > 100) {
    return {
      field: "maxLeverage",
      message: "The highest leverage must be between 1x and 100x.",
    }
  }
  if (settings.coins !== null) {
    if (settings.coins.length === 0) {
      return {
        field: "coins",
        message: "Pick at least one coin, or copy every coin.",
      }
    }
    if (settings.coins.length > COPY_COINS_MAX) {
      return {
        field: "coins",
        message: `A copy can list up to ${COPY_COINS_MAX} coins.`,
      }
    }
  }
  if (
    !Number.isFinite(settings.priceAllowance) ||
    settings.priceAllowance <= 0 ||
    settings.priceAllowance > COPY_PRICE_ALLOWANCE_MAX
  ) {
    return {
      field: "priceAllowance",
      message: "The price allowance must be between $0.01 and $5 in every $100.",
    }
  }
  if (
    settings.lossLimitUsd !== null &&
    (!Number.isFinite(settings.lossLimitUsd) || settings.lossLimitUsd <= 0)
  ) {
    return {
      field: "lossLimitUsd",
      message: "The loss limit must be more than $0, or left empty.",
    }
  }
  return null
}

/** "$1 in every $100", the way the window and the Journal say an allowance. */
export function allowanceWords(allowance: number): string {
  const dollars = Number((allowance * 100).toFixed(2))
  return `$${dollars} in every $100`
}

// ----- The fee --------------------------------------------------------------

export type CopyFee = { feeUsd: number; traderShareUsd: number }

/**
 * Trade's fee on one copied fill, and the trader's share of it. A practice
 * fill is free: nothing real changed hands, so nothing is owed.
 */
export function copyFee(input: {
  notionalUsd: number
  real: boolean
  feeRate: number
  traderShare: number
}): CopyFee {
  if (!input.real || !(input.notionalUsd > 0) || !(input.feeRate > 0)) {
    return { feeUsd: 0, traderShareUsd: 0 }
  }
  const feeUsd = input.notionalUsd * input.feeRate
  return { feeUsd, traderShareUsd: feeUsd * input.traderShare }
}

// ----- What one trader trade means for one copy -----------------------------

/** Below this many coins a position is the exchange's rounding, not a holding. */
const DUST = 1e-9

/**
 * One copy's view of one market: how much of it the trader held the last time
 * the copy acted on it. Signed coins, long positive. A leg exists only for a
 * position the trader opened while the copy was running.
 */
export type CopyLeg = { traderSz: number }

/** The trader's trade on one market, all its fills together. */
export type TraderMove = {
  /** Signed coins the trade moved: a buy is positive. */
  delta: number
  /** Size-weighted price of the trade. */
  px: number
  /**
   * What the trader holds after the trade, signed, read from the exchange.
   * Null when the read failed.
   */
  heldAfter: number | null
  /** The venue's own words for the first fill: "Open Long", "Close Short". */
  dir: string
}

export type CopyDecision =
  /** Open or add: the copier puts one trade's dollars in on this side. */
  | { kind: "open"; side: "buy" | "sell"; leg: CopyLeg; adding: boolean }
  /**
   * Take this share of the copier's position off. `turned` is a trader who
   * went from long to short or back in one trade: the copy closes, and the
   * new side is not copied, because a copy only opens from nothing.
   */
  | { kind: "reduce"; share: number; leg: CopyLeg | null; turned?: boolean }
  /** Nothing to copy, and the reason is worth a Journal row. */
  | { kind: "skip"; reason: "held-before" }
  /** Nothing to copy, and nothing to say: a close of a position never followed. */
  | { kind: "ignore" }

function sign(value: number): number {
  return Math.abs(value) <= DUST ? 0 : value > 0 ? 1 : -1
}

/**
 * What the copy does about the trader's trade on one market.
 *
 * **The trader's own position is the count.** What they held before the trade
 * is what they hold now less what the trade moved, read from the exchange
 * after the trade. That makes "closed half" exact whatever happened before
 * the copy began. When the read failed, the leg's own memory stands in, and
 * with no leg either, the venue's own "Open" or "Close" decides.
 *
 * **A position held before the copy began is not followed.** Its adds are
 * skipped with a reason, and its closes are ignored, because the copier never
 * had the piece they would be closing.
 */
export function decideCopy(
  leg: CopyLeg | null,
  move: TraderMove
): CopyDecision {
  if (Math.abs(move.delta) <= DUST) return { kind: "ignore" }
  const before =
    move.heldAfter !== null
      ? move.heldAfter - move.delta
      : leg !== null
        ? leg.traderSz
        : move.dir.startsWith("Open")
          ? 0
          : null
  if (before === null) return { kind: "ignore" }
  const after = move.heldAfter ?? before + move.delta
  const side = move.delta > 0 ? "buy" : "sell"

  if (leg === null) {
    // Opened from nothing while the copy runs: a new position to follow.
    if (sign(before) === 0) {
      if (sign(after) === 0) return { kind: "ignore" }
      return { kind: "open", side, leg: { traderSz: after }, adding: false }
    }
    // Held before the copy began. Adding to it is a trade the copier cannot
    // mirror without the first part; taking from it is nothing of theirs.
    if (sign(after) === sign(before) && Math.abs(after) > Math.abs(before)) {
      return { kind: "skip", reason: "held-before" }
    }
    return { kind: "ignore" }
  }

  // Followed, but the trader was flat or on the other side before this trade:
  // the copy missed the close. What the copier holds of it goes.
  if (sign(before) === 0 || sign(before) !== sign(leg.traderSz)) {
    return { kind: "reduce", share: 1, leg: null }
  }
  // The same side and bigger is an add.
  if (sign(after) === sign(before) && Math.abs(after) > Math.abs(before)) {
    return { kind: "open", side, leg: { traderSz: after }, adding: true }
  }
  if (sign(after) === 0) return { kind: "reduce", share: 1, leg: null }
  if (sign(after) !== sign(before)) {
    return { kind: "reduce", share: 1, leg: null, turned: true }
  }
  const share = (Math.abs(before) - Math.abs(after)) / Math.abs(before)
  return {
    kind: "reduce",
    share: Math.min(1, Math.max(0, share)),
    leg: { traderSz: after },
  }
}

// ----- Why a copy was skipped, in plain words ---------------------------------

export type CopySkip =
  | { kind: "held-before" }
  | { kind: "turned" }
  | { kind: "late"; minutes: number }
  | { kind: "not-on-list" }
  | { kind: "thin-market"; volumeUsd: number }
  | { kind: "market-share"; copiedUsd: number; volumeUsd: number }
  | { kind: "leverage"; traderLeverage: number; maxLeverage: number }
  | { kind: "price-moved"; traderPx: number; nowPx: number; allowance: number }
  | { kind: "cap"; wouldBeUsd: number; maxOpenUsd: number }
  | { kind: "own-position" }
  | { kind: "copier-closed" }
  | { kind: "too-small"; detail: string }
  | { kind: "no-price" }
  | { kind: "failed"; detail: string }

/**
 * The Journal's sentence for a skipped copy. The trader and the coin are named
 * by the row around it, so the sentence starts with what happened.
 */
export function copySkipWords(
  skip: CopySkip,
  trader: string,
  coin: string
): string {
  switch (skip.kind) {
    case "held-before":
      return `${trader}'s ${coin} position began before your copy followed it, so adding to it is not copied.`
    case "turned":
      return `${trader} turned ${coin} round to the other side. Your copy closed, and the new side is not copied, because a copy only opens from nothing.`
    case "late":
      return `Trade heard about ${trader}'s ${coin} trade ${skip.minutes} minutes after it happened, too late to copy.`
    case "not-on-list":
      return `${coin} is not on your list of coins to copy.`
    case "thin-market":
      return `${coin} traded ${formatWholeUsd(skip.volumeUsd)} in the last day. Copying needs a market that trades at least ${formatWholeUsd(COPY_MIN_DAILY_VOLUME_USD)} a day.`
    case "market-share":
      return `Copies of ${coin} already came to ${formatWholeUsd(skip.copiedUsd)} today. Copies may be at most $1 in every $100 ${coin} trades, which is ${formatWholeUsd(skip.volumeUsd * COPY_MAX_SHARE_OF_DAILY_VOLUME)}.`
    case "leverage":
      return `${trader} used ${skip.traderLeverage}x, above the ${skip.maxLeverage}x you accept.`
    case "price-moved":
      return `${coin} moved from ${formatPrice(skip.traderPx)} to ${formatPrice(skip.nowPx)} before the copy could start, more than the ${allowanceWords(skip.allowance)} you allow.`
    case "cap":
      return `This copy would bring your copied positions to ${formatWholeUsd(skip.wouldBeUsd)}, above your ${formatWholeUsd(skip.maxOpenUsd)} limit.`
    case "own-position":
      return `Your wallet already holds ${coin} or has an order working on it, and a copy never mixes with your own trades.`
    case "copier-closed":
      return `You already closed your copy of this ${coin} position, so ${trader}'s add is not copied.`
    case "too-small":
      return skip.detail
    case "no-price":
      return `Trade could not read ${coin}'s price, so the copy did not start.`
    case "failed":
      return `The copy could not be placed: ${skip.detail}`
  }
}

// ----- Pauses ---------------------------------------------------------------

export type CopyPauseReason =
  | "trader-private"
  | "trader-stopped-copying"
  | "admin-stopped"
  | "key-not-working"
  | "loss-limit"
  | "real-money-off"
  | "wallet-gone"

/** Why a copy paused, as the notice and the Following page say it. */
export function copyPauseWords(reason: CopyPauseReason, trader: string): string {
  switch (reason) {
    case "trader-private":
      return `${trader}'s profile is no longer public.`
    case "trader-stopped-copying":
      return `${trader} switched copying off.`
    case "admin-stopped":
      return `Trade stopped new copies of ${trader}.`
    case "key-not-working":
      return "Your wallet's key stopped working. Save a new key to copy again."
    case "loss-limit":
      return "Your copied trades lost more than the limit you set."
    case "real-money-off":
      return "Copying with real money is switched off. Practice wallets can still copy."
    case "wallet-gone":
      return "The wallet the copies went in was removed or switched off."
  }
}

// ----- What the screens show ------------------------------------------------

/** One row of the Following page. */
export type FollowingRow = {
  handle: string
  displayName: string
  picture: string | null
  /** Dollars made in the last 30 days, or null when the profile is not public. */
  made30d: number | null
  followedAt: number
  copy: CopyRow | null
}

/** A copy as its copier sees it. */
export type CopyRow = {
  id: string
  status: CopyStatus
  /** The sentence behind a pause, or null. */
  pausedWords: string | null
  settings: CopySettings
  walletLabel: string
  walletKind: "paper" | "live"
  /** The trader's wallet being copied, as the profile names it. */
  traderVenue: string
  /** What copied trades have made or lost since the copy began, after every fee. */
  madeUsd: number
}

/** `notCopyable` on a member's own profile. */
export const OWN_PROFILE = "This is your own profile."

/** What a signed-in visitor's buttons on a profile need. */
export type ViewerRelation = {
  signedIn: true
  following: boolean
  copy: CopyRow | null
  /** Accepted the one-time "this is not advice" screen. */
  consented: boolean
  /** Null when this profile can be copied; otherwise the sentence why not. */
  notCopyable: string | null
  /** The trader's wallets a copy can follow, as the profile names them. */
  traderWallets: { id: string; venue: string; protocol: ProtocolId }[]
  /** The visitor's own wallets, for the Copy window. */
  myWallets: {
    id: string
    label: string
    kind: "paper" | "live"
    protocol: ProtocolId
    /** Null when this wallet may copy; otherwise the sentence why not. */
    refusal: string | null
    /** A real Hyperliquid wallet still needs its main wallet to approve the fee. */
    needsFeeApproval: boolean
    address: string | null
  }[]
  feeRate: number
  /** Trade's address for Hyperliquid's builder fee, or null when not set. */
  builderAddress: string | null
}

/** The trader's own Copiers section. Never who the copiers are. */
export type MyCopiers = {
  allowCopying: boolean
  payoutAddress: string | null
  followers: number
  copiers: number
  /** The most money the active copies may hold at once, added up. */
  copyingUsd: number
  owedUsd: number
  paidUsd: number
}

/** What the public profile adds about copying. */
export type PublicCopyFigures = {
  copyable: boolean
  followers: number
  copiers: number
  /** Real-money copiers' copied trades, last 30 days, after every fee. */
  copiersMade30d: number
  copiedTrades30d: number
  /** The trader's sales in 30 days, and how many came soon after copiers bought. */
  sales30d: number
  soldIntoCopiers30d: number
}

/** A copy that did not happen, as the copier's Journal lists it. */
export type CopyNote = {
  id: string
  walletId: string
  marketKey: string
  traderHandle: string
  note: string
  at: number
}
