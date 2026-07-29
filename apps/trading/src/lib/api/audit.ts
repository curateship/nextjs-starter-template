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

const AUDIT_SORTS = [
  "time",
  "action",
  "actor",
  "wallet",
  "market",
  "status",
] as const
export type AuditSortBy = (typeof AUDIT_SORTS)[number]
export type AuditSortDir = "asc" | "desc"

const auditPageSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(5).max(100),
  sortBy: z.enum(AUDIT_SORTS).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

const loadAuditPageFn = createServerFn({ method: "POST" })
  .inputValidator(auditPageSchema)
  .handler(async ({ data }): Promise<AuditPageResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) {
      throw new Error("Missing Custom Shell session")
    }

    const { asc, count, desc, eq, inArray } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { tradingAuditLog, tradingWallets } = await import("@/server/schema")

    const wallets = await db
      .select({ id: tradingWallets.id })
      .from(tradingWallets)
      .where(eq(tradingWallets.userId, user.id))
    const walletIds = wallets.map((wallet) => wallet.id)
    if (walletIds.length === 0) {
      return { items: [], total: 0, page: data.page, pageSize: data.pageSize }
    }

    const where = inArray(tradingAuditLog.walletId, walletIds)
    const direction = data.dir === "asc" ? asc : desc
    const sortColumn =
      data.sortBy === "action"
        ? tradingAuditLog.actionType
        : data.sortBy === "actor"
          ? tradingAuditLog.actor
          : data.sortBy === "wallet"
            ? tradingWallets.label
            : data.sortBy === "market"
              ? tradingAuditLog.market
              : data.sortBy === "status"
                ? tradingAuditLog.status
                : tradingAuditLog.createdAt
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({ row: tradingAuditLog, walletLabel: tradingWallets.label })
        .from(tradingAuditLog)
        .leftJoin(
          tradingWallets,
          eq(tradingAuditLog.walletId, tradingWallets.id)
        )
        .where(where)
        .orderBy(direction(sortColumn), direction(tradingAuditLog.id))
        .limit(data.pageSize)
        .offset((data.page - 1) * data.pageSize),
      db.select({ value: count() }).from(tradingAuditLog).where(where),
    ])

    return {
      items: rows.map(({ row, walletLabel }) => ({
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
        wallet_label: walletLabel,
        created_at: row.createdAt.toISOString(),
      })),
      total,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export function loadAuditPage(
  page = 1,
  pageSize = 25,
  sortBy: AuditSortBy = "time",
  dir: AuditSortDir = "desc"
) {
  return loadAuditPageFn({ data: { page, pageSize, sortBy, dir } })
}
