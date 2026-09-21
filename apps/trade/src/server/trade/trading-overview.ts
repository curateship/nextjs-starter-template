import { and, desc, eq, gte, inArray, lt } from "drizzle-orm"

import { parseMarketKey, protocolLabel } from "@/lib/protocols/contracts"
import {
  buildTradingOverviewBots,
  buildTradingOverviewProfit,
  buildTradingOverviewActiveTrades,
  buildTradingOverviewWatchingOrders,
  isTradingOverviewWallet,
  tradingOverviewWalletPerformance,
  type TradingOverview,
  type ActiveTradesSnapshot,
  type TradingOverviewFill,
  type TradingOverviewWallet,
} from "@/lib/trade/dashboard/overview"
import {
  moneyForWalletFill,
  walletProfitWindowStart,
  type TradeWallet,
} from "@/lib/trade/wallets"
import { gridRoundTrips } from "@/lib/trade/live-trades"
import type { TradeSide } from "@/lib/trade/paper"
import { db } from "@/server/db"
import { stampGridFills } from "@/server/trade/grid-fills"
import { tradeLiveFills } from "@/server/trade/schema"
import {
  listWalletsWithCredentials,
  loadWalletSummaries,
} from "@/server/trade/wallets"
import { loadLivePortfolio } from "@/server/trade/live-orders"
import { pricesEverySale } from "@/server/protocols/registry"
import { loadPaperPortfolio, marksForKeys } from "@/server/trade/paper"
import { listLatestFlowRuns } from "@/server/trade/flow-run-report"
import { listActiveSmartOrders } from "@/server/trade/smart-orders"
import { recordEngineError } from "@/server/trade/engine-errors"

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

  const fills = await loadOverviewFills(userId, liveWallets)

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
    readAt: now.getTime(),
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

/**
 * Every visible real fill of the wallets given, newest first, priced the way
 * the overview's Made or lost figure prices them. Shared with the P&L page so
 * its month grid adds up the same fills, and the same money, as the PnL Graph.
 *
 * **A grid's sale is worth what its own rung made**, the same figure the chart
 * arrow and the Smart orders panel show, never the exchange's. The exchange
 * books every part-sale against one blended average, and while a grid is
 * running that average is held up by the rungs still holding, so a rung that
 * did its job reads here as a loss. `gridRoundTrips` has the arithmetic.
 *
 * **A `since` read still prices from the whole history.** What a sale made is
 * decided by the buy it closed, which is often older than the window: the
 * daily goal reads today's fills, and a rung that bought yesterday and sold
 * this morning has its buy outside them. Pricing from the window alone made
 * the goal and the P&L page disagree about the same day by $68 on
 * 20 Sep 2026. So the fills of every market in the window are read in full,
 * used to work the round trips out, and only the window's own rows come back.
 */
export async function loadOverviewFills(
  userId: string,
  wallets: readonly Pick<TradeWallet, "id" | "label" | "protocol">[],
  /**
   * Only fills at or after this instant. The overview and the P&L page want
   * every fill and leave it unset; the daily goal wants today's alone and
   * reads it every fifteen seconds, which is not a reason to carry eighty
   * thousand rows out of the database each time.
   */
  since?: number
): Promise<TradingOverviewFill[]> {
  if (wallets.length === 0) return []
  const walletIds = wallets.map((wallet) => wallet.id)
  const mine = and(
    eq(tradeLiveFills.userId, userId),
    inArray(tradeLiveFills.walletId, walletIds),
    eq(tradeLiveFills.hidden, false)
  )
  const rows = await db
    .select()
    .from(tradeLiveFills)
    .where(
      since === undefined ? mine : and(mine, gte(tradeLiveFills.at, since))
    )
    .orderBy(desc(tradeLiveFills.at))

  // The buys behind the window's sales, for the markets the window touches
  // and no others. A market nobody traded today cannot hold a coin sold
  // today, so reading it would be rows carried for nothing.
  const marketKeys = [...new Set(rows.map((row) => row.marketKey))]
  const earlier =
    since === undefined || marketKeys.length === 0
      ? []
      : await db
          .select()
          .from(tradeLiveFills)
          .where(
            and(
              mine,
              lt(tradeLiveFills.at, since),
              inArray(tradeLiveFills.marketKey, marketKeys)
            )
          )
          .orderBy(desc(tradeLiveFills.at))

  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]))
  const stamped = await stampGridFills(
    userId,
    walletIds,
    [...rows, ...earlier].map((row) => ({
      fillId: row.fillId,
      orderId: row.orderId,
      walletId: row.walletId,
      marketKey: row.marketKey,
      side: row.side as TradeSide,
      px: row.px,
      sz: row.sz,
      at: Number(row.at),
      closedPnl: row.closedPnl,
      fee: row.fee,
      dir: row.dir,
      liquidation: row.liquidation,
    }))
  )
  const rungs = gridRoundTrips(stamped)
  return rows.flatMap((row) => {
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
        money:
          rungs.get(row.fillId)?.money ??
          moneyForWalletFill({
            profitPerSale: pricesEverySale(protocol),
            side: row.side,
            closedPnl: row.closedPnl,
            fee: row.fee,
          }),
      },
    ]
  })
}

/** The small account-wide answer used by the active-trades header menu. */
export async function loadActiveTradesSnapshot(
  userId: string
): Promise<ActiveTradesSnapshot> {
  // The header needs the wallet list so it can read positions. Asking every
  // exchange for balances first duplicated the slowest part of the account
  // poll and left the header on dashes while an answer it never used arrived.
  const walletRead = await listWalletsWithCredentials(userId)
  return {
    readAt: Date.now(),
    ...(await loadActiveTrades(
      userId,
      walletRead.wallets,
      walletRead.credentials
    )),
  }
}

async function loadActiveTrades(
  userId: string,
  wallets: Awaited<ReturnType<typeof loadWalletSummaries>>["wallets"],
  credentials?: ReadonlyMap<string, () => string | null>
) {
  const [paperPortfolio, livePortfolio, smartOrders] = await Promise.all([
    loadPaperPortfolio(userId, wallets).catch((error) => {
      recordEngineError(
        "trading-overview",
        "Active practice trades could not be read",
        error
      )
      return null
    }),
    loadLivePortfolio(userId, wallets, { credentials }).catch((error) => {
      recordEngineError(
        "trading-overview",
        "Active live trades could not be read",
        error
      )
      return null
    }),
    listActiveSmartOrders(
      userId,
      wallets.map((wallet) => wallet.id)
    ),
  ])
  const positions = [
    ...(paperPortfolio?.positions ?? []),
    ...(livePortfolio?.positions ?? []),
  ]
  const marks = await marksForKeys(
    [...new Set([...positions.map((position) => position.marketKey), ...smartOrders.map((order) => order.marketKey)])]
  )
  const activeTrades = buildTradingOverviewActiveTrades(
    positions,
    wallets,
    marks,
    smartOrders
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
    watchingOrders: buildTradingOverviewWatchingOrders(smartOrders, wallets, marks),
    activeTradesUnavailable: wallets
      .filter((wallet) => unavailableWalletIds.has(wallet.id))
      .map((wallet) => wallet.id),
  }
}
