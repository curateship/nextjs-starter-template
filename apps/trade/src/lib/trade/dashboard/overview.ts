import { runAtFromTimezoneInput } from "@/lib/automations/schedule"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import type { WalletAccountSummary } from "@/lib/trade/wallets"

const TRADING_OVERVIEW_TIMEZONE = "America/Toronto"

export type TradingOverviewWallet = {
  id: string
  label: string
  network: NetworkId
  venue: string
  startingBalance: number
  summary: WalletAccountSummary
  performance: TradingOverviewWalletPerformance | null
}

export type TradingOverviewWalletPerformance = {
  settled: number
  open: number
  madeOrLost: number
}

export type TradingOverviewFill = {
  fillId: string
  walletId: string
  walletLabel: string
  venue: string
  market: string
  side: "buy" | "sell"
  px: number
  sz: number
  at: number
  fee: number
  money: number | null
}

export type TradingOverviewPoint = { at: number; money: number }

export type TradingOverview = {
  wallets: TradingOverviewWallet[]
  fills: TradingOverviewFill[]
  equity: TradingOverviewPoint[]
  missingVenues: string[]
  unpricedFills: number
}

export function isTradingOverviewWallet(wallet: {
  kind: string
  network: NetworkId
}) {
  return wallet.kind === "live" && wallet.network === "mainnet"
}

/** KuCoin gives a figure when a position closes, not when part of one is sold. */
export function moneyForOverviewFill(fill: {
  protocol: ProtocolId
  side: "buy" | "sell"
  closedPnl: number
  fee: number
}): number | null {
  if (
    fill.protocol === "kucoin" &&
    fill.side === "sell" &&
    fill.closedPnl === 0
  ) {
    return null
  }
  return fill.closedPnl - fill.fee
}

/**
 * Trading performance comes from trades, never from a change in account
 * equity. Deposits and withdrawals therefore change Balance without being
 * mistaken for money made or lost.
 */
export function tradingOverviewWalletPerformance(
  walletId: string,
  openProfit: number,
  fills: readonly Pick<TradingOverviewFill, "walletId" | "money" | "at">[],
  since: number
): TradingOverviewWalletPerformance {
  let settled = 0
  for (const fill of fills) {
    if (fill.walletId !== walletId || fill.at < since) continue
    if (fill.money === null) continue
    settled += fill.money
  }
  return {
    settled,
    open: openProfit,
    madeOrLost: settled + openProfit,
  }
}

/** Midnight at the start of yesterday in the account owner's timezone. */
export function tradingOverviewWindowStart(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRADING_OVERVIEW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const localDay = new Date(
    Date.UTC(value("year"), value("month") - 1, value("day"))
  )
  localDay.setUTCDate(localDay.getUTCDate() - 1)
  const input = `${localDay.getUTCFullYear()}-${String(localDay.getUTCMonth() + 1).padStart(2, "0")}-${String(localDay.getUTCDate()).padStart(2, "0")}T00:00`
  const instant = runAtFromTimezoneInput(input, TRADING_OVERVIEW_TIMEZONE)
  if (!instant) throw new Error("TRADING_OVERVIEW_WINDOW")
  return new Date(instant).getTime()
}

/**
 * Starts with every real wallet's recorded opening balance, then applies the
 * fills in time order. Fees are known even when KuCoin has not stated the
 * profit on a partial sale, so those still come off the line.
 */
export function buildTradingOverviewEquity(
  wallets: readonly Pick<TradingOverviewWallet, "startingBalance">[],
  fills: readonly Pick<TradingOverviewFill, "at" | "fee" | "money">[]
): TradingOverviewPoint[] {
  const opening = wallets.reduce(
    (sum, wallet) => sum + wallet.startingBalance,
    0
  )
  const ordered = [...fills].sort((left, right) => left.at - right.at)
  if (ordered.length === 0) return []

  let money = opening
  const points: TradingOverviewPoint[] = [
    { at: Math.max(0, ordered[0].at - 1), money },
  ]
  for (const fill of ordered) {
    money += fill.money === null ? -fill.fee : fill.money
    points.push({ at: fill.at, money })
  }
  return points
}
