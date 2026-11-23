import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ChartPosition } from "@/lib/trading/chart-positions"
import type { Trendline } from "@/lib/trading/trendlines"
import * as schema from "@/server/schema"
import {
  loadUserChartDrawings,
  saveUserChartDrawings,
} from "@/server/chart-drawings"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

const MIGRATIONS = [
  "0000_custom_shell_baseline.sql",
  "0028_chart_trendlines.sql",
  "0050_chart_position_drawings.sql",
]

beforeEach(async () => {
  client = new PGlite()
  for (const migration of MIGRATIONS) {
    await client.exec(
      await readFile(new URL(`../../drizzle/${migration}`, import.meta.url), "utf8")
    )
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

async function createUser(email: string) {
  const userId = uuid()
  const createdAt = now()
  await database.insert(schema.customShellUsers).values({
    id: userId,
    email,
    name: "Chart Owner",
    role: "admin",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  return userId
}

const line: Trendline = {
  id: "line-1",
  start: { time: 1_700_000_000, price: 1_750 },
  end: { time: 1_700_003_600, price: 1_800 },
  color: "#2962ff",
}

const position: ChartPosition = {
  id: "position-1",
  side: "short",
  startTime: 1_700_000_000,
  endTime: 1_700_020_000,
  entry: 1_800,
  target: 1_700,
  stop: 1_850,
}

const empty = { trendlines: [], positions: [] }

describe("chart drawing persistence", () => {
  it("stores one saved drawing set for the market", async () => {
    const userId = await createUser("drawings@example.test")

    await saveUserChartDrawings(
      userId,
      { network: "testnet", market: "ETH", trendlines: [line], positions: [position] },
      database
    )
    await saveUserChartDrawings(
      userId,
      { network: "testnet", market: "BTC", ...empty },
      database
    )

    await expect(
      loadUserChartDrawings(userId, { network: "testnet", market: "ETH" }, database)
    ).resolves.toEqual({ trendlines: [line], positions: [position] })
  })

  it("keeps trendlines when only a position drawing is left", async () => {
    const userId = await createUser("positions-only@example.test")
    const chart = { network: "testnet" as const, market: "SOL" }

    await saveUserChartDrawings(
      userId,
      { ...chart, trendlines: [line], positions: [position] },
      database
    )
    await saveUserChartDrawings(
      userId,
      { ...chart, trendlines: [], positions: [position] },
      database
    )

    await expect(loadUserChartDrawings(userId, chart, database)).resolves.toEqual({
      trendlines: [],
      positions: [position],
    })
  })

  it("clears the row once nothing is left on the chart", async () => {
    const userId = await createUser("cleared@example.test")
    const chart = { network: "mainnet" as const, market: "SOL" }

    await saveUserChartDrawings(
      userId,
      { ...chart, trendlines: [line], positions: [] },
      database
    )
    await saveUserChartDrawings(userId, { ...chart, ...empty }, database)

    await expect(loadUserChartDrawings(userId, chart, database)).resolves.toEqual(
      empty
    )
  })

  it("does not expose another user's saved drawings", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const chart = { network: "mainnet" as const, market: "SOL" }

    await saveUserChartDrawings(
      ownerId,
      { ...chart, trendlines: [line], positions: [] },
      database
    )

    await expect(loadUserChartDrawings(otherId, chart, database)).resolves.toEqual(
      empty
    )
  })
})
