import { randomUUID } from "node:crypto"

import { and, eq, inArray } from "drizzle-orm"

import {
  builderFeeTenthsBps,
  COPY_FEE_RATE_DEFAULT,
  COPY_TRADER_SHARE_DEFAULT,
  copyFee,
  HYPERLIQUID_MAX_BUILDER_FEE,
} from "@/lib/trade/copy/copy-rules"
import type { LiveTrade } from "@/lib/trade/live-trades"
import type { TradeSide } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/trade/db"
import { recordEngineError } from "@/server/trade/engine-errors"
import { bumpTradeHistory } from "@/server/trade/history-version"
import {
  tradeCopies,
  tradeCopyConfig,
  tradeCopyFills,
  tradeCopyNotes,
  tradeCopyOrders,
  tradeLiveFills,
  tradePublicProfiles,
} from "@/server/trade/schema"

/**
 * The money side of copying: which orders a copy sent, one fee row per copied
 * fill, and the fee settings those rows are priced with.
 *
 * **The fee rows are the only record of what is owed.** The trader's earnings,
 * the admin's payout list and the profile's "people copying made or lost" all
 * add these rows up. Nothing works a fee out again from memory.
 *
 * Kept apart from the rest of copying so the two places that write fills, the
 * practice engine's save and the real fills sweep, can call it without pulling
 * in the order-placing code.
 */

export type CopyConfig = {
  feeRate: number
  traderShare: number
  /** Real-money copying is switched on. Practice copying always works. */
  realMoney: boolean
}

const CONFIG_TTL_MS = 10_000
let cachedConfig: { at: number; config: CopyConfig } | null = null

export function forgetCopyConfig(): void {
  cachedConfig = null
}

/** The one row Admin → Copy trading writes, read at most every 10 seconds. */
export async function loadCopyConfig(
  database: CustomShellDb = db
): Promise<CopyConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL_MS) {
    return cachedConfig.config
  }
  const [row] = await database
    .select()
    .from(tradeCopyConfig)
    .where(eq(tradeCopyConfig.id, "default"))
  const config: CopyConfig = row
    ? {
        feeRate: row.feeRate,
        traderShare: row.traderShare,
        realMoney: row.realMoney,
      }
    : {
        feeRate: COPY_FEE_RATE_DEFAULT,
        traderShare: COPY_TRADER_SHARE_DEFAULT,
        realMoney: false,
      }
  cachedConfig = { at: Date.now(), config }
  return config
}

/**
 * Trade's address for Hyperliquid's builder fee, or null when the server has
 * none set. Real-money copying refuses to start without one.
 */
export function builderAddress(): string | null {
  const address = process.env.TRADE_BUILDER_ADDRESS?.trim().toLowerCase()
  return address && /^0x[0-9a-f]{40}$/.test(address) ? address : null
}

/**
 * Trade's fee on one copied order. An exchange with no app fee ignores it,
 * and real-money copying is only switched on where one exists.
 */
export async function copyBuilderFee(): Promise<{
  address: string
  tenthsBps: number
} | null> {
  const address = builderAddress()
  if (!address) return null
  const config = await loadCopyConfig()
  const tenthsBps = builderFeeTenthsBps(
    Math.min(config.feeRate, HYPERLIQUID_MAX_BUILDER_FEE)
  )
  return tenthsBps > 0 ? { address, tenthsBps } : null
}

/** One fill as both lanes write it. */
export type LedgerFill = {
  fillId: string
  orderId: string | null
  marketKey: string
  side: TradeSide
  px: number
  sz: number
  closedPnl: number
  fee: number
  at: number
}

/**
 * Writes a fee row for every fill here that a copy's order made. Fills of
 * the copier's own orders are left alone. Safe to repeat: a fill already
 * written changes nothing.
 */
export async function recordCopiedFills(
  database: CustomShellDb,
  userId: string,
  wallet: Pick<TradeWallet, "id" | "kind" | "protocol">,
  fills: readonly LedgerFill[]
): Promise<void> {
  const orderIds = [
    ...new Set(
      fills.flatMap((fill) => (fill.orderId ? [fill.orderId] : []))
    ),
  ]
  if (orderIds.length === 0) return
  const orders = await database
    .select({
      orderId: tradeCopyOrders.orderId,
      copyId: tradeCopyOrders.copyId,
      traderUserId: tradeCopies.traderUserId,
    })
    .from(tradeCopyOrders)
    .innerJoin(tradeCopies, eq(tradeCopies.id, tradeCopyOrders.copyId))
    .where(
      and(
        eq(tradeCopyOrders.userId, userId),
        eq(tradeCopyOrders.walletId, wallet.id),
        inArray(tradeCopyOrders.orderId, orderIds)
      )
    )
  if (orders.length === 0) return
  const byOrder = new Map(orders.map((row) => [row.orderId, row]))
  const config = await loadCopyConfig(database)
  const real = wallet.kind === "live"
  const rows = fills.flatMap((fill) => {
    const order = fill.orderId ? byOrder.get(fill.orderId) : undefined
    if (!order) return []
    const notionalUsd = Math.abs(fill.px * fill.sz)
    const fee = copyFee({
      notionalUsd,
      real,
      feeRate: config.feeRate,
      traderShare: config.traderShare,
    })
    return [
      {
        copierUserId: userId,
        walletId: wallet.id,
        fillId: fill.fillId,
        copyId: order.copyId,
        traderUserId: order.traderUserId,
        protocol: wallet.protocol,
        real,
        marketKey: fill.marketKey,
        side: fill.side,
        notionalUsd,
        closedPnl: fill.closedPnl,
        exchangeFee: fill.fee,
        feeUsd: fee.feeUsd,
        traderShareUsd: fee.traderShareUsd,
        at: fill.at,
      },
    ]
  })
  if (rows.length === 0) return
  await database.insert(tradeCopyFills).values(rows).onConflictDoNothing()
}

