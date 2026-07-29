import { and, asc, desc, eq, gte, inArray } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getInfoClient } from "@/server/hyperliquid/info"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import { tradingWalletFunding } from "@/server/schema"
import { listUserWallets } from "@/server/wallets"
import { now, uuid } from "@/server/util"

/**
 * How far back the very first sync reaches. Hyperliquid serves roughly a year
 * of funding history, so this is the most that can ever be recovered —
 * everything older is already gone and stays invisible.
 */
const BACKFILL_WINDOW_MS = 365 * 86_400_000

/**
 * Re-ask for a little before the newest stored payment. Payments that share a
 * millisecond can straddle the boundary, and the unique
 * (wallet_id, market, funding_time) index makes re-reading one free.
 */
const RESYNC_OVERLAP_MS = 60_000

/**
 * Don't re-ask the exchange more than this often per user. Every P&L page
 * load triggers a sync, and Hyperliquid answers a burst of them with 429 Too
 * Many Requests. Payments landing inside the window are picked up by the next
 * load; the stored history is served either way.
 */
const SYNC_THROTTLE_MS = 30_000

/**
 * The exchange returns at most this many funding entries per request
 * (verified live: a busy wallet's response is exactly 500 rows). A full page
 * means there is more history to fetch, so the backfill pages forward.
 */
const PAGE_LIMIT = 500

/**
 * Backfill safety cap. A year of hourly funding across several markets can be
 * tens of thousands of entries; at 500 per page this allows 100k. If a
 * backfill is cut short (rate limit, crash), each page was already stored, so
 * the next sync simply continues from the newest stored payment.
 */
const MAX_PAGES = 200

const lastSyncedAt = new Map<string, number>()

/** One funding payment as fetched from the exchange. */
export type FundingEvent = {
  /** Payment time, ms since epoch. */
  time: number
  coin: string
  /** Signed USDC credited to the wallet: positive = received, negative = paid. */
  usdc: string
  /** Signed position size the payment applied to. */
  szi: string
  /** Funding rate the exchange applied. */
  fundingRate: string
}

/** One page of funding history starting at `startTime` (inclusive). */
export type FundingFetcher = (
  network: TradingNetwork,
  user: `0x${string}`,
  startTime: number
) => Promise<FundingEvent[]>

const fetchFundingPage: FundingFetcher = async (network, user, startTime) => {
  const updates = await getInfoClient(network).userFunding({ user, startTime })
  return updates.map((update) => ({
    time: update.time,
    coin: update.delta.coin,
    usdc: update.delta.usdc,
    szi: update.delta.szi,
    fundingRate: update.delta.fundingRate,
  }))
}

/** Per-wallet outcome of a sync pass. Missing wallet id = throttled, so fresh. */
export type FundingSyncStatus = { walletId: string; ok: boolean }

/**
 * Copies new funding payments from Hyperliquid into `wallet_funding` for every
 * wallet the user owns, on both networks — the P&L page shows testnet wallets
 * too, and their costs must reconcile the same way.
 *
 * Returns one status per wallet so the caller can say plainly which wallets
 * may be missing recent payments instead of showing a silently wrong total.
 * A throttled pass returns [] — everything was refreshed moments ago.
 */
export async function syncWalletFunding(
  userId: string,
  database: CustomShellDb = db,
  options: { fetcher?: FundingFetcher; force?: boolean } = {}
): Promise<FundingSyncStatus[]> {
  const startedAt = Date.now()
  const since = lastSyncedAt.get(userId)
  if (
    !options.force &&
    since !== undefined &&
    startedAt - since < SYNC_THROTTLE_MS
  ) {
    return []
  }

  // Drop entries past the throttle window; they can never suppress a sync
  // again, and without this the map grows one permanent entry per user.
  for (const [key, at] of lastSyncedAt) {
    if (startedAt - at >= SYNC_THROTTLE_MS) lastSyncedAt.delete(key)
  }

  const wallets = await listUserWallets(userId, database)
  if (wallets.length === 0) return []

  lastSyncedAt.set(userId, startedAt)

  const fetcher = options.fetcher ?? fetchFundingPage
  const results = await Promise.allSettled(
    wallets.map((wallet) => syncOneWallet(wallet, database, fetcher))
  )

  return results.map((result, index) => ({
    walletId: wallets[index].id,
    ok: result.status === "fulfilled",
  }))
}

