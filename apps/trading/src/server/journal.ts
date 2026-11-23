import { and, desc, eq, inArray } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getInfoClient } from "@/server/hyperliquid/info"
import { tradingBotTrades, tradingWalletFills } from "@/server/schema"
import { listUserWallets } from "@/server/wallets"
import { now, uuid } from "@/server/util"

/**
 * How far back the very first sync reaches. Hyperliquid serves roughly a year
 * and caps a response near 2,000 fills, so this is the most history that can
 * ever be recovered — everything older is already gone. After the backfill we
 * only ever ask for what happened since the newest fill we hold.
 */
const BACKFILL_WINDOW_MS = 365 * 86_400_000

/**
 * Re-ask for a little before the newest stored fill. Fills that share a
 * millisecond can straddle the boundary, and the unique (wallet_id, hl_tid)
 * index makes re-reading one free.
 */
const RESYNC_OVERLAP_MS = 60_000

/**
 * Don't re-ask the exchange more than this often per user. Every page load
 * (and every reload) triggers a sync, and Hyperliquid answers a burst of them
 * with 429 Too Many Requests. Trades that arrive inside the window are picked
 * up by the next load; the stored history is served either way.
 */
const SYNC_THROTTLE_MS = 30_000

const lastSyncedAt = new Map<string, number>()

/** One stored fill, shaped for the client. */
export type JournalFill = {
  id: string
  walletId: string
  /** The bot that placed it; null means it was placed by hand. */
  botId: string | null
  market: string
  side: "buy" | "sell"
  dir: string | null
  px: number
  sz: number
  fee: number
  closedPnl: number
  /** Fill time, ms since epoch. */
  fillTime: number
}

export type JournalWallet = {
  id: string
  label: string
  /** Account equity now, used as the capital base for %-return columns. */
  accountValue: number
}

/**
 * Copies new real-money fills from Hyperliquid into `wallet_fills`.
 *
 * Only mainnet wallets are read. Testnet and practice money is excluded here,
 * at the source, rather than filtered in the UI — mixing them silently
 * dominates the totals (of one early sample of 46 fills, 39 were testnet).
 *
 * Bot fills are ordinary wallet fills, so they arrive through this same feed
 * and are tagged by matching Hyperliquid's trade id against `bot_trades`.
 * There is deliberately no second feed for them.
 *
 * Returns the number of new fills stored. Throws only if every wallet failed,
 * so one unreachable wallet cannot blank a page that has stored history.
 */
export async function syncWalletFills(
  userId: string,
  database: CustomShellDb = db
): Promise<number> {
  const startedAt = Date.now()
  const since = lastSyncedAt.get(userId)
  if (since !== undefined && startedAt - since < SYNC_THROTTLE_MS) return 0

  // Drop entries past the throttle window; they can never suppress a sync
  // again, and without this the map grows one permanent entry per user.
  for (const [key, at] of lastSyncedAt) {
    if (startedAt - at >= SYNC_THROTTLE_MS) lastSyncedAt.delete(key)
  }

  const wallets = (await listUserWallets(userId, database)).filter(
    (wallet) => wallet.network === "mainnet"
  )
  if (wallets.length === 0) return 0

  lastSyncedAt.set(userId, startedAt)

  const results = await Promise.allSettled(
    wallets.map((wallet) => syncOneWallet(wallet, database))
  )

  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length === wallets.length) {
    const first = failures[0] as PromiseRejectedResult
    throw first.reason instanceof Error
      ? first.reason
      : new Error("Could not reach Hyperliquid")
  }

  return results.reduce(
    (sum, result) => sum + (result.status === "fulfilled" ? result.value : 0),
    0
  )
}

type WalletRow = Awaited<ReturnType<typeof listUserWallets>>[number]

