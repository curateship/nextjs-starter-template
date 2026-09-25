import { and, asc, eq, isNull, sql } from "drizzle-orm"

import { protocolLabel } from "@/lib/protocols/contracts"
import {
  buildLiveTrades,
  fillsOutsideTrades,
  type LiveFill,
} from "@/lib/trade/live-trades"
import {
  publicFigures,
  type PublicFigures,
} from "@/lib/trade/public-profile/figures"
import {
  shortAddress,
  type PublicWallet,
} from "@/lib/trade/public-profile/profile"
import type { TradeWallet } from "@/lib/trade/wallets"
import { agentOf, getProtocol } from "@/server/protocols/registry"
import { db, type CustomShellDb } from "@/server/trade/db"
import { tradeRecordFills, tradeRecordWallets } from "@/server/trade/schema"
import { priceFills } from "@/server/trade/trading-overview"
import { listWalletsWithCredentials } from "@/server/trade/wallets"

/**
 * The permanent trade record a public profile reads.
 *
 * The database writes it (migration 0186): every real mainnet wallet joins
 * `trade_record_wallets` when it is saved, every write to `trade_live_fills`
 * is copied into `trade_record_fills`, and deleting a wallet only marks it
 * removed. This file reads it back, prices it the way the P&L page prices
 * fills, and does the two writes app code owns: freezing a wallet's money as
 * it is deleted, and the ownership check.
 */

type RecordWalletRow = typeof tradeRecordWallets.$inferSelect
type RecordFillRow = typeof tradeRecordFills.$inferSelect

export type PricedRecord = {
  wallets: PublicWallet[]
  figures: PublicFigures
  /** Every priced and unpriced fill of a counted wallet, for the month grid. */
  days: { at: number; money: number | null }[]
  closedAt: number[]
  openPositions: number
  recordStart: number | null
}

function toLiveFill(row: RecordFillRow): LiveFill {
  return {
    fillId: row.fillId,
    orderId: row.orderId,
    walletId: row.walletId,
    marketKey: row.marketKey,
    side: row.side,
    px: row.px,
    sz: row.sz,
    at: Number(row.at),
    closedPnl: row.closedPnl,
    fee: row.fee,
    dir: row.dir,
    liquidation: row.liquidation,
    live: true,
  }
}

/** A failed check keeps a wallet out; one never run counts, since saving proved it. */
function counts(wallet: RecordWalletRow): boolean {
  return wallet.proof !== "failed"
}

function toPublicWallet(
  wallet: RecordWalletRow,
  recordStart: number | null
): PublicWallet {
  const explorer = getProtocol(wallet.protocol).explorer
  const onChain = Boolean(explorer && wallet.address)
  return {
    id: wallet.walletId,
    venue: protocolLabel(wallet.protocol),
    protocol: wallet.protocol,
    address: onChain && wallet.address ? shortAddress(wallet.address) : null,
    explorerUrl: explorer && wallet.address ? explorer(wallet.address) : null,
    check: !counts(wallet) ? "failed" : onChain ? "onchain" : "checked",
    checkNote: counts(wallet) ? null : wallet.proofNote,
    recordStart,
    removedAt: wallet.removedAt?.getTime() ?? null,
  }
}

/**
 * Open positions from the record alone, so the public page never asks an
 * exchange. A wallet and market whose fills after its last finished trade
 * still hold something, and began by opening rather than by closing a
 * position older than the record, is one open position.
 */
function countOpenPositions(fills: readonly LiveFill[]): number {
  const trades = buildLiveTrades(fills, new Map())
  const held = new Map<string, { net: number; opened: boolean }>()
  for (const fill of fillsOutsideTrades(fills, trades)) {
    const key = `${fill.walletId} ${fill.marketKey}`
    const entry = held.get(key) ?? { net: 0, opened: false }
    entry.net += fill.side === "buy" ? fill.sz : -fill.sz
    if (!fill.dir.startsWith("Close")) entry.opened = true
    held.set(key, entry)
  }
  let open = 0
  for (const entry of held.values()) {
    if (entry.opened && Math.abs(entry.net) > 1e-9) open += 1
  }
  return open
}

