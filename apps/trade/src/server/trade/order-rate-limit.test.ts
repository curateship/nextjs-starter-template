import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { enforceRateLimit } from "@/server/auth/rate-limit"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  LIVE_ORDER_RATE_LIMITS,
  runLiveOrderAction,
} from "@/server/trade/order-rate-limit"

let client: PGlite
let database: CustomShellDb
let userId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  userId = (await insertUser(database)).id
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

function checkRateLimit(
  key: string,
  options: { maxAttempts: number; windowSeconds: number }
) {
  return enforceRateLimit(key, options, database)
}

describe("the signed-in order cap", () => {
  it("refuses the twenty-first money-moving action in ten seconds", async () => {
    const action = vi.fn(async () => "sent")

    for (
      let attempt = 0;
      attempt < LIVE_ORDER_RATE_LIMITS.order.maxAttempts;
      attempt += 1
    ) {
      await runLiveOrderAction(userId, "order", action, checkRateLimit)
    }

    await expect(
      runLiveOrderAction(userId, "order", action, checkRateLimit)
    ).rejects.toThrow("TRADE_ORDER_RATE_LIMITED")
    expect(action).toHaveBeenCalledTimes(20)
  })

  it("keeps cancellation separate after the order budget is spent", async () => {
    for (
      let attempt = 0;
      attempt < LIVE_ORDER_RATE_LIMITS.order.maxAttempts;
      attempt += 1
    ) {
      await runLiveOrderAction(
        userId,
        "order",
        async () => undefined,
        checkRateLimit
      )
    }
    await expect(
      runLiveOrderAction(userId, "order", async () => undefined, checkRateLimit)
    ).rejects.toThrow("TRADE_ORDER_RATE_LIMITED")

    await expect(
      runLiveOrderAction(
        userId,
        "cancel",
        async () => "cancelled",
        checkRateLimit
      )
    ).resolves.toBe("cancelled")
  })

  it("still caps a cancellation loop at its larger allowance", async () => {
    const action = vi.fn(async () => "cancelled")

    for (
      let attempt = 0;
      attempt < LIVE_ORDER_RATE_LIMITS.cancel.maxAttempts;
      attempt += 1
    ) {
      await runLiveOrderAction(userId, "cancel", action, checkRateLimit)
    }

    await expect(
      runLiveOrderAction(userId, "cancel", action, checkRateLimit)
    ).rejects.toThrow("TRADE_ORDER_RATE_LIMITED")
    expect(action).toHaveBeenCalledTimes(100)
  })

  it("lets a cancellation through when the limiter store is unavailable", async () => {
    const action = vi.fn(async () => "cancelled")
    const reported = vi.spyOn(console, "error").mockImplementation(() => {})
    const unavailable = vi.fn(async () => {
      throw new Error("database offline")
    })

    await expect(
      runLiveOrderAction(userId, "cancel", action, unavailable)
    ).resolves.toBe("cancelled")
    expect(action).toHaveBeenCalledOnce()
    expect(reported).toHaveBeenCalledWith(
      "trade cancel rate-limit check failed",
      expect.objectContaining({ message: "database offline" })
    )
  })

  it("does not send a new order when the limiter store is unavailable", async () => {
    const action = vi.fn(async () => "sent")
    const unavailable = vi.fn(async () => {
      throw new Error("database offline")
    })

    await expect(
      runLiveOrderAction(userId, "order", action, unavailable)
    ).rejects.toThrow("database offline")
    expect(action).not.toHaveBeenCalled()
  })
})
