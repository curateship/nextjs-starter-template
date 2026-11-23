import { AsyncLocalStorage } from "node:async_hooks"
import { and, eq, sql } from "drizzle-orm"

import { db as sharedDb, type CustomShellDb } from "@/server/db"
import { tradeWallets } from "@/server/trade/schema"

export type { CustomShellDb } from "@/server/db"

type WalletWrite = {
  userId: string
  walletId: string
  tx: CustomShellDb
  active: boolean
}

const walletWrite = new AsyncLocalStorage<WalletWrite>()

/** A pushed fill is independent work, even if its socket opened during a turn. */
export function outsideWalletPlanWrite<T>(work: () => T): T {
  return walletWrite.exit(work)
}

export function hasWalletPlanWrite(userId: string, walletId: string): boolean {
  const current = walletWrite.getStore()
  return (
    !!current?.active &&
    current.userId === userId &&
    current.walletId === walletId
  )
}

/** Trade helpers share their caller's transaction, including nested helpers. */
export const db: CustomShellDb = new Proxy({} as CustomShellDb, {
  get(_target, property) {
    const current = walletWrite.getStore()
    // Socket callbacks can outlive the turn that opened their connection.
    // They must never reuse that turn's already-committed transaction.
    const database = current?.active ? current.tx : sharedDb
    const value = Reflect.get(database, property, database)
    return typeof value === "function" ? value.bind(database) : value
  },
})

/** Lock before reading any plan. PostgreSQL coordinates the web and worker. */
export async function withWalletPlanWrite<T>(
  userId: string,
  walletId: string,
  work: () => Promise<T>,
  database: CustomShellDb = sharedDb
): Promise<T> {
  const current = walletWrite.getStore()
  if (current?.active) {
    if (current.userId !== userId || current.walletId !== walletId) {
      throw new Error("SMART_ORDER_WRITE_WALLET")
    }
    return await work()
  }

  const outcome = await database.transaction(async (tx) => {
    await lockWalletForPlan(tx, userId, walletId)
    const context: WalletWrite = { userId, walletId, tx, active: true }
    try {
      const result = await walletWrite.run(context, async () => {
        try {
          return { ok: true as const, value: await work() }
        } catch (error) {
          // An exchange refusal cannot undo an earlier accepted cancel or
          // fill. Commit recorded progress before returning that refusal.
          return { ok: false as const, error }
        }
      })
      // A helper may catch a SQL error. PostgreSQL then refuses the entire
      // transaction; do not report success after COMMIT silently rolls it back.
      await tx.execute(sql`select 1`)
      return result
    } finally {
      context.active = false
    }
  })
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

/** Acquire the wallet before fill/history rows as well, to keep lock order consistent. */
export async function lockWalletForPlan(
  tx: CustomShellDb,
  userId: string,
  walletId: string
): Promise<void> {
  // Only the wait for ownership expires. Never release ownership while an
  // exchange request is still running, or the next writer could trade too.
  await tx.execute(sql`set local lock_timeout = '5s'`)
  try {
    const [wallet] = await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, walletId))
      )
      .for("update")
    if (!wallet) throw new Error("WALLET_NOT_FOUND")
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined
    if (
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "55P03") ||
      (cause &&
        typeof cause === "object" &&
        "code" in cause &&
        cause.code === "55P03")
    ) {
      throw new Error("SMART_ORDER_WRITE_BUSY")
    }
    throw error
  }
  await tx.execute(sql`set local lock_timeout = '0'`)
}