/**
 * Writes down that a copy sent these orders, then catches any of their fills
 * that were already recorded. A real order can fill and be pushed back before
 * its id is written here, and that fill must still get its fee row.
 */
export async function recordCopyOrders(
  database: CustomShellDb,
  input: {
    userId: string
    wallet: Pick<TradeWallet, "id" | "kind" | "protocol">
    copyId: string
    marketKey: string
    orderIds: readonly string[]
  }
): Promise<void> {
  if (input.orderIds.length === 0) return
  await database
    .insert(tradeCopyOrders)
    .values(
      input.orderIds.map((orderId) => ({
        userId: input.userId,
        walletId: input.wallet.id,
        orderId,
        copyId: input.copyId,
        marketKey: input.marketKey,
      }))
    )
    .onConflictDoNothing()
  if (input.wallet.kind !== "live") return
  const early = await database
    .select()
    .from(tradeLiveFills)
    .where(
      and(
        eq(tradeLiveFills.userId, input.userId),
        eq(tradeLiveFills.walletId, input.wallet.id),
        inArray(tradeLiveFills.orderId, [...input.orderIds])
      )
    )
  await recordCopiedFills(
    database,
    input.userId,
    input.wallet,
    early.map((row) => ({ ...row, at: Number(row.at) }))
  )
}

/**
 * The same, off the trading path. A missed row costs one fill its fee row and
 * its label; a throw here would cost an order the exchange already accepted.
 */
export async function rememberCopyOrders(
  input: Parameters<typeof recordCopyOrders>[1]
): Promise<void> {
  try {
    await recordCopyOrders(db, input)
  } catch (error) {
    recordEngineError("copy-ledger", "trade_copy_orders write failed", error)
  }
}

/**
 * Puts "Copied from @sam" on every Journal trade a copy made any part of. A
 * trader who later deleted their profile leaves the trade unlabelled rather
 * than naming nobody.
 */
export async function stampCopiedTrades(
  userId: string,
  walletIds: readonly string[],
  trades: LiveTrade[]
): Promise<void> {
  const fillIds = trades.flatMap((trade) =>
    trade.fills.map((fill) => fill.fillId)
  )
  if (fillIds.length === 0 || walletIds.length === 0) return
  const rows = await db
    .select({
      fillId: tradeCopyFills.fillId,
      walletId: tradeCopyFills.walletId,
      handle: tradePublicProfiles.handle,
    })
    .from(tradeCopyFills)
    .innerJoin(
      tradePublicProfiles,
      eq(tradePublicProfiles.userId, tradeCopyFills.traderUserId)
    )
    .where(
      and(
        eq(tradeCopyFills.copierUserId, userId),
        inArray(tradeCopyFills.walletId, [...walletIds]),
        inArray(tradeCopyFills.fillId, fillIds)
      )
    )
  if (rows.length === 0) return
  const handleOf = new Map(
    rows.map((row) => [`${row.walletId} ${row.fillId}`, row.handle])
  )
  for (const trade of trades) {
    const handle = trade.fills
      .map((fill) => handleOf.get(`${trade.walletId} ${fill.fillId}`))
      .find((one) => one !== undefined)
    if (handle) trade.copiedFrom = handle
  }
}

/**
 * A copy that did not happen, written to the copier's Journal with the reason.
 * The copy row says whose Journal and which wallet. Never throws: a lost note
 * is a missing sentence, and the thing calling this is usually halfway
 * through a trading pass.
 */
export async function writeCopyNote(input: {
  copyId: string
  marketKey: string
  note: string
}): Promise<void> {
  try {
    const [copy] = await db
      .select({
        copierUserId: tradeCopies.copierUserId,
        walletId: tradeCopies.copierWalletId,
        handle: tradePublicProfiles.handle,
      })
      .from(tradeCopies)
      .leftJoin(
        tradePublicProfiles,
        eq(tradePublicProfiles.userId, tradeCopies.traderUserId)
      )
      .where(eq(tradeCopies.id, input.copyId))
    if (!copy) return
    await db.insert(tradeCopyNotes).values({
      userId: copy.copierUserId,
      walletId: copy.walletId,
      id: randomUUID(),
      copyId: input.copyId,
      marketKey: input.marketKey,
      traderHandle: copy.handle ?? "",
      note: input.note,
    })
    // The Journal re-reads when a wallet's history version moves.
    await bumpTradeHistory(db, copy.copierUserId, [copy.walletId])
  } catch (error) {
    recordEngineError("copy-ledger", "trade_copy_notes write failed", error)
  }
}