/** One member's whole record, priced, with the public figures worked out. */
export async function loadPricedRecord(
  userId: string,
  now = Date.now()
): Promise<PricedRecord> {
  const [walletRows, fillRows] = await Promise.all([
    db
      .select()
      .from(tradeRecordWallets)
      .where(eq(tradeRecordWallets.userId, userId))
      .orderBy(asc(tradeRecordWallets.addedAt)),
    db
      .select()
      .from(tradeRecordFills)
      .where(eq(tradeRecordFills.userId, userId))
      .orderBy(asc(tradeRecordFills.at)),
  ])

  const counted = new Set(
    walletRows.filter(counts).map((wallet) => wallet.walletId)
  )
  const kept = fillRows.filter((row) => counted.has(row.walletId))
  const unfrozen = kept.filter((row) => !row.frozen).map(toLiveFill)
  const priced = await priceFills(
    userId,
    walletRows
      .filter((wallet) => !wallet.removedAt)
      .map((wallet) => ({ id: wallet.walletId, protocol: wallet.protocol })),
    unfrozen
  )
  const moneyOf = (row: RecordFillRow): number | null =>
    row.frozen ? row.money : (priced.get(row.fillId) ?? null)

  const fills = kept.map((row) => ({
    at: Number(row.at),
    money: moneyOf(row),
    fee: row.fee,
  }))
  const liveFills = kept.map(toLiveFill)
  const trades = buildLiveTrades(liveFills, new Map())
  const removed = new Set(
    walletRows.filter((wallet) => wallet.removedAt).map((one) => one.walletId)
  )

  const firstFill = new Map<string, number>()
  for (const row of fillRows) {
    if (!firstFill.has(row.walletId))
      firstFill.set(row.walletId, Number(row.at))
  }
  const wallets = walletRows.map((wallet) =>
    toPublicWallet(wallet, firstFill.get(wallet.walletId) ?? null)
  )
  const starts = wallets
    .filter((wallet) => wallet.check !== "failed")
    .map((wallet) => wallet.recordStart)
    .filter((at): at is number => at !== null)

  return {
    wallets,
    figures: publicFigures(
      fills,
      trades.map((trade) => ({ closedAt: trade.closedAt, pnl: trade.pnl })),
      now
    ),
    days: fills.map((fill) => ({ at: fill.at, money: fill.money })),
    closedAt: trades.map((trade) => trade.closedAt),
    openPositions: countOpenPositions(
      liveFills.filter((fill) => !removed.has(fill.walletId))
    ),
    recordStart: starts.length > 0 ? Math.min(...starts) : null,
  }
}

/**
 * Fixes what each of a wallet's recorded fills made, as it is deleted.
 *
 * A grid's sale is priced from the grid that made it, and the grid is deleted
 * with the wallet. Priced afterwards, the same sale would fall back to the
 * exchange's figure and the profile's total would move. So the money is
 * worked out before the delete, while everything it depends on is still
 * here, and the returned write runs inside the delete's own transaction.
 */
export async function freezeWalletRecord(
  userId: string,
  wallet: Pick<TradeWallet, "id" | "protocol" | "kind" | "network">
): Promise<(database: CustomShellDb) => Promise<void>> {
  const nothing = async () => {}
  if (wallet.kind !== "live" || wallet.network !== "mainnet") return nothing
  const rows = await db
    .select()
    .from(tradeRecordFills)
    .where(
      and(
        eq(tradeRecordFills.userId, userId),
        eq(tradeRecordFills.walletId, wallet.id),
        eq(tradeRecordFills.frozen, false)
      )
    )
  if (rows.length === 0) return nothing
  const priced = await priceFills(userId, [wallet], rows.map(toLiveFill))
  const values = JSON.stringify(
    rows.map((row) => ({
      fill_id: row.fillId,
      money: priced.get(row.fillId) ?? null,
    }))
  )
  return async (database) => {
    await database.execute(sql`
      UPDATE trade_record_fills
      SET frozen = true, money = frozen_money.money
      FROM jsonb_to_recordset(${values}::jsonb)
        AS frozen_money(fill_id text, money double precision)
      WHERE trade_record_fills.user_id = ${userId}
        AND trade_record_fills.wallet_id = ${wallet.id}
        AND trade_record_fills.fill_id = frozen_money.fill_id
    `)
  }
}

