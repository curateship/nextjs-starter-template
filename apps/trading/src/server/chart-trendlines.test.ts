import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { Trendline } from "@/lib/trading/trendlines"
import * as schema from "@/server/schema"
import {
  loadUserChartTrendlines,
  saveUserChartTrendlines,
} from "@/server/chart-trendlines"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  await client.exec(
    await readFile(
      new URL("../../drizzle/0000_custom_shell_baseline.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0028_chart_trendlines.sql", import.meta.url),
      "utf8"
    )
  )
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

describe("chart trendline persistence", () => {
  it("stores one saved line set for the market", async () => {
    const userId = await createUser("trendlines@example.test")

    await saveUserChartTrendlines(
      userId,
      { network: "testnet", market: "ETH", trendlines: [line] },
      database
    )
    await saveUserChartTrendlines(
      userId,
      { network: "testnet", market: "BTC", trendlines: [] },
      database
    )

    await expect(
      loadUserChartTrendlines(
        userId,
        { network: "testnet", market: "ETH" },
        database
      )
    ).resolves.toEqual([line])
  })

  it("does not expose another user's saved lines", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const chart = { network: "mainnet" as const, market: "SOL" }

    await saveUserChartTrendlines(ownerId, { ...chart, trendlines: [line] }, database)

    await expect(loadUserChartTrendlines(otherId, chart, database)).resolves.toEqual([])
  })
})
