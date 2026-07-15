import { and, eq, lt } from "drizzle-orm"

import {
  classifyTradingFill,
  triggerNotificationKind,
  type TradingFill,
  type TradingNotificationKind,
} from "@/lib/trading/trading-notification-event"
import { db, type CustomShellDb } from "@/server/db"
import { getInfoClient } from "@/server/hyperliquid/info"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingNotificationCursors,
  tradingNotifications,
  tradingWallets,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

const FIRST_SYNC_LOOKBACK_MS = 15_000
const MIN_SYNC_INTERVAL_MS = 5_000
const HYPERLIQUID_FILL_LIMIT = 2_000

type WalletSource = {
  walletId: string
  network: TradingNetwork
  address: `0x${string}`
}

type VerifiedTradingFill = TradingFill & { tid: number }
type ExchangeOrder = { oid: number; orderType: string }

export type TradingNotificationExchange = {
  listFills(
    source: WalletSource,
    startTime: number,
    endTime: number
  ): Promise<VerifiedTradingFill[]>
  listOrders(source: WalletSource): Promise<ExchangeOrder[]>
  getOrder(source: WalletSource, oid: number): Promise<ExchangeOrder | null>
}

type SyncOptions = {
  database?: CustomShellDb
  exchange?: TradingNotificationExchange
  syncedAt?: Date
}

export async function syncTradingNotificationsForUser(
  userId: string,
  {
    database = db,
    exchange = hyperliquidExchange,
    syncedAt = now(),
  }: SyncOptions = {}
) {
  const wallets = await database
    .select({
      userId: tradingWallets.userId,
      walletId: tradingWallets.id,
      network: tradingWallets.network,
      accountAddress: tradingWallets.accountAddress,
      vaultAddress: tradingWallets.vaultAddress,
    })
    .from(tradingWallets)
    .where(
      and(
        eq(tradingWallets.userId, userId),
        eq(tradingWallets.isActive, true),
        eq(tradingWallets.status, "active")
      )
    )

  for (const wallet of wallets) {
    await syncWallet(
      {
        walletId: wallet.walletId,
        network: wallet.network as TradingNetwork,
        address: (wallet.vaultAddress ??
          wallet.accountAddress) as `0x${string}`,
      },
      wallet.userId,
      syncedAt,
      database,
      exchange
    )
  }
}

export async function syncTradingNotificationsForAllUsers({
  database = db,
  exchange = hyperliquidExchange,
  syncedAt = now(),
}: SyncOptions = {}) {
  const wallets = await database
    .select({
      userId: tradingWallets.userId,
      walletId: tradingWallets.id,
      network: tradingWallets.network,
      accountAddress: tradingWallets.accountAddress,
      vaultAddress: tradingWallets.vaultAddress,
    })
    .from(tradingWallets)
    .where(
      and(
        eq(tradingWallets.isActive, true),
        eq(tradingWallets.status, "active")
      )
    )

  for (const wallet of wallets) {
    await syncWallet(
      {
        walletId: wallet.walletId,
        network: wallet.network as TradingNetwork,
        address: (wallet.vaultAddress ??
          wallet.accountAddress) as `0x${string}`,
      },
      wallet.userId,
      syncedAt,
      database,
      exchange
    )
  }
}

async function syncWallet(
  source: WalletSource,
  userId: string,
  syncedAt: Date,
  database: CustomShellDb,
  exchange: TradingNotificationExchange
) {
  const lastSyncedAt = await getOrCreateCursor(
    source.walletId,
    syncedAt,
    database
  )
  if (syncedAt.getTime() - lastSyncedAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    return
  }

  const startTime = lastSyncedAt.getTime()
  const endTime = syncedAt.getTime()
  const fills = await listAllFills(exchange, source, startTime, endTime)
  fills.forEach((fill) => assertVerifiedFill(fill, startTime, endTime))
  const hasPositionReduction = fills.some(
    (fill) => Number(fill.startPosition) !== 0
  )
  const orders = hasPositionReduction ? await exchange.listOrders(source) : []

  const triggerKinds = await resolveTriggerKinds(
    exchange,
    source,
    fills,
    orders
  )
  const createdAt = now()
  const values = fills.flatMap((fill) => {
    const draft = classifyTradingFill(fill, triggerKinds)
    if (!draft) return []
    return [
      {
        id: uuid(),
        userId,
        walletId: source.walletId,
        eventKey: `${source.network}:${source.address.toLowerCase()}:${fill.tid}`,
        kind: draft.kind,
        coin: draft.coin,
        side: draft.side,
        price: draft.price,
        size: draft.size,
        occurredAt: new Date(draft.occurredAt),
        createdAt,
      },
    ]
  })

  if (values.length > 0) {
    await database
      .insert(tradingNotifications)
      .values(values)
      .onConflictDoNothing({
        target: [tradingNotifications.userId, tradingNotifications.eventKey],
      })
  }

  await database
    .update(tradingNotificationCursors)
    .set({ lastSyncedAt: syncedAt, updatedAt: syncedAt })
    .where(
      and(
        eq(tradingNotificationCursors.walletId, source.walletId),
        lt(tradingNotificationCursors.lastSyncedAt, syncedAt)
      )
    )
}

