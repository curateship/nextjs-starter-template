import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getInfoClient } from "@/server/hyperliquid/info"
import { getDefaultNetwork } from "@/server/hyperliquid/transport"
import {
  tradingPaperFills,
  tradingPaperOrders,
  tradingPaperPositions,
  tradingPaperWallets,
  type TradingPaperWallet,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

const PAPER_ORDER_CHANNEL = "paper_orders"

export type PlacePaperOrderInput = {
  paperWalletId: string
  coin: string
  side: "buy" | "sell"
  orderType: "market" | "limit"
  px?: string
  sz: string
  tif: "Gtc" | "Ioc" | "Alo"
  reduceOnly: boolean
}

export async function listPaperWallets(
  userId: string,
  database: CustomShellDb = db
) {
  return database
    .select()
    .from(tradingPaperWallets)
    .where(eq(tradingPaperWallets.userId, userId))
    .orderBy(desc(tradingPaperWallets.createdAt))
}

export async function createPaperWallet(
  userId: string,
  input: { label: string; startingEquity: number },
  database: CustomShellDb = db
): Promise<TradingPaperWallet> {
  const label = input.label.trim()
  if (!label) throw new Error("Wallet label is required")
  if (!(input.startingEquity > 0)) {
    throw new Error("Starting equity must be positive")
  }

  const createdAt = now()
  const [wallet] = await database
    .insert(tradingPaperWallets)
    .values({
      id: uuid(),
      userId,
      label: label.slice(0, 255),
      startingEquity: String(input.startingEquity),
      cash: String(input.startingEquity),
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  if (!wallet) throw new Error("Paper wallet was not created")
  return wallet
}

export async function resetPaperWallet(
  userId: string,
  paperWalletId: string,
  database: CustomShellDb = db
) {
  const wallet = await requirePaperWallet(userId, paperWalletId, database)
  await database
    .delete(tradingPaperPositions)
    .where(eq(tradingPaperPositions.paperWalletId, wallet.id))
  await database
    .delete(tradingPaperOrders)
    .where(eq(tradingPaperOrders.paperWalletId, wallet.id))
  await database
    .delete(tradingPaperFills)
    .where(eq(tradingPaperFills.paperWalletId, wallet.id))
  await database
    .update(tradingPaperWallets)
    .set({ cash: wallet.startingEquity, updatedAt: now() })
    .where(eq(tradingPaperWallets.id, wallet.id))
}

export async function deletePaperWallet(
  userId: string,
  paperWalletId: string,
  database: CustomShellDb = db
) {
  const wallet = await requirePaperWallet(userId, paperWalletId, database)
  await database
    .delete(tradingPaperWallets)
    .where(eq(tradingPaperWallets.id, wallet.id))
}

export async function placePaperOrder(
  userId: string,
  input: PlacePaperOrderInput,
  database: CustomShellDb = db
) {
  const wallet = await requirePaperWallet(userId, input.paperWalletId, database)

  const sz = Number(input.sz)
  if (!(sz > 0)) throw new Error("Size must be positive")
  if (input.orderType === "limit" && !(Number(input.px) > 0)) {
    throw new Error("Limit orders need a price")
  }

  const createdAt = now()
  const [order] = await database
    .insert(tradingPaperOrders)
    .values({
      id: uuid(),
      paperWalletId: wallet.id,
      coin: input.coin,
      side: input.side,
      orderType: input.orderType,
      px: input.orderType === "limit" ? input.px : null,
      sz: input.sz,
      remainingSz: input.sz,
      tif: input.orderType === "market" ? "Ioc" : input.tif,
      reduceOnly: input.reduceOnly,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  await database.execute(sql.raw(`notify ${PAPER_ORDER_CHANNEL}`))
  return order
}

/**
 * Re-prices a resting paper order (chart line dragging): cancels the
 * original and queues a fresh limit at the new price for the remaining size.
 */
export async function movePaperOrder(
  userId: string,
  paperWalletId: string,
  orderId: string,
  px: string,
  database: CustomShellDb = db
) {
  const wallet = await requirePaperWallet(userId, paperWalletId, database)
  if (!(Number(px) > 0)) throw new Error("Invalid price")

  const original = await markOrderCancelling(database, wallet.id, orderId)

  const createdAt = now()
  await database.insert(tradingPaperOrders).values({
    id: uuid(),
    paperWalletId: wallet.id,
    coin: original.coin,
    side: original.side,
    orderType: "limit",
    px,
    sz: original.remainingSz,
    remainingSz: original.remainingSz,
    tif: original.tif === "Ioc" ? "Gtc" : original.tif,
    reduceOnly: original.reduceOnly,
    status: "pending",
    createdAt,
    updatedAt: createdAt,
  })
  await database.execute(sql.raw(`notify ${PAPER_ORDER_CHANNEL}`))
}

export async function cancelPaperOrder(
  userId: string,
  paperWalletId: string,
  orderId: string,
  database: CustomShellDb = db
) {
  const wallet = await requirePaperWallet(userId, paperWalletId, database)
  await markOrderCancelling(database, wallet.id, orderId)
  await database.execute(sql.raw(`notify ${PAPER_ORDER_CHANNEL}`))
}

/** Marks a live order cancelling (the worker consumes it); throws if done. */
async function markOrderCancelling(
  database: CustomShellDb,
  walletId: string,
  orderId: string
) {
  const [order] = await database
    .update(tradingPaperOrders)
    .set({ status: "cancelling", updatedAt: now() })
    .where(
      and(
        eq(tradingPaperOrders.id, orderId),
        eq(tradingPaperOrders.paperWalletId, walletId),
        inArray(tradingPaperOrders.status, ["pending", "resting"])
      )
    )
    .returning()
  if (!order) throw new Error("Order not found or already done")
  return order
}

export async function getPaperAccount(
  userId: string,
  paperWalletId: string,
  database: CustomShellDb = db
) {
  const wallet = await requirePaperWallet(userId, paperWalletId, database)

  const [positions, openOrders, fills] = await Promise.all([
    database
      .select()
      .from(tradingPaperPositions)
      .where(eq(tradingPaperPositions.paperWalletId, wallet.id)),
    database
      .select()
      .from(tradingPaperOrders)
      .where(
        and(
          eq(tradingPaperOrders.paperWalletId, wallet.id),
          inArray(tradingPaperOrders.status, [
            "pending",
            "resting",
            "cancelling",
          ])
        )
      )
      .orderBy(desc(tradingPaperOrders.createdAt)),
    database
      .select()
      .from(tradingPaperFills)
      .where(eq(tradingPaperFills.paperWalletId, wallet.id))
      .orderBy(desc(tradingPaperFills.fillTime))
      .limit(100),
  ])

  // Mark prices for uPnL — one HTTP call, cached by HL edge.
  let mids: Record<string, string> = {}
  try {
    mids = await getInfoClient(getDefaultNetwork()).allMids()
  } catch {
    // uPnL degrades to entry-price valuation if mids are unavailable.
  }

  let unrealized = 0
  const positionRows = positions.map((position) => {
    const szi = Number(position.szi)
    const entryPx = Number(position.entryPx)
    const mark = Number(mids[position.coin] ?? position.entryPx)
    const uPnl = (mark - entryPx) * szi
    unrealized += uPnl
    return {
      coin: position.coin,
      szi: position.szi,
      entry_px: position.entryPx,
      mark_px: String(mark),
      unrealized_pnl: uPnl,
    }
  })

  return {
    wallet,
    equity: Number(wallet.cash) + unrealized,
    unrealized,
    positions: positionRows,
    openOrders,
    fills,
  }
}

async function requirePaperWallet(
  userId: string,
  paperWalletId: string,
  database: CustomShellDb
): Promise<TradingPaperWallet> {
  const [wallet] = await database
    .select()
    .from(tradingPaperWallets)
    .where(
      and(
        eq(tradingPaperWallets.id, paperWalletId),
        eq(tradingPaperWallets.userId, userId)
      )
    )
    .limit(1)
  if (!wallet) throw new Error("Paper wallet not found")
  return wallet
}
