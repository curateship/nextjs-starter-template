import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  checkDrawingAlerts,
  loadDrawingAlerts,
} from "@/server/trade/drawing-alerts"
import {
  deleteChartDrawing,
  loadChartDrawings,
  saveChartDrawing,
  setChartDrawingAlert,
} from "@/server/trade/drawings"
import { tradeChartDrawings } from "@/server/trade/schema"

const BTC = "hyperliquid:mainnet:BTC"

/** From $100 at time 0 rising $10 a second: at 2 seconds the line is at $120. */
const rising = {
  kind: "trendline" as const,
  from: { time: 0, price: 100 },
  to: { time: 1_000, price: 110 },
}

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

async function armedLine(userId: string, currentPrice: number) {
  const id = uuid()
  await saveChartDrawing(userId, BTC, { id, shape: rising })
  await setChartDrawingAlert(userId, { id, on: true, currentPrice }, 2_000)
  return id
}

describe("alerts on drawn lines", () => {
  it("fires once when the price crosses the line where it is now, then stays off", async () => {
    const userId = await person()
    const id = await armedLine(userId, 100)
    const pushedMarks = vi.fn(() => ({
      marks: new Map([[BTC, 125]]),
      missing: [],
    }))

    // At 2 seconds the line is at $120, and the price has risen to $125.
    const checkedAt = new Date(2_000)
    expect(await checkDrawingAlerts({ pushedMarks, checkedAt, database })).toBe(1)
    expect(await checkDrawingAlerts({ pushedMarks, checkedAt, database })).toBe(0)
    expect(pushedMarks).toHaveBeenNthCalledWith(1, [BTC])

    const [drawing] = await loadChartDrawings(userId, BTC)
    expect(drawing?.alert).toEqual({
      direction: "above",
      armedAt: 2_000,
      firedAt: 2_000,
    })
    const notices = await database.select().from(customShellAnnouncements)
    expect(notices.map((notice) => notice.title)).toEqual([
      "BTC crossed your trendline at $120 (was rising)",
    ])
    expect(await database.select().from(customShellNotifications)).toHaveLength(1)
    expect(drawing?.id).toBe(id)
  })

  it("lists armed lines oldest first and fired ones newest first, priced at their moment", async () => {
    const userId = await person()
    const first = await armedLine(userId, 100)
    const second = uuid()
    await saveChartDrawing(userId, BTC, { id: second, shape: rising })
    await setChartDrawingAlert(userId, { id: second, on: true, currentPrice: 100 }, 3_000)
    await saveChartDrawing(userId, BTC, {
      id: uuid(),
      shape: { kind: "level", price: 1 },
    })

    // Read at 5 seconds, both lines are at $150.
    const before = await loadDrawingAlerts(userId, 5_000, database)
    expect(before.armed.map((one) => [one.id, one.price, one.direction])).toEqual([
      [first, 150, "above"],
      [second, 150, "above"],
    ])
    expect(before.fired).toEqual([])

    await checkDrawingAlerts({
      pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
      checkedAt: new Date(2_000),
      database,
    })
    const after = await loadDrawingAlerts(userId, 5_000, database)
    expect(after.armed).toEqual([])
    // Fired at 2 seconds, so the price is the line's at 2 seconds, not now.
    expect(after.fired.map((one) => [one.id, one.price, one.firedAt])).toEqual([
      [second, 120, 2_000],
      [first, 120, 2_000],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  })

  it("waits while the price is still on the armed side, or there is no price", async () => {
    const userId = await person()
    await armedLine(userId, 100)

    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 119]]), missing: [] }),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map(), missing: [BTC] }),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])
  })

  it("reads the slope carried on, so a later check meets a higher line", async () => {
    const userId = await person()
    await armedLine(userId, 100)
    // At 10 seconds the line is at $200; $150 has not crossed it.
    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 150]]), missing: [] }),
        checkedAt: new Date(10_000),
        database,
      })
    ).toBe(0)
  })

  it("never fires a line that was moved or switched off after it was read", async () => {
    const userId = await person()
    const id = await armedLine(userId, 100)
    let interfered = false
    const checkingDatabase = new Proxy(database, {
      get(target, property, receiver) {
        if (property !== "transaction") {
          return Reflect.get(target, property, receiver)
        }
        return async (callback: Parameters<CustomShellDb["transaction"]>[0]) => {
          if (!interfered) {
            interfered = true
            await saveChartDrawing(userId, BTC, {
              id,
              shape: { ...rising, from: { time: 0, price: 300 } },
            })
          }
          return target.transaction(callback)
        }
      },
    })

    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
        checkedAt: new Date(2_000),
        database: checkingDatabase,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])
    expect((await loadChartDrawings(userId, BTC))[0]?.alert?.firedAt).toBeNull()
  })

  it("forgets the alert with the line, and ignores a level", async () => {
    const userId = await person()
    const id = await armedLine(userId, 100)
    await deleteChartDrawing(userId, id)
    await database.insert(tradeChartDrawings).values({
      userId,
      id: uuid(),
      marketKey: BTC,
      shape: { kind: "level", price: 100 },
      alert: { direction: "above", armedAt: 0, firedAt: null },
    })

    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])
  })
})
