import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  MAX_ARMED_PRICE_ALERTS,
  PRICE_ALERTS_FULL,
} from "@/lib/trade/price-alerts"
import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import {
  customShellAnnouncements,
  customShellNotifications,
  customShellUsers,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  checkPriceAlerts,
  createPriceAlert,
  deleteFiredPriceAlert,
  deletePriceAlert,
  loadArmedPriceAlerts,
  loadRecentFiredPriceAlerts,
  movePriceAlert,
} from "@/server/trade/price-alerts"
import { tradePriceAlerts } from "@/server/trade/schema"

const BTC = "hyperliquid:mainnet:BTC"
const ETH = "hyperliquid:mainnet:ETH"

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

describe("saved price alerts", () => {
  it("fixes direction from the click-time price and lists only armed rows", async () => {
    const userId = await person()
    const above = await createPriceAlert(userId, {
      id: uuid(),
      marketKey: BTC,
      price: 110,
      currentPrice: 100,
    })
    const below = await createPriceAlert(userId, {
      id: uuid(),
      marketKey: ETH,
      price: 90,
      currentPrice: 100,
    })

    expect(above.direction).toBe("above")
    expect(below.direction).toBe("below")
    expect(await loadArmedPriceAlerts(userId)).toEqual([above, below])

    const firedAt = new Date("2026-08-31T12:00:00.000Z")
    await database
      .update(tradePriceAlerts)
      .set({ firedAt })
      .where(eq(tradePriceAlerts.id, above.id))
    expect(await loadArmedPriceAlerts(userId)).toEqual([below])
    expect(await loadRecentFiredPriceAlerts(userId)).toEqual([
      { ...above, firedAt: firedAt.getTime() },
    ])
    expect(await deletePriceAlert(userId, above.id)).toBe(false)
    expect(await deleteFiredPriceAlert(userId, below.id)).toBe(false)
    expect(await deleteFiredPriceAlert(userId, above.id)).toBe(true)
    expect(await loadRecentFiredPriceAlerts(userId)).toEqual([])
  })

  it("keeps reads and deletes inside the signed-in account", async () => {
    const mine = await person()
    const theirs = await person()
    const alert = await createPriceAlert(theirs, {
      id: uuid(),
      marketKey: BTC,
      price: 110,
      currentPrice: 100,
    })

    expect(await loadArmedPriceAlerts(mine)).toEqual([])
    expect(await loadRecentFiredPriceAlerts(mine)).toEqual([])
    expect(await deletePriceAlert(mine, alert.id)).toBe(false)
    expect(await loadArmedPriceAlerts(theirs)).toEqual([alert])

    const firedAt = new Date("2026-08-31T12:00:00.000Z")
    await database
      .update(tradePriceAlerts)
      .set({ firedAt })
      .where(eq(tradePriceAlerts.id, alert.id))
    expect(await deleteFiredPriceAlert(mine, alert.id)).toBe(false)
    expect(await loadRecentFiredPriceAlerts(theirs)).toEqual([
      { ...alert, firedAt: firedAt.getTime() },
    ])
  })

  it("moves only an owned active alert and fixes its new direction", async () => {
    const mine = await person()
    const theirs = await person()
    const alert = await createPriceAlert(theirs, {
      id: uuid(),
      marketKey: BTC,
      price: 110,
      currentPrice: 100,
    })

    await expect(
      movePriceAlert(mine, {
        id: alert.id,
        price: 90,
        currentPrice: 100,
      })
    ).rejects.toThrow("PRICE_ALERT_NOT_ACTIVE")

    const moved = await movePriceAlert(theirs, {
      id: alert.id,
      price: 90,
      currentPrice: 100,
    })
    expect(moved).toEqual({ ...alert, price: 90, direction: "below" })
    expect(await loadArmedPriceAlerts(theirs)).toEqual([moved])

    await database
      .update(tradePriceAlerts)
      .set({ firedAt: new Date() })
      .where(eq(tradePriceAlerts.id, alert.id))
    await expect(
      movePriceAlert(theirs, {
        id: alert.id,
        price: 120,
        currentPrice: 100,
      })
    ).rejects.toThrow("PRICE_ALERT_NOT_ACTIVE")
  })

  it("refuses a hundred-and-first armed alert in words", async () => {
    const userId = await person()
    await database.insert(tradePriceAlerts).values(
      Array.from({ length: MAX_ARMED_PRICE_ALERTS }, (_, index) => ({
        userId,
        id: uuid(),
        protocol: "hyperliquid" as const,
        network: "mainnet" as const,
        marketKey: `${BTC}-${index}`,
        price: index + 1,
        direction: "above" as const,
      }))
    )

    await expect(
      createPriceAlert(userId, {
        id: uuid(),
        marketKey: BTC,
        price: 110,
        currentPrice: 100,
      })
    ).rejects.toThrow(PRICE_ALERTS_FULL)
  })
})

