import { and, desc, eq, inArray } from "drizzle-orm"

import { parseMarketKey, protocolLabel } from "@/lib/protocols/contracts"
import {
  buildTradingOverviewBots,
  buildTradingOverviewProfit,
  buildTradingOverviewActiveTrades,
  isTradingOverviewWallet,
  tradingOverviewWalletPerformance,
  type TradingOverview,
  type TradingOverviewFill,
  type TradingOverviewWallet,
} from "@/lib/trade/dashboard/overview"
import {
  moneyForWalletFill,
  walletProfitWindowStart,
} from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { tradeLiveFills } from "@/server/trade/schema"
import { loadWalletSummaries } from "@/server/trade/wallets"
import { loadLivePortfolio } from "@/server/trade/live-orders"
import { pricesEverySale } from "@/server/protocols/registry"
import { loadPaperPortfolio, marksForKeys } from "@/server/trade/paper"
import { listLatestFlowRuns } from "@/server/trade/flow-run-report"

/**
 * Everything the trading overview needs. Wallet figures come through the one
 * shared sweep, so this screen never knows how to ask any exchange itself.
 */
export async function loadTradingOverview(
  userId: string,
  includeActiveTrades: boolean,
  includeBots: boolean
): Promise<TradingOverview> {
  const [walletRead, runs] = await Promise.all([
    loadWalletSummaries(userId),
    includeBots ? listLatestFlowRuns(userId) : [],
  ])
  const summaries = new Map(
    walletRead.summaries.map((summary) => [summary.walletId, summary])
  )
  const liveWallets = walletRead.wallets.filter(isTradingOverviewWallet)

  const { activeTrades, activeTradesUnavailable } = includeActiveTrades
    ? await loadActiveTrades(userId, walletRead.wallets)
    : { activeTrades: [], activeTradesUnavailable: [] }
  const walletRows = liveWallets.map((wallet) => ({
    id: wallet.id,
    label: wallet.label,
    network: wallet.network,
    venue: protocolLabel(wallet.protocol),
    startingBalance: wallet.startingBalance,
    summary: summaries.get(wallet.id) ?? {
      walletId: wallet.id,
      state: "unreachable",
    },
  }))

  const rows =
    liveWallets.length === 0
      ? []
      : await db
          .select()
          .from(tradeLiveFills)
          .where(
            and(
              eq(tradeLiveFills.userId, userId),
              inArray(
                tradeLiveFills.walletId,
                liveWallets.map((wallet) => wallet.id)
              ),
              eq(tradeLiveFills.hidden, false)
            )
          )
          .orderBy(desc(tradeLiveFills.at))

  const walletById = new Map(liveWallets.map((wallet) => [wallet.id, wallet]))
  const fills: TradingOverviewFill[] = rows.flatMap((row) => {
    const wallet = walletById.get(row.walletId)
    if (!wallet) return []
    const marketRef = parseMarketKey(row.marketKey)
    const protocol = marketRef?.protocol ?? wallet.protocol
    return [
      {
        fillId: row.fillId,
        walletId: wallet.id,
        walletLabel: wallet.label,
        venue: protocolLabel(protocol),
        market: marketRef?.marketId ?? row.marketKey,
        side: row.side,
        px: row.px,
        sz: row.sz,
        at: Number(row.at),
        fee: row.fee,
        money: moneyForWalletFill({
          profitPerSale: pricesEverySale(protocol),
          side: row.side,
          closedPnl: row.closedPnl,
          fee: row.fee,
        }),
      },
    ]
  })

  const missingVenues = [
    ...new Set(
      walletRows
        .filter((wallet) => wallet.summary.state === "unreachable")
        .map((wallet) => wallet.venue)
    ),
  ].sort()

  const now = new Date()
  const performanceSince = walletProfitWindowStart()
  const fillsByWallet = new Map<string, TradingOverviewFill[]>()
  for (const fill of fills) {
    const walletFills = fillsByWallet.get(fill.walletId)
    if (walletFills) walletFills.push(fill)
    else fillsByWallet.set(fill.walletId, [fill])
  }
  const wallets: TradingOverviewWallet[] = walletRows.map((wallet) => {
    const walletFills = fillsByWallet.get(wallet.id) ?? []
    const performance =
      wallet.summary.state === "ok"
        ? tradingOverviewWalletPerformance(
            wallet.id,
            wallet.summary.openProfit,
            walletFills,
            performanceSince
          )
        : null
    return {
      ...wallet,
      performance,
      profit: performance
        ? buildTradingOverviewProfit(
            walletFills,
            performanceSince,
            performance.open,
            now.getTime()
          )
        : null,
    }
  })
  const countedWalletIds = new Set(
    wallets.flatMap((wallet) => (wallet.performance ? [wallet.id] : []))
  )
  const countedFills = fills.filter((fill) =>
    countedWalletIds.has(fill.walletId)
  )

  return {
    wallets,
    fills,
    activeTrades,
    activeTradesUnavailable,
    bots: buildTradingOverviewBots(runs),
    profit: countedWalletIds.size
      ? buildTradingOverviewProfit(
          countedFills,
          performanceSince,
          wallets.reduce(
            (total, wallet) => total + (wallet.performance?.open ?? 0),
            0
          ),
          now.getTime()
        )
      : [],
    missingVenues,
    unpricedFills: countedFills.filter(
      (fill) => fill.at >= performanceSince && fill.money === null
    ).length,
  }
}

async function loadActiveTrades(
  userId: string,
  wallets: Awaited<ReturnType<typeof loadWalletSummaries>>["wallets"]
) {
  const [paperPortfolio, livePortfolio] = await Promise.all([
    loadPaperPortfolio(userId, wallets).catch((error) => {
      console.error("Active practice trades could not be read", error)
      return null
    }),
    loadLivePortfolio(userId, wallets).catch((error) => {
      console.error("Active live trades could not be read", error)
      return null
    }),
  ])
  const positions = [
    ...(paperPortfolio?.positions ?? []),
    ...(livePortfolio?.positions ?? []),
  ]
  const marks = await marksForKeys(
    positions.map((position) => position.marketKey)
  )
  const activeTrades = buildTradingOverviewActiveTrades(
    positions,
    wallets,
    marks
  )
  const unavailableWalletIds = new Set(livePortfolio?.unreachable ?? [])
  if (!paperPortfolio) {
    for (const wallet of wallets) {
      if (wallet.kind === "paper") unavailableWalletIds.add(wallet.id)
    }
  }
  if (!livePortfolio) {
    for (const wallet of wallets) {
      if (wallet.kind === "live") unavailableWalletIds.add(wallet.id)
    }
  }
  return {
    activeTrades,
    activeTradesUnavailable: wallets
      .filter((wallet) => unavailableWalletIds.has(wallet.id))
      .map((wallet) => wallet.label),
  }
}