async function syncOneWallet(
  wallet: WalletRow,
  database: CustomShellDb
): Promise<number> {
  const address = (wallet.vaultAddress ??
    wallet.accountAddress) as `0x${string}`

  const [newest] = await database
    .select({ fillTime: tradingWalletFills.fillTime })
    .from(tradingWalletFills)
    .where(eq(tradingWalletFills.walletId, wallet.id))
    .orderBy(desc(tradingWalletFills.fillTime))
    .limit(1)

  const startTime = newest
    ? newest.fillTime.getTime() - RESYNC_OVERLAP_MS
    : Date.now() - BACKFILL_WINDOW_MS

  const fills = await getInfoClient("mainnet").userFillsByTime({
    user: address,
    startTime,
  })
  if (fills.length === 0) return 0

  // Which of these are bot fills. Hyperliquid's trade id is the join key —
  // the same fill can appear in bot_trades for a bot this wallet runs.
  const tids = fills
    .map((fill) => fill.tid)
    .filter((tid): tid is number => Number.isSafeInteger(tid))
  const botRows = tids.length
    ? await database
        .select({
          hlTid: tradingBotTrades.hlTid,
          botId: tradingBotTrades.botId,
        })
        .from(tradingBotTrades)
        .where(
          and(
            eq(tradingBotTrades.walletId, wallet.id),
            inArray(tradingBotTrades.hlTid, tids)
          )
        )
    : []
  const botByTid = new Map(
    botRows
      .filter((row) => row.hlTid !== null)
      .map((row) => [row.hlTid as number, row.botId])
  )

  const stamp = now()
  const rows = fills
    .filter((fill) => Number.isSafeInteger(fill.tid))
    .map((fill) => ({
      id: uuid(),
      walletId: wallet.id,
      botId: botByTid.get(fill.tid) ?? null,
      hlTid: fill.tid,
      market: fill.coin,
      // Hyperliquid reports the book side: "B" is a bid (buy), "A" an ask.
      side: fill.side === "B" ? ("buy" as const) : ("sell" as const),
      dir: fill.dir ?? null,
      px: fill.px,
      sz: fill.sz,
      fee: fill.fee ?? "0",
      closedPnl: fill.closedPnl ?? "0",
      oid: Number.isSafeInteger(fill.oid) ? fill.oid : null,
      cloid: fill.cloid ?? null,
      fillTime: new Date(fill.time),
      createdAt: stamp,
    }))
  if (rows.length === 0) return 0

  const inserted = await database
    .insert(tradingWalletFills)
    .values(rows)
    .onConflictDoNothing({
      target: [tradingWalletFills.walletId, tradingWalletFills.hlTid],
    })
    .returning({ id: tradingWalletFills.id })

  return inserted.length
}

/**
 * Every stored fill for the user's mainnet wallets, oldest first — the order
 * the round-trip pairing walks them in.
 */
export async function listWalletFills(
  userId: string,
  database: CustomShellDb = db
): Promise<{ wallets: JournalWallet[]; fills: JournalFill[] }> {
  const walletRows = (await listUserWallets(userId, database)).filter(
    (wallet) => wallet.network === "mainnet"
  )
  if (walletRows.length === 0) return { wallets: [], fills: [] }

  const walletIds = walletRows.map((wallet) => wallet.id)

  // Equity is the capital base for the %-return and drawdown columns. A wallet
  // we cannot reach reports 0, which those columns render as "—" rather than
  // inventing a denominator.
  const [rows, equities] = await Promise.all([
    database
      .select()
      .from(tradingWalletFills)
      .where(inArray(tradingWalletFills.walletId, walletIds))
      .orderBy(tradingWalletFills.fillTime),
    Promise.all(
      walletRows.map(async (wallet) => {
        const address = (wallet.vaultAddress ??
          wallet.accountAddress) as `0x${string}`
        const state = await getInfoClient("mainnet")
          .clearinghouseState({ user: address })
          .catch(() => null)
        const value = Number(state?.marginSummary?.accountValue ?? 0)
        return Number.isFinite(value) ? value : 0
      })
    ),
  ])

  return {
    wallets: walletRows.map((wallet, index) => ({
      id: wallet.id,
      label: wallet.label,
      accountValue: equities[index],
    })),
    fills: rows.map((row) => ({
      id: row.id,
      walletId: row.walletId,
      botId: row.botId,
      market: row.market,
      side: row.side === "buy" ? "buy" : "sell",
      dir: row.dir,
      px: Number(row.px),
      sz: Number(row.sz),
      fee: Number(row.fee),
      closedPnl: Number(row.closedPnl),
      fillTime: row.fillTime.getTime(),
    })),
  }
}