async function getOrCreateCursor(
  walletId: string,
  syncedAt: Date,
  database: CustomShellDb
) {
  const [existing] = await database
    .select({ lastSyncedAt: tradingNotificationCursors.lastSyncedAt })
    .from(tradingNotificationCursors)
    .where(eq(tradingNotificationCursors.walletId, walletId))
    .limit(1)
  if (existing) return existing.lastSyncedAt

  const initialSyncAt = new Date(syncedAt.getTime() - FIRST_SYNC_LOOKBACK_MS)
  const [created] = await database
    .insert(tradingNotificationCursors)
    .values({
      walletId,
      lastSyncedAt: initialSyncAt,
      updatedAt: syncedAt,
    })
    .onConflictDoNothing({ target: tradingNotificationCursors.walletId })
    .returning({ lastSyncedAt: tradingNotificationCursors.lastSyncedAt })
  if (created) return created.lastSyncedAt

  const [concurrent] = await database
    .select({ lastSyncedAt: tradingNotificationCursors.lastSyncedAt })
    .from(tradingNotificationCursors)
    .where(eq(tradingNotificationCursors.walletId, walletId))
    .limit(1)
  if (!concurrent) throw new Error("Trading notification cursor was not saved")
  return concurrent.lastSyncedAt
}

async function listAllFills(
  exchange: TradingNotificationExchange,
  source: WalletSource,
  startTime: number,
  endTime: number
): Promise<VerifiedTradingFill[]> {
  const fills = await exchange.listFills(source, startTime, endTime)
  if (fills.length < HYPERLIQUID_FILL_LIMIT) return fills
  if (startTime >= endTime) {
    throw new Error("Hyperliquid fill window is too large to sync safely")
  }

  const midpoint = Math.floor((startTime + endTime) / 2)
  const before = await listAllFills(exchange, source, startTime, midpoint)
  const after = await listAllFills(exchange, source, midpoint + 1, endTime)
  return [
    ...new Map([...before, ...after].map((fill) => [fill.tid, fill])).values(),
  ]
}

async function resolveTriggerKinds(
  exchange: TradingNotificationExchange,
  source: WalletSource,
  fills: VerifiedTradingFill[],
  orders: ExchangeOrder[]
) {
  const kinds = new Map<
    number,
    Exclude<TradingNotificationKind, "position_opened">
  >()
  for (const order of orders) {
    const kind = triggerNotificationKind(order.orderType)
    if (kind) kinds.set(order.oid, kind)
  }

  const missingOrderIds = new Set(
    fills
      .filter(
        (fill) => Number(fill.startPosition) !== 0 && !kinds.has(fill.oid)
      )
      .map((fill) => fill.oid)
  )
  for (const orderId of missingOrderIds) {
    const order = await exchange.getOrder(source, orderId)
    const kind = order ? triggerNotificationKind(order.orderType) : null
    if (kind) kinds.set(orderId, kind)
  }
  return kinds
}

function assertVerifiedFill(
  fill: VerifiedTradingFill,
  startTime: number,
  endTime: number
) {
  const positiveDecimal = /^\d+(\.\d+)?$/
  const signedDecimal = /^-?\d+(\.\d+)?$/
  if (
    !/^[A-Za-z0-9@._:-]+$/.test(fill.coin) ||
    fill.coin.length > 20 ||
    fill.px.length > 80 ||
    !positiveDecimal.test(fill.px) ||
    !Number.isFinite(Number(fill.px)) ||
    Number(fill.px) <= 0 ||
    fill.sz.length > 80 ||
    !positiveDecimal.test(fill.sz) ||
    !Number.isFinite(Number(fill.sz)) ||
    Number(fill.sz) <= 0 ||
    fill.startPosition.length > 81 ||
    !signedDecimal.test(fill.startPosition) ||
    !Number.isFinite(Number(fill.startPosition)) ||
    !Number.isSafeInteger(fill.time) ||
    fill.time < startTime ||
    fill.time > endTime ||
    !Number.isSafeInteger(fill.oid) ||
    !Number.isSafeInteger(fill.tid)
  ) {
    throw new Error("Hyperliquid returned an invalid fill")
  }
}

const hyperliquidExchange: TradingNotificationExchange = {
  async listFills(source, startTime, endTime) {
    return getInfoClient(source.network).userFillsByTime({
      user: source.address,
      startTime,
      endTime,
    })
  },
  async listOrders(source) {
    const orders = await getInfoClient(source.network).historicalOrders({
      user: source.address,
    })
    return orders.map(({ order }) => ({
      oid: order.oid,
      orderType: order.orderType,
    }))
  },
  async getOrder(source, oid) {
    const result = await getInfoClient(source.network).orderStatus({
      user: source.address,
      oid,
    })
    if (result.status === "unknownOid") return null
    return {
      oid: result.order.order.oid,
      orderType: result.order.order.orderType,
    }
  },
}
