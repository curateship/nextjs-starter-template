import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import {
  claimNextPendingBacktest,
  claimPendingBacktestGroup,
  createUserBacktestGroup,
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
    "../../drizzle/0049_backtest_timeline.sql",
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
  it("creates every selected shared-wallet market in one claimable group", async () => {
    const params: AutomationConfig = {
      v: 2,
      kind: "automation",
      interval: "15m",
      rules: [],
      protection: {},
      dca: {
        nodeId: "dca",
        rungs: [{ deviation: 5 }, { deviation: 8 }],
        maxPositionPct: 25,
        sizeMultiplier: 2,
        compound: true,
        rungEntry: "market" as const,
        requireTwoGreen: false,
        basePeriods: 36,
        pumpPeriods: 8,
        trendFilterEnabled: false,
        trendMaBars: 200,
        exitOnTrendBreak: false,
      },
    }
    const endTime = new Date()
    const group = await createUserBacktestGroup(
      "user-1",
      ["SOL", "DOGE"].map((market) => ({
        name: "DCA group",
        market,
        network: "mainnet" as const,
        interval: "15m",
        params,
        costs: { takerFeeBps: 0, makerFeeBps: 0, slippageBps: 0 },
        startTime: new Date(endTime.getTime() - 86_400_000),
        endTime,
        startingEquity: 10_000,
      })),
      database as unknown as CustomShellDb
    )

    expect(group.rows).toHaveLength(2)
    expect(new Set(group.rows.map((row) => row.groupId))).toEqual(
      new Set([group.groupId])
    )
  })

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

  it("claims the remaining markets in a portfolio group for one worker", async () => {
    await database
      .update(schema.tradingBacktests)
      .set({ groupId: "run-1", params: { kind: "automation", qfl: {} } })
      .where(inArray(schema.tradingBacktests.id, ["run-1", "run-2"]))
    const first = await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )
    const competing = await claimNextPendingBacktest(
      "worker-b",
      database as unknown as CustomShellDb
    )
    const siblings = await claimPendingBacktestGroup(
      first!.groupId,
      "worker-a",
      database as unknown as CustomShellDb
    )

    expect(first?.id).toBe("run-1")
    expect(competing).toBeNull()
    expect(siblings).toHaveLength(1)
    expect(siblings[0]).toMatchObject({
      status: "running",
      claimedBy: "worker-a",
      attemptCount: 1,
    })
  })

  it("hands leadership to a sibling when the group leader has already failed", async () => {
    // The 29 July 2026 jam: the basket's leader market was one Binance does not
    // list, so it failed instantly, the worker restarted, and the siblings were
    // put back to pending under a dead leader. Nothing could claim them because
    // only `id = groupId` was claimable, and 399 rows sat stranded forever.
    await database
      .update(schema.tradingBacktests)
      .set({ groupId: "run-1", params: { kind: "automation", dca: {} } })
      .where(inArray(schema.tradingBacktests.id, ["run-1", "run-2"]))
    // run-1 is the leader and it is dead — no history for that market.
    await database
      .update(schema.tradingBacktests)
      .set({ status: "error", error: "No candle history" })
      .where(eq(schema.tradingBacktests.id, "run-1"))

    const promoted = await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )
    expect(promoted?.id).toBe("run-2")
    expect(promoted).toMatchObject({ status: "running", claimedBy: "worker-a" })

    // And while that promoted sibling is running it owns the group alone — a
    // second drainer must not start a duplicate replay on a second wallet.
    const competing = await claimNextPendingBacktest(
      "worker-b",
      database as unknown as CustomShellDb
    )
    expect(competing).toBeNull()
  })

  it("does not promote a sibling once any market in the basket has finished", async () => {
    // A shared-wallet basket is only meaningful replayed as one set. If some
    // markets already finished, replaying the leftovers alone would hand them a
    // fresh FULL wallet the real run never gave them, inflating their numbers.
    // Better to leave the run visibly stuck than to save wrong results.
    await database
      .update(schema.tradingBacktests)
      .set({ groupId: "run-1", params: { kind: "automation", dca: {} } })
      .where(inArray(schema.tradingBacktests.id, ["run-1", "run-2"]))
    await database.insert(schema.tradingBacktests).values({
      id: "run-3",
      userId: "user-1",
      groupId: "run-1",
      name: "run-3",
      strategyType: "automation",
      market: "SOL",
      network: "mainnet",
      interval: "15m",
      params: { kind: "automation", dca: {} },
      riskParams: {},
      costs: {},
      startTime: new Date(Date.now() - 86_400_000),
      endTime: new Date(),
      startingEquity: "10000",
      status: "done",
      createdAt: new Date(),
    })
    await database
      .update(schema.tradingBacktests)
      .set({ status: "error", error: "No candle history" })
      .where(eq(schema.tradingBacktests.id, "run-1"))

    const promoted = await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )
    expect(promoted).toBeNull()
  })

  it("does not promote a sibling while the leader is still running", async () => {
    await database
      .update(schema.tradingBacktests)
      .set({ groupId: "run-1", params: { kind: "automation", dca: {} } })
      .where(inArray(schema.tradingBacktests.id, ["run-1", "run-2"]))
    const leader = await claimNextPendingBacktest(
      "worker-a",
      database as unknown as CustomShellDb
    )
    expect(leader?.id).toBe("run-1")
    // The leader is mid-run and legitimately owns the basket.
    const competing = await claimNextPendingBacktest(
      "worker-b",
      database as unknown as CustomShellDb
    )
    expect(competing).toBeNull()
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
