import { eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { insertUser } from "@/server/test-support"
import {
  db,
  outsideWalletPlanWrite,
  withWalletPlanWrite,
} from "@/server/trade/db"
import type { TradeWallet } from "@/lib/trade/wallets"
import { recordLiveFills } from "@/server/trade/live-fills"
import { tradeLiveFills, tradeWallets } from "@/server/trade/schema"
import {
  createPlanPostgresDatabase,
  deferred,
} from "@/server/trade/test-postgres"

describe.skipIf(!process.env.TRADE_TEST_POSTGRES_URL)(
  "PostgreSQL wallet plan locks",
  () => {
    let fixture: Awaited<ReturnType<typeof createPlanPostgresDatabase>>
    let userId: string

    beforeEach(async () => {
      fixture = await createPlanPostgresDatabase()
      userId = (await insertUser(fixture.db)).id
      await fixture.db.insert(tradeWallets).values(
        ["one", "two"].map((id) => ({
          userId,
          id,
          label: id,
          kind: "paper" as const,
          protocol: "hyperliquid" as const,
          network: "testnet" as const,
          startingBalance: 1000,
        }))
      )
    })
    afterEach(async () => {
      await fixture?.client.close()
    })

    it("lets another wallet finish while this wallet and its next writer wait", async () => {
      const entered = deferred()
      const release = deferred()
      const first = withWalletPlanWrite(userId, "one", async () => {
        entered.resolve()
        await release.promise
      })
      await entered.promise
      const secondWork = vi.fn(async () => undefined)
      const second = withWalletPlanWrite(userId, "one", secondWork)
      try {
        await fixture.client.waitForLock()
        await withWalletPlanWrite(userId, "two", async () => {
          await db
            .update(tradeWallets)
            .set({ label: "other wallet finished" })
            .where(eq(tradeWallets.id, "two"))
        })
        expect(secondWork).not.toHaveBeenCalled()
        const [other] = await fixture.db
          .select()
          .from(tradeWallets)
          .where(eq(tradeWallets.id, "two"))
        expect(other.label).toBe("other wallet finished")
      } finally {
        release.resolve()
        await Promise.all([first, second])
      }
      expect(secondWork).toHaveBeenCalledOnce()
    })

    it("records a pushed fill and a pass's copy without reversing the wallet lock order", async () => {
      const wallet: TradeWallet = {
        id: "one",
        label: "one",
        kind: "live",
        status: "active",
        protocol: "hyperliquid",
        network: "testnet",
        startingBalance: 1000,
        address: null,
        hasKey: false,
        keyValidUntil: null,
      }
      const fill = {
        fillId: "same-fill",
        orderId: "same-order",
        marketId: "BTC",
        side: "buy" as const,
        px: 100,
        sz: 1,
        at: 1,
        closedPnl: 0,
        fee: 0,
        dir: "Open Long",
        liquidation: false,
      }
      let pushed!: Promise<void>
      await withWalletPlanWrite(userId, "one", async () => {
        pushed = outsideWalletPlanWrite(() =>
          recordLiveFills(userId, wallet, [fill])
        )
        await fixture.client.waitForLock()
        await recordLiveFills(userId, wallet, [fill])
      })
      await pushed
      const rows = await fixture.db.select().from(tradeLiveFills)
      expect(rows).toHaveLength(1)
      const [saved] = await fixture.db
        .select()
        .from(tradeWallets)
        .where(eq(tradeWallets.id, "one"))
      expect(saved.historyVersion).toBe(1)
    })

    it("takes a new lock for a callback scheduled during an earlier turn", async () => {
      const wake = deferred()
      const work = vi.fn(async () => undefined)
      let later!: Promise<void>
      await withWalletPlanWrite(userId, "one", async () => {
        later = wake.promise.then(() =>
          withWalletPlanWrite(userId, "one", work)
        )
      })
      const holder = await fixture.pool.connect()
      await holder.query("BEGIN")
      await holder.query(
        "SELECT id FROM trade_wallets WHERE user_id = $1 AND id = 'one' FOR UPDATE",
        [userId]
      )
      wake.resolve()
      try {
        await fixture.client.waitForLock()
        expect(work).not.toHaveBeenCalled()
      } finally {
        await holder.query("ROLLBACK")
        holder.release()
      }
      await later
      expect(work).toHaveBeenCalledOnce()
    })

    it("refuses after five seconds without running the waiting action", async () => {
      const holder = await fixture.pool.connect()
      await holder.query("BEGIN")
      await holder.query(
        "SELECT id FROM trade_wallets WHERE user_id = $1 AND id = 'one' FOR UPDATE",
        [userId]
      )
      const work = vi.fn(async () => undefined)
      try {
        await expect(withWalletPlanWrite(userId, "one", work)).rejects.toThrow(
          "SMART_ORDER_WRITE_BUSY"
        )
        expect(work).not.toHaveBeenCalled()
      } finally {
        await holder.query("ROLLBACK")
        holder.release()
      }
      await withWalletPlanWrite(userId, "one", work)
      expect(work).toHaveBeenCalledOnce()
    }, 10_000)

    it("releases ownership when the connection holding the lock dies", async () => {
      const holder = await fixture.pool.connect()
      await holder.query("BEGIN")
      await holder.query(
        "SELECT id FROM trade_wallets WHERE user_id = $1 AND id = 'one' FOR UPDATE",
        [userId]
      )
      const work = vi.fn(async () => undefined)
      const waiting = withWalletPlanWrite(userId, "one", work)
      try {
        await fixture.client.waitForLock()
        expect(work).not.toHaveBeenCalled()
      } finally {
        holder.release(true)
      }
      await waiting
      expect(work).toHaveBeenCalledOnce()
    })

    it("shares a nested write and keeps recorded progress after a later refusal", async () => {
      await expect(
        withWalletPlanWrite(userId, "one", async () => {
          await withWalletPlanWrite(userId, "one", async () => {
            await db
              .update(tradeWallets)
              .set({ label: "accepted step" })
              .where(eq(tradeWallets.id, "one"))
          })
          throw new Error("Exchange refused the next step")
        })
      ).rejects.toThrow("Exchange refused the next step")
      const [row] = await fixture.db
        .select()
        .from(tradeWallets)
        .where(eq(tradeWallets.id, "one"))
      expect(row.label).toBe("accepted step")
    })

    it("does not claim success when a caught database error aborted the write", async () => {
      await expect(
        withWalletPlanWrite(userId, "one", async () => {
          await db
            .update(tradeWallets)
            .set({ label: "must roll back" })
            .where(eq(tradeWallets.id, "one"))
          try {
            await db.execute(sql`select 1 / 0`)
          } catch {
            /* Existing callers can catch database failures. */
          }
        })
      ).rejects.toThrow()
      const [row] = await fixture.db
        .select()
        .from(tradeWallets)
        .where(eq(tradeWallets.id, "one"))
      expect(row.label).toBe("one")
    })

    it("checks ownership before any action and refuses nested access to another wallet", async () => {
      const work = vi.fn(async () => undefined)
      await expect(
        withWalletPlanWrite("another-user", "one", work)
      ).rejects.toThrow("WALLET_NOT_FOUND")
      await expect(
        withWalletPlanWrite(userId, "one", () =>
          withWalletPlanWrite(userId, "two", work)
        )
      ).rejects.toThrow("SMART_ORDER_WRITE_WALLET")
      expect(work).not.toHaveBeenCalled()
    })
  }
)
