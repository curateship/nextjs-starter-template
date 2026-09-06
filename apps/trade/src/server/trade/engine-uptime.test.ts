import { readFile } from "node:fs/promises"
import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, expect, it } from "vitest"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { loadEngineUptime } from "@/server/trade/engine-uptime"
import { cleanTradeCaches } from "@/server/trade/cache-cleanup"
import {
  tradeEngineOutages,
  tradeEngineOutageHistory,
} from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb
let close: () => Promise<void>
const at = new Date("2026-09-06T12:00:00.000Z")
const daysAgo = (days: number) => new Date(at.getTime() - days * 86_400_000)

beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  close = () => test.client.close()
})
afterEach(async () => close())

it("lists overlapping outages newest first and totals only the last 30 days", async () => {
  await database.insert(tradeEngineOutageHistory).values([
    { kind: "ladders", startedAt: daysAgo(32), endedAt: daysAgo(31) },
    { kind: "ladders", startedAt: daysAgo(31), endedAt: daysAgo(29) },
    { kind: "ladders", startedAt: daysAgo(1), endedAt: null },
    { kind: "other", startedAt: daysAgo(2), endedAt: null },
  ])
  const result = await loadEngineUptime(database, at)
  expect(result.outages).toEqual([
    {
      startedAt: daysAgo(1).toISOString(),
      endedAt: null,
      durationMs: 86_400_000,
    },
    {
      startedAt: daysAgo(31).toISOString(),
      endedAt: daysAgo(29).toISOString(),
      durationMs: 2 * 86_400_000,
    },
  ])
  expect(result.totalDowntimeMs).toBe(2 * 86_400_000)
  expect(result.checkedAt).toBe(at.toISOString())
})

it("returns an honest empty history", async () => {
  expect(await loadEngineUptime(database, at)).toEqual({
    outages: [],
    totalDowntimeMs: 0,
    checkedAt: at.toISOString(),
  })
})

it("sweeps only outages closed more than 90 days ago, keeping ongoing outages", async () => {
  await database.insert(tradeEngineOutageHistory).values([
    { kind: "ladders", startedAt: daysAgo(100), endedAt: daysAgo(91) },
    { kind: "ladders", startedAt: daysAgo(95), endedAt: daysAgo(90) },
    { kind: "ladders", startedAt: daysAgo(94), endedAt: daysAgo(2) },
    { kind: "ladders", startedAt: daysAgo(93), endedAt: null },
  ])
  await cleanTradeCaches(database, at)
  const rows = await database.select().from(tradeEngineOutageHistory)
  expect(rows).toHaveLength(3)
  expect(rows.map((row) => row.startedAt)).not.toContainEqual(daysAgo(100))
  expect(rows.some((row) => row.endedAt === null)).toBe(true)
})

it("migration preserves an already announced outage and can be replayed", async () => {
  await database
    .insert(tradeEngineOutages)
    .values({ kind: "ladders", outageStartedAt: daysAgo(1), announcedAt: at })
  const migration = await readFile(
    new URL(
      "../../../drizzle/0170_trade_engine_outage_history.sql",
      import.meta.url
    ),
    "utf8"
  )
  await client.exec(migration)
  await client.exec(migration)
  expect(await database.select().from(tradeEngineOutageHistory)).toEqual([
    { kind: "ladders", startedAt: daysAgo(1), endedAt: null },
  ])
})
