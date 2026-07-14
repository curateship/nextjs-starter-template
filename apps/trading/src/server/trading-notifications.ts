import { and, count, desc, eq, isNull } from "drizzle-orm"

import type { TradingNotificationItem } from "@/lib/api/trading-notifications"
import { db, type CustomShellDb } from "@/server/db"
import {
  tradingNotifications,
  tradingWallets,
  type TradingNotification,
  type TradingWallet,
} from "@/server/schema"
import { now } from "@/server/util"

export async function getTradingNotificationPage(
  userId: string,
  limit: number,
  database: CustomShellDb = db
) {
  const rows = await database
    .select({ notification: tradingNotifications, wallet: tradingWallets })
    .from(tradingNotifications)
    .innerJoin(
      tradingWallets,
      eq(tradingNotifications.walletId, tradingWallets.id)
    )
    .where(eq(tradingNotifications.userId, userId))
    .orderBy(
      desc(tradingNotifications.occurredAt),
      desc(tradingNotifications.id)
    )
    .limit(limit)
  const [unread] = await database
    .select({ value: count() })
    .from(tradingNotifications)
    .where(
      and(
        eq(tradingNotifications.userId, userId),
        isNull(tradingNotifications.readAt)
      )
    )

  return {
    items: rows.map(({ notification, wallet }) =>
      serializeTradingNotification(notification, wallet)
    ),
    unreadCount: unread?.value ?? 0,
  }
}

export async function markTradingNotificationRead(
  userId: string,
  notificationId: string,
  database: CustomShellDb = db
) {
  const readAt = now()
  const [updated] = await database
    .update(tradingNotifications)
    .set({ readAt })
    .where(
      and(
        eq(tradingNotifications.id, notificationId),
        eq(tradingNotifications.userId, userId)
      )
    )
    .returning({ id: tradingNotifications.id })
  if (!updated) throw new Error("Notification not found")
  return { id: updated.id, readAt: readAt.toISOString() }
}

export async function markAllTradingNotificationsRead(
  userId: string,
  database: CustomShellDb = db
) {
  const readAt = now()
  const rows = await database
    .update(tradingNotifications)
    .set({ readAt })
    .where(
      and(
        eq(tradingNotifications.userId, userId),
        isNull(tradingNotifications.readAt)
      )
    )
    .returning({ id: tradingNotifications.id })
  return { ids: rows.map((row) => row.id), readAt: readAt.toISOString() }
}

function serializeTradingNotification(
  row: TradingNotification,
  wallet: TradingWallet
): TradingNotificationItem {
  return {
    id: row.id,
    kind: row.kind as TradingNotificationItem["kind"],
    coin: row.coin,
    side: row.side as TradingNotificationItem["side"],
    price: row.price,
    size: row.size,
    walletId: wallet.id,
    walletLabel: wallet.label,
    network: wallet.network as TradingNotificationItem["network"],
    occurredAt: row.occurredAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }
}
