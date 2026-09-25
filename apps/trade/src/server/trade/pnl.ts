import { and, eq, inArray } from "drizzle-orm"

import { marketSymbol } from "@/lib/protocols/contracts"
import type { TradingOverviewFill } from "@/lib/trade/dashboard/overview"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import type { PnlTrade } from "@/lib/trade/pnl/patterns"
import { periodStart, type PnlPeriod } from "@/lib/trade/pnl/periods"
import { walletProfitWindowStart, type TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { loadLiveHistory } from "@/server/trade/live-fills"
import { loadPaperHistory } from "@/server/trade/paper"
import { tradeLiveTriggers } from "@/server/trade/schema"
import { loadOverviewFills } from "@/server/trade/trading-overview"
import { listWallets } from "@/server/trade/wallets"

/**
 * The P&L page's reads. Nothing here asks an exchange anything: the page is
 * about trades that are finished, and every one of those is already in the
 * database. That is what lets it open in one database trip and never spend
 * a venue's request allowance.
 */

/** One page of the Journal, practice and real together, newest first. */
export type PnlJournalPage = {
  trades: LiveTrade[]
  /** Saved fills outside any finished trade — the History incomplete rows. */
  fills: LiveFill[]
  /** Where the next page of each kind starts, or null when there is no more. */
  paperBefore: number | null
  liveBefore: number | null
}

export type PnlPage = {
  readAt: number
  wallets: { id: string; label: string }[]
  journal: PnlJournalPage
  /** Every priced and unpriced real fill since records began, for the grid. */
  fills: Pick<TradingOverviewFill, "at" | "money">[]
  /** Every finished real-money trade since records began, newest first. */
  trades: PnlTrade[]
}

/** Real money on a real network: the only trades the cards and score see. */
function countedWallets(wallets: readonly TradeWallet[]): TradeWallet[] {
  return wallets.filter(
    (wallet) => wallet.kind === "live" && wallet.network === "mainnet"
  )
}

/**
 * One page of the Journal. `before` says where each kind's page starts:
 * undefined for the newest page, a time for an older one, and null when that
 * kind has already run out, so it is not asked again.
 */
async function loadJournalPage(
  userId: string,
  wallets: readonly TradeWallet[],
  before: { paper?: number | null; live?: number | null } = {}
): Promise<PnlJournalPage> {
  const paperIds = wallets
    .filter((one) => one.kind === "paper")
    .map((one) => one.id)
  const liveIds = wallets
    .filter((one) => one.kind === "live")
    .map((one) => one.id)
  const [paper, live] = await Promise.all([
    before.paper === null
      ? null
      : loadPaperHistory(userId, paperIds, before.paper),
    before.live === null ? null : loadLiveHistory(userId, liveIds, before.live),
  ])
  return {
    trades: [...(paper?.trades ?? []), ...(live?.trades ?? [])].sort(
      (left, right) => right.closedAt - left.closedAt
    ),
    fills: [...(paper?.fills ?? []), ...(live?.fills ?? [])],
    paperBefore: paper?.nextBefore ?? null,
    liveBefore: live?.nextBefore ?? null,
  }
}

/**
 * Every finished real trade that closed at or after `since`, walking the
 * Journal's pages back until one reaches past it. Records begin on 20 August
 * 2026, so this is a short walk, and it is bounded either way.
 */
async function loadLiveTradesSince(
  userId: string,
  walletIds: readonly string[],
  since: number
): Promise<LiveTrade[]> {
  const trades: LiveTrade[] = []
  let before: number | undefined
  for (let page = 0; page < 20; page += 1) {
    const read = await loadLiveHistory(userId, walletIds, before)
    for (const trade of read.trades) {
      if (trade.closedAt >= since) trades.push(trade)
    }
    const oldest = read.trades.at(-1)
    if (read.nextBefore === null || (oldest && oldest.closedAt < since)) break
    before = read.nextBefore
  }
  const seen = new Set<string>()
  return trades.filter((trade) => {
    if (seen.has(trade.id)) return false
    seen.add(trade.id)
    return true
  })
}

/**
 * Whether a stop was ever seen on the position each trade was.
 *
 * The app writes down every stop order it sees sitting on a real position
 * (`trade_live_triggers`, with the moment it was seen), and the trade's own
 * ending says when a stop is what closed it. A trade counts as "with a stop"
 * on either. Watching began when the wallet was added, so an older trade with
 * no record reads as "no stop" — the honest answer is that none was seen.
 */
async function stopsSeen(
  userId: string,
  walletIds: readonly string[],
  trades: readonly LiveTrade[]
): Promise<Set<string>> {
  const withStop = new Set<string>()
  if (trades.length === 0) return withStop
  const rows = await db
    .select({
      walletId: tradeLiveTriggers.walletId,
      marketKey: tradeLiveTriggers.marketKey,
      seenAt: tradeLiveTriggers.seenAt,
    })
    .from(tradeLiveTriggers)
    .where(
      and(
        eq(tradeLiveTriggers.userId, userId),
        inArray(tradeLiveTriggers.walletId, [...walletIds]),
        eq(tradeLiveTriggers.kind, "stop")
      )
    )
  const seenBy = new Map<string, number[]>()
  for (const row of rows) {
    const key = `${row.walletId} ${row.marketKey}`
    const list = seenBy.get(key)
    const at = row.seenAt.getTime()
    if (list) list.push(at)
    else seenBy.set(key, [at])
  }
  for (const trade of trades) {
    if (trade.ending === "stop") {
      withStop.add(trade.id)
      continue
    }
    const seen = seenBy.get(`${trade.walletId} ${trade.marketKey}`) ?? []
    if (seen.some((at) => at >= trade.openedAt && at <= trade.closedAt)) {
      withStop.add(trade.id)
    }
  }
  return withStop
}

function toPnlTrade(trade: LiveTrade, hadStop: boolean): PnlTrade {
  return {
    id: trade.id,
    symbol: marketSymbol(trade.marketKey),
    direction: trade.direction,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    heldMs: trade.heldMs,
    entryPx: trade.entryPx,
    exitPx: trade.exitPx,
    sz: trade.sz,
    amountUsd: trade.amountUsd,
    pnl: trade.pnl,
    fees: trade.fills.reduce((sum, fill) => sum + fill.fee, 0),
    hadStop,
    overrode: (trade.overrode?.length ?? 0) > 0,
    ending: trade.ending,
  }
}

/** The real-money trades the cards and the score work from, since `since`. */
async function loadCountedTrades(
  userId: string,
  wallets: readonly TradeWallet[],
  since: number
): Promise<PnlTrade[]> {
  const ids = countedWallets(wallets).map((wallet) => wallet.id)
  if (ids.length === 0) return []
  const trades = await loadLiveTradesSince(userId, ids, since)
  const withStop = await stopsSeen(userId, ids, trades)
  return trades.map((trade) => toPnlTrade(trade, withStop.has(trade.id)))
}

export async function loadPnlPage(userId: string): Promise<PnlPage> {
  const wallets = await listWallets(userId)
  const counted = countedWallets(wallets)
  const since = walletProfitWindowStart()
  const [journal, fills, trades] = await Promise.all([
    loadJournalPage(userId, wallets),
    loadOverviewFills(userId, counted),
    loadCountedTrades(userId, wallets, since),
  ])
  return {
    readAt: Date.now(),
    wallets: wallets.map((wallet) => ({ id: wallet.id, label: wallet.label })),
    journal,
    fills: fills.map((fill) => ({ at: fill.at, money: fill.money })),
    trades,
  }
}

export async function loadOlderPnlJournal(
  userId: string,
  before: { paper: number | null; live: number | null }
): Promise<PnlJournalPage> {
  const wallets = await listWallets(userId)
  return loadJournalPage(userId, wallets, before)
}

/** The period's closed real-money trades, the score's whole input. */
export async function loadPeriodTrades(
  userId: string,
  period: PnlPeriod,
  now = Date.now()
): Promise<PnlTrade[]> {
  const wallets = await listWallets(userId)
  return loadCountedTrades(userId, wallets, periodStart(period, now))
}
