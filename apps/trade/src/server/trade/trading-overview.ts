import { and, desc, eq, inArray } from "drizzle-orm"

import { parseMarketKey, protocolLabel } from "@/lib/protocols/contracts"
import {
  buildTradingOverviewProfit,
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

/**
 * Everything the trading overview needs. Wallet figures come through the one
 * shared sweep, so this screen never knows how to ask any exchange itself.
 */
export async function loadTradingOverview(
  userId: string
): Promise<TradingOverview> {
  const walletRead = await loadWalletSummaries(userId)
  const summaries = new Map(
    walletRead.summaries.map((summary) => [summary.walletId, summary])
  )
  const liveWallets = walletRead.wallets.filter(isTradingOverviewWallet)
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
          protocol,
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
  const performanceSince = walletProfitWindowStart(now)
  const wallets: TradingOverviewWallet[] = walletRows.map((wallet) => ({
    ...wallet,
    performance:
      wallet.summary.state === "ok"
        ? tradingOverviewWalletPerformance(
            wallet.id,
            wallet.summary.openProfit,
            fills,
            performanceSince
          )
        : null,
  }))
  const countedWalletIds = new Set(
    wallets.flatMap((wallet) => (wallet.performance ? [wallet.id] : []))
  )
  const countedFills = fills.filter((fill) =>
    countedWalletIds.has(fill.walletId)
  )

  return {
    wallets,
    fills,
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
