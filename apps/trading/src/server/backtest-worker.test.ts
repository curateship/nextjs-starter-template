import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import {
  claimNextPendingBacktest,
  failClaimedBacktest,
  resetOrphanedRunning,
} from "@/server/backtests"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0004_trading.sql",
    "../../drizzle/0007_scanner_control.sql",
    "../../drizzle/0008_backtests.sql",
    "../../drizzle/0011_run_status.sql",
    "../../drizzle/0016_backtest_result_stats.sql",
    "../../drizzle/0020_trading_automations.sql",
    "../../drizzle/0042_market_scanner_runtime_control.sql",
    "../../drizzle/0043_dedicated_workers.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
  const now = new Date()
  await database.insert(schema.customShellUsers).values({
    id: "user-1",
    email: "worker@example.test",
    name: "Worker Test",
    role: "admin",
    passwordHash: "hash",
    createdAt: now,
    updatedAt: now,
  })
  for (const id of ["run-1", "run-2"]) {
    await database.insert(schema.tradingBacktests).values({
      id,
      userId: "user-1",
      groupId: id,
      name: id,
      strategyType: "automation",
      market: id === "run-1" ? "BTC" : "ETH",
      network: "mainnet",
      interval: "15m",
      params: { kind: "automation" },
      riskParams: {},
      costs: {},
      startTime: new Date(now.getTime() - 86_400_000),
      endTime: now,
      startingEquity: "10000",
      status: "pending",
      createdAt: now,
    })
  }
})

afterEach(async () => {
  await client.close()
})

describe("backtest worker claiming", () => {
  it("claims each queued run once across workers", async () => {
    const first = await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )
    const second = await claimNextPendingBacktest(
      "worker-b",
      database as unknown as CustomShellDb
    )
    const empty = await claimNextPendingBacktest(
      "worker-c",
      database as unknown as CustomShellDb
    )

    expect(new Set([first?.id, second?.id]).size).toBe(2)
    expect(first).toMatchObject({ attemptCount: 1, progress: 5 })
    expect(second).toMatchObject({ attemptCount: 1, progress: 5 })
    expect(empty).toBeNull()
  })

  it("requeues interrupted work and eventually records a terminal error", async () => {
    await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )
    expect(
      await resetOrphanedRunning(database as unknown as CustomShellDb)
    ).toEqual({
      requeued: 1,
      failed: 0,
    })

    await database
      .update(schema.tradingBacktests)
      .set({ status: "running", attemptCount: 3 })
      .where(eq(schema.tradingBacktests.id, "run-1"))
    expect(
      await resetOrphanedRunning(database as unknown as CustomShellDb)
    ).toEqual({
      requeued: 0,
      failed: 1,
    })
    const [run] = await database
      .select()
      .from(schema.tradingBacktests)
      .where(eq(schema.tradingBacktests.id, "run-1"))
    expect(run).toMatchObject({
      status: "error",
      progress: 100,
      progressStage: "failed",
    })
  })

  it("does not let a stale worker overwrite another worker's claim", async () => {
    const claimed = await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )

    await expect(
      failClaimedBacktest(
        claimed!.id,
        "worker-b",
        "stale failure",
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("claim was lost")

    const [stillRunning] = await database
      .select()
      .from(schema.tradingBacktests)
      .where(eq(schema.tradingBacktests.id, claimed!.id))
    expect(stillRunning).toMatchObject({
      status: "running",
      claimedBy: "worker-a",
    })

    await failClaimedBacktest(
      claimed!.id,
      "worker-a",
      "owned failure",
      database as unknown as CustomShellDb
    )
    const [failed] = await database
      .select()
      .from(schema.tradingBacktests)
      .where(eq(schema.tradingBacktests.id, claimed!.id))
    expect(failed).toMatchObject({
      status: "error",
      error: "owned failure",
      claimedBy: null,
    })
  })
})
