import type { NetworkId } from "@/lib/protocols/contracts"
import {
  positionMargin,
  positionProfit,
  positionValue,
  type PaperPosition,
} from "@/lib/trade/paper"
import type { WalletAccountSummary } from "@/lib/trade/wallets"
import { venueLabel, type TradeWallet } from "@/lib/trade/wallets"

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

export type TradingOverviewActiveTrade = {
  id: string
  walletId: string
  walletLabel: string
  accountType: "Practice" | "Testnet" | "Real"
  protocol: string
  marketKey: string
  market: string
  side: "long" | "short"
  leverage: number
  value: number | null
  profit: number | null
  profitShare: number | null
}

export type TradingOverview = {
  wallets: TradingOverviewWallet[]
  fills: TradingOverviewFill[]
  activeTrades: TradingOverviewActiveTrade[]
  activeTradesUnavailable: string[]
  profit: TradingOverviewPoint[]
  missingVenues: string[]
  unpricedFills: number
}

/** Turns the shared position rows into the account-wide open-trades list. */
export function buildTradingOverviewActiveTrades(
  positions: readonly PaperPosition[],
  wallets: readonly TradeWallet[],
  marks: ReadonlyMap<string, number>
): TradingOverviewActiveTrade[] {
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]))

  return positions.flatMap((position) => {
    const wallet = walletById.get(position.walletId)
    if (!wallet) return []
    const mark = marks.get(position.marketKey)
    const profit = mark === undefined ? null : positionProfit(position, mark)
    const margin = position.live?.marginUsed ?? positionMargin(position)
    const market = position.marketKey.split(":").slice(2).join(":")
    return [
      {
        id: position.id,
        walletId: wallet.id,
        walletLabel: wallet.label,
        accountType:
          wallet.kind === "paper"
            ? ("Practice" as const)
            : wallet.network === "testnet"
              ? ("Testnet" as const)
              : ("Real" as const),
        protocol: venueLabel(wallet.protocol, wallet.network),
        marketKey: position.marketKey,
        market,
        side: position.szi > 0 ? ("long" as const) : ("short" as const),
        leverage: position.leverage,
        value: mark === undefined ? null : positionValue(position, mark),
        profit,
        profitShare: profit !== null && margin > 0 ? profit / margin : null,
      },
    ]
  })
}

export function isTradingOverviewWallet(wallet: {
  kind: string
  network: NetworkId
}) {
  return wallet.kind === "live" && wallet.network === "mainnet"
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

/** Settled profit since yesterday, with current open profit at the endpoint. */
export function buildTradingOverviewProfit(
  fills: readonly Pick<TradingOverviewFill, "at" | "money">[],
  since: number,
  openProfit: number,
  now: number
): TradingOverviewPoint[] {
  const ordered = fills
    .filter(
      (fill): fill is typeof fill & { money: number } =>
        fill.at >= since && fill.money !== null
    )
    .sort((left, right) => left.at - right.at)
  let money = 0
  const points: TradingOverviewPoint[] = [{ at: since, money }]
  for (const fill of ordered) {
    money += fill.money
    points.push({ at: fill.at, money })
  }
  const currentAt = Math.max(now, points.at(-1)?.at ?? since)
  const currentMoney = money + openProfit
  if (points.at(-1)?.at === currentAt) {
    points[points.length - 1] = { at: currentAt, money: currentMoney }
  } else {
    points.push({ at: currentAt, money: currentMoney })
  }
  return points
}
