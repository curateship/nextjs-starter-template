import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ChartView } from "@/lib/trade/chart-view"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadChartView,
  loadLastMarketKey,
  saveChartView,
  saveLastMarketKey,
} from "@/server/trade/prefs"
import { tradePrefs } from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

/** A whole view, so a test can name only the part it is about. */
function view(parts: Partial<ChartView>): ChartView {
  return { bars: 100, gap: 0, marginTop: 0.2, marginBottom: 0.1, ...parts }
}

describe("the remembered chart view", () => {
  it("is nothing at all on a first visit", async () => {
    const { id } = await insertUser(database)
    expect(await loadChartView(id)).toBeNull()
  })

  it("comes back as it went in", async () => {
    const { id } = await insertUser(database)
    await saveChartView(id, view({ bars: 120, gap: 4.5 }))
    expect(await loadChartView(id)).toEqual(view({ bars: 120, gap: 4.5 }))
  })

  it("is replaced rather than added to", async () => {
    const { id } = await insertUser(database)
    await saveChartView(id, view({ bars: 120 }))
    await saveChartView(id, view({ bars: 40, gap: 10 }))
    expect(await loadChartView(id)).toEqual(view({ bars: 40, gap: 10 }))
  })

  it("keeps each account's to itself", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveChartView(theirs.id, view({ bars: 120 }))
    expect(await loadChartView(mine.id)).toBeNull()
  })

  it("shares its row with the other remembered things", async () => {
    const { id } = await insertUser(database)
    await saveLastMarketKey(id, "hyperliquid:mainnet:BTC")
    await saveChartView(id, view({ bars: 120 }))

    expect(await loadLastMarketKey(id)).toBe("hyperliquid:mainnet:BTC")
    expect(await loadChartView(id)).toEqual(view({ bars: 120 }))
  })

  it("is dropped rather than applied when it cannot be read", async () => {
    const { id } = await insertUser(database)
    // A view written by some other build, straight into the column.
    await database
      .insert(tradePrefs)
      .values({ userId: id, chartView: { zoom: 3 } as never })
      .onConflictDoUpdate({
        target: tradePrefs.userId,
        set: { chartView: { zoom: 3 } as never },
      })

    expect(await loadChartView(id)).toBeNull()
    // And it is left in the table rather than destroyed.
    const rows = await database
      .select()
      .from(tradePrefs)
      .where(eq(tradePrefs.userId, id))
    expect(rows[0].chartView).toEqual({ zoom: 3 })
  })
})
