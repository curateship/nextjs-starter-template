import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"

import { getAlertWorkerStatus } from "../worker-status"
import { getWorkersDashboard } from "./status"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../../drizzle/0000_custom_shell_baseline.sql",
    "../../../drizzle/0004_trading.sql",
    "../../../drizzle/0006_scanner.sql",
    "../../../drizzle/0007_scanner_control.sql",
    "../../../drizzle/0008_backtests.sql",
    "../../../drizzle/0011_run_status.sql",
    "../../../drizzle/0016_backtest_result_stats.sql",
    "../../../drizzle/0020_trading_automations.sql",
    "../../../drizzle/0035_market_scanner.sql",
    "../../../drizzle/0041_market_scanner_pause.sql",
    "../../../drizzle/0042_market_scanner_runtime_control.sql",
    "../../../drizzle/0043_dedicated_workers.sql",
    "../../../drizzle/0045_alert_worker.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

describe("worker status", () => {
  it("returns safe health and workload details for every worker", async () => {
    const timestamp = new Date("2026-07-15T12:00:00.000Z")
    await database.insert(schema.customShellUsers).values({
      id: "user-1",
      email: "worker@example.test",
      name: "Worker Test",
      role: "admin",
      passwordHash: "hash",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await database.insert(schema.tradingBacktests).values({
      id: "run-1",
      userId: "user-1",
      groupId: "run-1",
      name: "Run 1",
      strategyType: "automation",
      market: "BTC",
      network: "mainnet",
      interval: "15m",
      params: {},
      riskParams: {},
      costs: {},
      startTime: new Date(timestamp.getTime() - 86_400_000),
      endTime: timestamp,
      startingEquity: "10000",
      status: "done",
      completedAt: timestamp,
      createdAt: timestamp,
    })
    await database.insert(schema.scannerTrades).values({
      id: "trade-1",
      tid: 1,
      ts: timestamp,
      coin: "BTC",
      side: "buy",
      px: "100000",
      sz: "1",
      notional: "100000",
      buyer: "0x1111111111111111111111111111111111111111",
      seller: "0x2222222222222222222222222222222222222222",
    })
    await database.insert(schema.marketScannerRules).values({
      id: "rule-1",
      userId: "user-1",
      ruleSlot: 1,
      name: "BTC move",
      kind: "price_move",
      direction: "up",
      threshold: "1",
      marketScope: "selected",
      markets: ["BTC"],
      window: "5m",
      cooldown: "5m",
      enabled: true,
      lastEvaluatedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await database.insert(schema.tradingWorkerHeartbeats).values({
      id: "worker-1",
      startedAt: timestamp,
      lastSeenAt: new Date(),
      version: "test",
      meta: {
        workerKind: "whale-scanner",
        role: "leader",
        serviceActive: true,
        latestError:
          "token=private Bearer abc.def https://private.example 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0x1111111111111111111111111111111111111111 10.0.0.2:5432",
      },
    })
    await database.insert(schema.tradingWorkerHeartbeats).values({
      id: "worker-old",
      startedAt: timestamp,
      lastSeenAt: timestamp,
      version: "test",
      meta: {
        workerKind: "backtest",
        role: "leader",
        serviceActive: true,
        currentActivity: "Running an old Backtest",
      },
    })
    await database.insert(schema.tradingWorkerHeartbeats).values({
      id: "alert-worker-1",
      startedAt: timestamp,
      lastSeenAt: new Date(),
      version: "test",
      meta: {
        workerKind: "alert",
        role: "leader",
        serviceActive: true,
        currentActivity: "Watching Trade alerts",
        alertRules: 2,
        alertCoins: 1,
        alertSubscriptions: 288,
        lastSuccessfulWorkAt: "2026-07-15T12:34:56.000Z",
        watchdogLastCheckAt: "2026-07-15T12:35:00.000Z",
      },
    })
    await database.insert(schema.scannerAlerts).values({
      id: "watchdog-down-1",
      type: "worker_down",
      title: "Backtest Worker is down",
      body: "No heartbeat since 2026-07-15T11:00:00.000Z.",
      data: { workerKind: "backtest", urgent: false, exposure: false },
      dedupeKey: "worker-down:backtest:1",
      createdAt: timestamp,
    })
    await database.insert(schema.tradingWorkerHeartbeats).values({
      id: "alert-worker-standby",
      startedAt: timestamp,
      lastSeenAt: new Date(Date.now() + 1_000),
      version: "test",
      meta: {
        workerKind: "alert",
        role: "standby",
        serviceActive: false,
        currentActivity: "Starting",
      },
    })
    await database
      .update(schema.tradingWorkerControls)
      .set({ paused: true, updatedAt: timestamp })
      .where(eq(schema.tradingWorkerControls.kind, "backtest"))

    const result = await getWorkersDashboard(
      "user-1",
      true,
      database as unknown as CustomShellDb
    )

    expect(result.workers.map((worker) => worker.kind)).toEqual([
      "bot",
      "whale-scanner",
      "market-scanner",
      "alert",
      "backtest",
    ])
    expect(
      result.workers.find((worker) => worker.kind === "whale-scanner")
    ).toMatchObject({
      state: "running",
      latestError:
        "token=[redacted] Bearer [redacted] [redacted] [redacted key] [redacted address] [redacted host]",
      metrics: expect.arrayContaining([
        { label: "Latest type", value: "Whale trades" },
      ]),
    })
    expect(
      result.workers.find((worker) => worker.kind === "market-scanner")?.metrics
    ).toContainEqual({
      label: "Last evaluation",
      value: timestamp.toISOString(),
    })
    expect(
      result.workers.find((worker) => worker.kind === "alert")
    ).toMatchObject({
      state: "running",
      currentActivity: "Watching Trade alerts",
      lastSuccessfulWorkAt: "2026-07-15T12:34:56.000Z",
      watchdogLastCheckAt: "2026-07-15T12:35:00.000Z",
      lastIncidentAt: null,
      lastIncidentOngoing: false,
      metrics: [
        { label: "Alert rules", value: "2" },
        { label: "Markets", value: "1" },
        { label: "Subscriptions", value: "288" },
      ],
    })
    expect(
      result.workers.find((worker) => worker.kind === "backtest")?.metrics
    ).toContainEqual({
      label: "Last completed",
      value: timestamp.toISOString(),
    })
    expect(
      result.workers.find((worker) => worker.kind === "backtest")
    ).toMatchObject({
      state: "offline",
      currentActivity: "Not connected",
      role: null,
      lastIncidentAt: timestamp.toISOString(),
      lastIncidentOngoing: true,
    })
    expect(result.overview.pausedOrOff).toBe(1)
    await expect(
      getAlertWorkerStatus(database as unknown as CustomShellDb)
    ).resolves.toEqual({ workerOnline: true, workerActive: true })
  })
})