/** A replacement key was just proved on save, so the last check passes again. */
export async function markRecordWalletProved(
  userId: string,
  walletId: string
): Promise<void> {
  await db
    .update(tradeRecordWallets)
    .set({ proof: "proved", proofNote: null, proofCheckedAt: new Date() })
    .where(
      and(
        eq(tradeRecordWallets.userId, userId),
        eq(tradeRecordWallets.walletId, walletId)
      )
    )
}

/**
 * Refusals that mean the key no longer belongs to the account. Anything else,
 * an exchange that did not answer or asked Trade to slow down, says nothing
 * about ownership and leaves the last answer standing.
 */
const OWNERSHIP_REFUSALS = ["KEY_NOT_APPROVED", "KEY_EXPIRED", "KEY_IS_ACCOUNT"]

export type OwnershipCheck = {
  walletId: string
  result: "proved" | "failed" | "unchecked"
  /** Why, in a sentence, when it failed or could not be asked. */
  note: string | null
}

/**
 * Asks each exchange again whether the saved key belongs to the saved
 * address, for every wallet still in the account. On Hyperliquid that is the
 * agent key being approved for that main address; on Solana, BNB Chain and
 * Robinhood Chain it is the private key producing that address; on an
 * API-key exchange it is one signed read the account accepts. It is the same
 * proof a wallet passes to be saved at all (`agent.verify`).
 */
export async function checkRecordWallets(
  userId: string,
  describe: (error: unknown) => string
): Promise<OwnershipCheck[]> {
  const [{ wallets, credentials }, recorded] = await Promise.all([
    listWalletsWithCredentials(userId),
    db
      .select({ walletId: tradeRecordWallets.walletId })
      .from(tradeRecordWallets)
      .where(
        and(
          eq(tradeRecordWallets.userId, userId),
          isNull(tradeRecordWallets.removedAt)
        )
      ),
  ])
  const inRecord = new Set(recorded.map((row) => row.walletId))
  const checks = await Promise.all(
    wallets
      .filter((wallet) => inRecord.has(wallet.id))
      .map(async (wallet): Promise<OwnershipCheck> => {
        const blob = credentials.get(wallet.id)?.() ?? null
        // A key the server cannot read is the server's problem, most often a
        // missing encryption setting. It says nothing about who owns the
        // wallet, so the last answer stands.
        if (!blob || !wallet.address) {
          return {
            walletId: wallet.id,
            result: "unchecked",
            note: "Trade could not read this wallet's saved key, so it was not asked.",
          }
        }
        try {
          await agentOf(getProtocol(wallet.protocol)).verify(
            wallet.network,
            wallet.address,
            blob
          )
          return { walletId: wallet.id, result: "proved", note: null }
        } catch (error) {
          const message = error instanceof Error ? error.message : ""
          const owned = !OWNERSHIP_REFUSALS.some((code) =>
            message.startsWith(code)
          )
          return {
            walletId: wallet.id,
            result: owned ? "unchecked" : "failed",
            note: describe(error),
          }
        }
      })
  )
  const checkedAt = new Date()
  for (const check of checks) {
    if (check.result === "unchecked") continue
    await db
      .update(tradeRecordWallets)
      .set({
        proof: check.result,
        proofNote: check.note,
        proofCheckedAt: checkedAt,
      })
      .where(
        and(
          eq(tradeRecordWallets.userId, userId),
          eq(tradeRecordWallets.walletId, check.walletId)
        )
      )
  }
  return checks
}
