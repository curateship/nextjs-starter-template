import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  PositionSide,
  TradingNotificationKind,
} from "@/lib/trading/trading-notification-event"

export type TradingNotificationItem = {
  id: string
  kind: TradingNotificationKind
  coin: string
  side: PositionSide
  price: string
  size: string
  walletId: string
  walletLabel: string
  network: "testnet" | "mainnet"
  occurredAt: string
  readAt: string | null
}

const pageSchema = z.object({
  limit: z.number().int().min(1).max(50).default(50),
})
const idSchema = z.object({ id: z.string().min(1).max(36) })

const listFn = createServerFn({ method: "GET" })
  .inputValidator(pageSchema)
  .handler(async ({ data }) => {
    const { getTradingNotificationPage } =
      await import("@/server/trading-notifications")
    const user = await requireUser()
    return getTradingNotificationPage(user.id, data.limit)
  })

const markReadFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { markTradingNotificationRead } =
      await import("@/server/trading-notifications")
    requireAppOrigin()
    const user = await requireUser()
    return markTradingNotificationRead(user.id, data.id)
  })

const markAllReadFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAppOrigin } = await import("@/server/origin")
  const { markAllTradingNotificationsRead } =
    await import("@/server/trading-notifications")
  requireAppOrigin()
  const user = await requireUser()
  return markAllTradingNotificationsRead(user.id)
})

export function listTradingNotifications(limit = 50) {
  return listFn({ data: { limit } })
}

export function markTradingNotificationRead(id: string) {
  return markReadFn({ data: { id } })
}

export function markAllTradingNotificationsRead() {
  return markAllReadFn()
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}
