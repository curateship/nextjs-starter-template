import type { NetworkId } from "@/lib/protocols/contracts"
import {
  positionMargin,
  positionProfit,
  positionValue,
  type TradePosition,
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
  profit: TradingOverviewPoint[] | null
}

export type TradingOverviewWalletPerformance = {
  settled: number
  fees: number
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

export type TradingOverviewBotState =
  "running" | "waiting" | "paused" | "stopping" | "stopped"

export type TradingOverviewBot = {
  automationId: string
  runId: string
  name: string
  state: TradingOverviewBotState
  statusWords: string | null
  marketCount: number
  positionCount: number
  netUsd: number
  startedAt: number
}

type TradingOverviewBotRun = {
  id: string
  automationId: string
  automationName: string
  status: "running" | "stopping" | "stopped"
  paused: boolean
  holding: boolean
  working: number
  startedAt: number
  stoppedReason: string | null
  headline: { words: string; problem: boolean } | null
  coins: number
  holdingCoins: number
  netUsd: number
}

export type TradingOverview = {
  readAt: number
  wallets: TradingOverviewWallet[]
  fills: TradingOverviewFill[]
  activeTrades: TradingOverviewActiveTrade[]
  activeTradesUnavailable: string[]
  bots: TradingOverviewBot[]
  profit: TradingOverviewPoint[]
  missingVenues: string[]
  unpricedFills: number
}

/**
 * Replaces each part that answered and carries the last good figures for a
 * wallet that did not. The one read time stays at the oldest carried answer.
 */
export function mergeTradingOverviewRefresh(
  was: TradingOverview,
  fresh: TradingOverview
): TradingOverview {
  const walletFiguresFailed = fresh.wallets.some((wallet) => {
    if (wallet.summary.state !== "unreachable") return false
    return was.wallets.some(
      (before) => before.id === wallet.id && before.summary.state === "ok"
    )
  })
  const unavailablePositionWallets = new Set(fresh.activeTradesUnavailable)
  const freshActiveTradeIds = new Set(
    fresh.activeTrades.map((trade) => trade.id)
  )
  const heldActiveTrades = was.activeTrades.filter(
    (trade) =>
      unavailablePositionWallets.has(trade.walletId) &&
      !freshActiveTradeIds.has(trade.id)
  )
  const carried = walletFiguresFailed || unavailablePositionWallets.size > 0

  return {
    ...fresh,
    readAt: carried ? Math.min(was.readAt, fresh.readAt) : fresh.readAt,
    ...(walletFiguresFailed
      ? {
          wallets: was.wallets,
          profit: was.profit,
          missingVenues: was.missingVenues,
          unpricedFills: was.unpricedFills,
        }
      : {}),
    activeTrades: [...fresh.activeTrades, ...heldActiveTrades],
  }
}

const BOT_STATE_ORDER: Record<TradingOverviewBotState, number> = {
  running: 0,
  waiting: 1,
  paused: 2,
  stopping: 3,
  stopped: 4,
}

/**
 * Keeps the newest run of each flow. An unexpected stop remains until its run
 * is deleted or the flow starts again, while a stop somebody asked for leaves
 * the widget at once.
 */
export function buildTradingOverviewBots(
  runs: readonly TradingOverviewBotRun[]
): TradingOverviewBot[] {
  const latest = [...runs].sort(
    (left, right) => right.startedAt - left.startedAt
  )
  const seen = new Set<string>()
  const bots = latest.flatMap((run): TradingOverviewBot[] => {
    if (seen.has(run.automationId)) return []
    seen.add(run.automationId)
    if (
      run.status === "stopped" &&
      run.stoppedReason === "Switched off by hand."
    ) {
      return []
    }

    const state: TradingOverviewBotState =
      run.status === "stopped"
        ? "stopped"
        : run.status === "stopping"
          ? "stopping"
          : run.paused
            ? "paused"
            : run.holding || (run.headline !== null && run.working === 0)
              ? "waiting"
              : "running"
    const statusWords =
      state === "stopped"
        ? (run.stoppedReason ?? "Stopped.")
        : state === "stopping"
          ? `${run.working} ${run.working === 1 ? "ladder" : "ladders"} left to call off.`
          : state === "paused"
            ? "Looking at nothing."
            : (run.headline?.words ?? null)

    return [
      {
        automationId: run.automationId,
        runId: run.id,
        name: run.automationName,
        state,
        statusWords,
        marketCount: run.coins,
        positionCount: run.holdingCoins,
        netUsd: run.netUsd,
        startedAt: run.startedAt,
      },
    ]
  })

  return bots.sort(
    (left, right) =>
      BOT_STATE_ORDER[left.state] - BOT_STATE_ORDER[right.state] ||
      right.startedAt - left.startedAt
  )
}

/** Turns the shared position rows into the account-wide open-trades list. */
export function buildTradingOverviewActiveTrades(
  positions: readonly TradePosition[],
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
  fills: readonly Pick<
    TradingOverviewFill,
    "walletId" | "money" | "fee" | "at"
  >[],
  since: number
): TradingOverviewWalletPerformance {
  let settled = 0
  let fees = 0
  for (const fill of fills) {
    if (fill.walletId !== walletId || fill.at < since) continue
    // The exchange still charged the fee when it could not price the sale.
    fees += fill.fee
    if (fill.money === null) continue
    settled += fill.money
  }
  return {
    settled,
    fees,
    open: openProfit,
    madeOrLost: settled + openProfit,
  }
}

/** Settled profit since the start day, with current open profit at the endpoint. */
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
