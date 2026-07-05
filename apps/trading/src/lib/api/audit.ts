import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type AuditItem = {
  id: string
  actor: string
  action_type: string
  network: string
  market: string | null
  cloid: string | null
  status: string
  error_message: string | null
  request: JsonValue
  response: JsonValue
  wallet_label: string | null
  created_at: string
}

export type AuditPageResponse = {
  items: AuditItem[]
  total: number
  page: number
  pageSize: number
}

const auditPageSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(5).max(100),
})

const loadAuditPageFn = createServerFn({ method: "POST" })
  .inputValidator(auditPageSchema)
  .handler(async ({ data }): Promise<AuditPageResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) {
      throw new Error("Missing Custom Shell session")
    }

    const { count, desc, eq, inArray } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { tradingAuditLog, tradingWallets } = await import("@/server/schema")

    const wallets = await db
      .select({ id: tradingWallets.id, label: tradingWallets.label })
      .from(tradingWallets)
      .where(eq(tradingWallets.userId, user.id))
    const walletIds = wallets.map((wallet) => wallet.id)
    const labelByWalletId = new Map(
      wallets.map((wallet) => [wallet.id, wallet.label])
    )
    if (walletIds.length === 0) {
      return { items: [], total: 0, page: data.page, pageSize: data.pageSize }
    }

    const where = inArray(tradingAuditLog.walletId, walletIds)
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(tradingAuditLog)
        .where(where)
        .orderBy(desc(tradingAuditLog.createdAt))
        .limit(data.pageSize)
        .offset((data.page - 1) * data.pageSize),
      db.select({ value: count() }).from(tradingAuditLog).where(where),
    ])

    return {
      items: rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        action_type: row.actionType,
        network: row.network,
        market: row.market,
        cloid: row.cloid,
        status: row.status,
        error_message: row.errorMessage,
        request: row.request as JsonValue,
        response: row.response as JsonValue,
        wallet_label: row.walletId
          ? (labelByWalletId.get(row.walletId) ?? null)
          : null,
        created_at: row.createdAt.toISOString(),
      })),
      total,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export function loadAuditPage(page = 1, pageSize = 25) {
  return loadAuditPageFn({ data: { page, pageSize } })
}