type WalletRow = Awaited<ReturnType<typeof listUserWallets>>[number]

async function syncOneWallet(
  wallet: WalletRow,
  database: CustomShellDb,
  fetcher: FundingFetcher
): Promise<number> {
  const address = (wallet.vaultAddress ??
    wallet.accountAddress) as `0x${string}`
  const network = wallet.network as TradingNetwork

  const [newest] = await database
    .select({ fundingTime: tradingWalletFunding.fundingTime })
    .from(tradingWalletFunding)
    .where(eq(tradingWalletFunding.walletId, wallet.id))
    .orderBy(desc(tradingWalletFunding.fundingTime))
    .limit(1)

  let startTime = newest
    ? newest.fundingTime.getTime() - RESYNC_OVERLAP_MS
    : Date.now() - BACKFILL_WINDOW_MS

  let stored = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const events = await fetcher(network, address, startTime)
    stored += await storePage(wallet.id, events, database)
    if (events.length < PAGE_LIMIT) break

    // A full page means more history follows. `startTime` is inclusive, so
    // resuming at the last time re-reads same-millisecond stragglers (the
    // unique index makes that free); the +1 guard keeps a page that failed to
    // advance from looping forever.
    const lastTime = events[events.length - 1].time
    startTime = lastTime > startTime ? lastTime : startTime + 1
  }

  return stored
}

/**
 * Stores one page immediately rather than accumulating, so a backfill cut
 * short by a rate limit keeps everything it managed to fetch.
 */
async function storePage(
  walletId: string,
  events: FundingEvent[],
  database: CustomShellDb
): Promise<number> {
  if (events.length === 0) return 0
  const stamp = now()
  const inserted = await database
    .insert(tradingWalletFunding)
    .values(
      events.map((event) => ({
        id: uuid(),
        walletId,
        market: event.coin,
        usdc: event.usdc,
        szi: event.szi,
        fundingRate: event.fundingRate,
        fundingTime: new Date(event.time),
        createdAt: stamp,
      }))
    )
    .onConflictDoNothing({
      target: [
        tradingWalletFunding.walletId,
        tradingWalletFunding.market,
        tradingWalletFunding.fundingTime,
      ],
    })
    .returning({ id: tradingWalletFunding.id })
  return inserted.length
}

/** One stored funding payment, shaped for the client. */
export type WalletFundingEntry = {
  /** Payment time, ms since epoch. */
  time: number
  coin: string
  /** Signed USDC: positive = received, negative = paid. */
  amount: number
}

/**
 * Every stored funding payment since `sinceMs` for the given wallets, oldest
 * first, grouped by wallet id.
 */
export async function listWalletFunding(
  walletIds: string[],
  sinceMs: number,
  database: CustomShellDb = db
): Promise<Map<string, WalletFundingEntry[]>> {
  const grouped = new Map<string, WalletFundingEntry[]>()
  if (walletIds.length === 0) return grouped

  const rows = await database
    .select({
      walletId: tradingWalletFunding.walletId,
      market: tradingWalletFunding.market,
      usdc: tradingWalletFunding.usdc,
      fundingTime: tradingWalletFunding.fundingTime,
    })
    .from(tradingWalletFunding)
    .where(
      and(
        inArray(tradingWalletFunding.walletId, walletIds),
        gte(tradingWalletFunding.fundingTime, new Date(sinceMs))
      )
    )
    .orderBy(asc(tradingWalletFunding.fundingTime))

  for (const row of rows) {
    const amount = Number(row.usdc)
    if (!Number.isFinite(amount)) continue
    let entries = grouped.get(row.walletId)
    if (!entries) {
      entries = []
      grouped.set(row.walletId, entries)
    }
    entries.push({
      time: row.fundingTime.getTime(),
      coin: row.market,
      amount,
    })
  }
  return grouped
}
