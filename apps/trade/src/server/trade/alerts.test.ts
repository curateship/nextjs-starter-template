import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { clearAlerts } from "@/server/trade/alerts"
import { loadDrawingAlerts } from "@/server/trade/drawing-alerts"
import { saveChartDrawing, setChartDrawingAlert } from "@/server/trade/drawings"
import {
  createPriceAlert,
  loadArmedPriceAlerts,
  loadRecentFiredPriceAlerts,
} from "@/server/trade/price-alerts"
import { tradeChartDrawings, tradePriceAlerts } from "@/server/trade/schema"

const BTC = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

async function person() {
  const user = await insertUser(database)
  const workspace = await insertWorkspace(database, { userId: user.id })
  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: workspace.id })
    .where(eq(customShellUsers.id, user.id))
  return user.id
}

async function priceAlert(userId: string, firedAt: Date | null) {
  const alert = await createPriceAlert(userId, {
    id: uuid(),
    marketKey: BTC,
    price: 110,
    currentPrice: 100,
  })
  if (firedAt) {
    await database
      .update(tradePriceAlerts)
      .set({ firedAt })
      .where(eq(tradePriceAlerts.id, alert.id))
  }
  return alert.id
}

async function lineAlert(userId: string, firedAt: number | null) {
  const id = uuid()
  await saveChartDrawing(userId, BTC, {
    id,
    shape: {
      kind: "trendline",
      from: { time: 0, price: 110 },
      to: { time: 1_000, price: 120 },
    },
  })
  await setChartDrawingAlert(userId, { id, on: true, currentPrice: 100 }, 1)
  if (firedAt !== null) {
    await database
      .update(tradeChartDrawings)
      .set({
        alert: { direction: "above", armedAt: 1, firedAt },
      })
      .where(eq(tradeChartDrawings.id, id))
  }
  return id
}

describe("clearing alert lists", () => {
  it("clears only the requested list for the signed-in account", async () => {
    const mine = await person()
    const theirs = await person()
    await priceAlert(mine, null)
    await priceAlert(mine, new Date(2))
    await lineAlert(mine, null)
    await lineAlert(mine, 2)
    await priceAlert(theirs, null)
    await priceAlert(theirs, new Date(2))
    await lineAlert(theirs, null)
    await lineAlert(theirs, 2)

    expect(await clearAlerts(mine, "active", database)).toBe(2)
    expect(await loadArmedPriceAlerts(mine, database)).toEqual([])
    expect(await loadRecentFiredPriceAlerts(mine, database)).toHaveLength(1)
    expect(await loadDrawingAlerts(mine, 3, database)).toMatchObject({
      armed: [],
      fired: [expect.any(Object)],
    })
    expect(await loadArmedPriceAlerts(theirs, database)).toHaveLength(1)
    expect(await loadDrawingAlerts(theirs, 3, database)).toMatchObject({
      armed: [expect.any(Object)],
      fired: [expect.any(Object)],
    })

    expect(await clearAlerts(mine, "fired", database)).toBe(2)
    expect(await loadRecentFiredPriceAlerts(mine, database)).toEqual([])
    expect(await loadDrawingAlerts(mine, 3, database)).toEqual({
      armed: [],
      fired: [],
    })
    expect(await loadRecentFiredPriceAlerts(theirs, database)).toHaveLength(1)
    expect(await loadDrawingAlerts(theirs, 3, database)).toMatchObject({
      armed: [expect.any(Object)],
      fired: [expect.any(Object)],
    })
  })
})