describe("the engine's alert check", () => {
  it("fires at or beyond the line, once, with its notice and sound metadata", async () => {
    const userId = await person()
    const above = await createPriceAlert(userId, {
      id: uuid(),
      marketKey: BTC,
      price: 110,
      currentPrice: 100,
    })
    const below = await createPriceAlert(userId, {
      id: uuid(),
      marketKey: ETH,
      price: 90,
      currentPrice: 100,
    })
    const pushedMarks = vi.fn(() => ({
      marks: new Map([
        [BTC, 115],
        [ETH, 90],
      ]),
      missing: [],
    }))

    expect(await checkPriceAlerts({ pushedMarks, database })).toBe(2)
    expect(await checkPriceAlerts({ pushedMarks, database })).toBe(0)
    expect(pushedMarks).toHaveBeenNthCalledWith(1, [BTC, ETH])
    expect(pushedMarks).toHaveBeenCalledTimes(1)
    expect(await loadArmedPriceAlerts(userId)).toEqual([])

    const notices = await database.select().from(customShellAnnouncements)
    expect(notices.map((notice) => notice.title)).toEqual([
      "BTC reached $110 (was rising)",
      "ETH reached $90 (was falling)",
    ])
    expect(await database.select().from(customShellNotifications)).toHaveLength(
      2
    )
    const rows = await database.select().from(tradePriceAlerts)
    expect(rows.find((row) => row.id === above.id)?.firedAt).not.toBeNull()
    expect(rows.find((row) => row.id === below.id)?.firedAt).not.toBeNull()
  })

  it("waits when the pushed feed has no fresh price", async () => {
    const userId = await person()
    await createPriceAlert(userId, {
      id: uuid(),
      marketKey: BTC,
      price: 110,
      currentPrice: 100,
    })

    expect(
      await checkPriceAlerts({
        pushedMarks: () => ({ marks: new Map(), missing: [BTC] }),
        database,
      })
    ).toBe(0)
    expect(await loadArmedPriceAlerts(userId)).toHaveLength(1)
    expect(await database.select().from(customShellNotifications)).toEqual([])
  })

  it("does not fire the old line when it is moved during a check", async () => {
    const userId = await person()
    const alert = await createPriceAlert(userId, {
      id: uuid(),
      marketKey: BTC,
      price: 110,
      currentPrice: 100,
    })
    let moved = false
    const checkingDatabase = new Proxy(database, {
      get(target, property, receiver) {
        if (property !== "transaction") {
          return Reflect.get(target, property, receiver)
        }
        return async (
          callback: Parameters<CustomShellDb["transaction"]>[0]
        ) => {
          if (!moved) {
            moved = true
            await movePriceAlert(
              userId,
              { id: alert.id, price: 120, currentPrice: 115 },
              database
            )
          }
          return target.transaction(callback)
        }
      },
    })

    const fired = await checkPriceAlerts({
      pushedMarks: () => ({
        marks: new Map([[BTC, 115]]),
        missing: [],
      }),
      database: checkingDatabase,
    })

    expect(fired).toBe(0)
    expect(await loadArmedPriceAlerts(userId)).toEqual([
      { ...alert, price: 120, direction: "above" },
    ])
    expect(await database.select().from(customShellNotifications)).toEqual([])
  })
})
