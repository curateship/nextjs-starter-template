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
  setChartDrawingAlertBuffer,
} from "@/server/trade/drawings"
import { saveLineAlertsPaused } from "@/server/trade/prefs"

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
    // The price it crossed at is kept, so the chart can mark the spot.
    expect(drawing?.alert).toEqual({
      direction: "above",
      armedAt: 2_000,
      firedAt: 2_000,
      firedPrice: 120,
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
    expect(before.paused).toBe(false)
    expect(before.fired).toEqual([])

    await checkDrawingAlerts({
      pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
      checkedAt: new Date(2_000),
      database,
    })
    const after = await loadDrawingAlerts(userId, 5_000, database)
    expect(after.armed).toEqual([])
    expect(after.paused).toBe(false)
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

  it("forgets the alert with the line", async () => {
    const userId = await person()
    const id = await armedLine(userId, 100)
    await deleteChartDrawing(userId, id)

    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])
  })

  it("says the line's name instead of its price, and lists it by name", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { ...rising, name: "4h base" },
    })
    await setChartDrawingAlert(userId, { id, on: true, currentPrice: 100 }, 2_000)

    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(1)
    const notices = await database.select().from(customShellAnnouncements)
    expect(notices.map((notice) => notice.title)).toEqual([
      "BTC crossed 4h base (was rising)",
    ])
    expect(notices[0]?.body).toContain("4h base was at $120.")
    const { fired } = await loadDrawingAlerts(userId, 5_000, database)
    expect(fired.map((one) => one.name)).toEqual(["4h base"])
  })

  it("fires a level once when the price falls through it, and says level", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 100 },
    })
    // The price is above the level, so it waits for a fall.
    await setChartDrawingAlert(userId, { id, on: true, currentPrice: 110 }, 1_000)
    const pushedMarks = () => ({ marks: new Map([[BTC, 99]]), missing: [] })

    expect(
      await checkDrawingAlerts({ pushedMarks, checkedAt: new Date(2_000), database })
    ).toBe(1)
    expect(
      await checkDrawingAlerts({ pushedMarks, checkedAt: new Date(3_000), database })
    ).toBe(0)
    const notices = await database.select().from(customShellAnnouncements)
    expect(notices.map((notice) => notice.title)).toEqual([
      "BTC crossed your level at $100 (was falling)",
    ])
    expect((await loadChartDrawings(userId, BTC))[0]?.alert?.firedAt).toBe(2_000)
  })
})

describe("the break buffer", () => {
  /** A level at $60,000 armed from below, so it waits for a rise. */
  async function levelWaitingForARise(userId: string, buffer: number | null) {
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 60_000 },
    })
    await setChartDrawingAlert(userId, { id, on: true, currentPrice: 59_000 }, 1_000)
    if (buffer !== null) await setChartDrawingAlertBuffer(userId, { id, buffer })
    return id
  }

  const at = (mark: number) => () => ({
    marks: new Map([[BTC, mark]]),
    missing: [] as string[],
  })

  it("stays quiet until the price is that percentage past the line, then fires once", async () => {
    const userId = await person()
    // A tenth of a percent of $60,000 is $60, so it fires at $60,060.
    await levelWaitingForARise(userId, 0.1)

    // Past the line, but a wick that only kisses it is not a break.
    expect(
      await checkDrawingAlerts({
        pushedMarks: at(60_030),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])

    expect(
      await checkDrawingAlerts({
        pushedMarks: at(60_060),
        checkedAt: new Date(3_000),
        database,
      })
    ).toBe(1)
    expect(
      await checkDrawingAlerts({
        pushedMarks: at(60_060),
        checkedAt: new Date(4_000),
        database,
      })
    ).toBe(0)

    const notices = await database.select().from(customShellAnnouncements)
    // The title names the line, which is the level somebody drew; the body
    // says how far past it the price had to go.
    expect(notices.map((notice) => notice.title)).toEqual([
      "BTC crossed your level at $60,000 (was rising)",
    ])
    expect(notices[0]?.body).toContain("The price had to go 0.1% past the level.")
  })

  it("is the same instruction on a coin worth twenty cents", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 0.21 },
    })
    await setChartDrawingAlert(userId, { id, on: true, currentPrice: 0.2 }, 1_000)
    await setChartDrawingAlertBuffer(userId, { id, buffer: 1 })

    // One percent of twenty-one cents is a fifth of a cent, so it fires at
    // $0.2121. A fixed number of dollars could never have been reached here.
    expect(
      await checkDrawingAlerts({
        pushedMarks: at(0.212),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(
      await checkDrawingAlerts({
        pushedMarks: at(0.2121),
        checkedAt: new Date(3_000),
        database,
      })
    ).toBe(1)
  })

  it("takes the buffer off the other side when the alert waits for a fall", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 60_000 },
    })
    // Armed from above, so it waits for a fall.
    await setChartDrawingAlert(userId, { id, on: true, currentPrice: 61_000 }, 1_000)
    await setChartDrawingAlertBuffer(userId, { id, buffer: 0.1 })

    expect(
      await checkDrawingAlerts({
        pushedMarks: at(59_970),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(
      await checkDrawingAlerts({
        pushedMarks: at(59_940),
        checkedAt: new Date(3_000),
        database,
      })
    ).toBe(1)
  })

  it("fires at the line itself once the buffer is cleared", async () => {
    const userId = await person()
    const id = await levelWaitingForARise(userId, 0.1)
    await setChartDrawingAlertBuffer(userId, { id, buffer: null })

    expect(
      await checkDrawingAlerts({
        pushedMarks: at(60_010),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(1)
    const notices = await database.select().from(customShellAnnouncements)
    expect(notices[0]?.body).not.toContain("past the level")
  })

  it("keeps the buffer when a fired line is switched on again", async () => {
    const userId = await person()
    const id = await levelWaitingForARise(userId, 0.1)
    await checkDrawingAlerts({
      pushedMarks: at(60_060),
      checkedAt: new Date(2_000),
      database,
    })
    expect((await loadChartDrawings(userId, BTC))[0]?.alert?.firedAt).toBe(2_000)

    // The same watch carried on, so it waits the same $50 past the line.
    const again = await setChartDrawingAlert(
      userId,
      { id, on: true, currentPrice: 59_000 },
      3_000
    )
    expect(again.alert).toEqual({
      direction: "above",
      armedAt: 3_000,
      firedAt: null,
      buffer: 0.1,
    })
  })
})

describe("the master switch in Settings", () => {
  it("fires nothing while paused, waits for the price to come back, then fires once", async () => {
    const userId = await person()
    const id = await armedLine(userId, 100)
    await saveLineAlertsPaused(userId, true, database)
    const silence = { marks: new Map([[BTC, 125]]), missing: [] }

    // At 2 seconds the line is at $120 and the price is $125: a cross, and
    // nothing fires.
    expect(
      await checkDrawingAlerts({
        pushedMarks: () => silence,
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])

    // The line is still armed, and now waits for the price to fall back.
    const paused = await loadDrawingAlerts(userId, 2_000, database)
    expect(paused.paused).toBe(true)
    expect(paused.armed.map((one) => one.direction)).toEqual(["below"])

    // Switched back on with the price still above the line: still silent.
    await saveLineAlertsPaused(userId, false, database)
    expect(
      await checkDrawingAlerts({
        pushedMarks: () => silence,
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toEqual([])

    // Crossed again, the other way: one notice.
    const pushedMarks = () => ({ marks: new Map([[BTC, 110]]), missing: [] })
    expect(
      await checkDrawingAlerts({ pushedMarks, checkedAt: new Date(2_000), database })
    ).toBe(1)
    expect(
      await checkDrawingAlerts({ pushedMarks, checkedAt: new Date(3_000), database })
    ).toBe(0)
    expect(await database.select().from(customShellNotifications)).toHaveLength(1)
    expect((await loadChartDrawings(userId, BTC))[0]?.id).toBe(id)
  })

  it("leaves another account's lines firing", async () => {
    const paused = await person()
    const watching = await person()
    await armedLine(paused, 100)
    await armedLine(watching, 100)
    await saveLineAlertsPaused(paused, true, database)

    expect(
      await checkDrawingAlerts({
        pushedMarks: () => ({ marks: new Map([[BTC, 125]]), missing: [] }),
        checkedAt: new Date(2_000),
        database,
      })
    ).toBe(1)
    const notices = await database.select().from(customShellNotifications)
    expect(notices.map((notice) => notice.recipientUserId)).toEqual([watching])
  })

  it("writes nothing to a paused line the price has not crossed", async () => {
    const userId = await person()
    await armedLine(userId, 100)
    await saveLineAlertsPaused(userId, true, database)

    await checkDrawingAlerts({
      pushedMarks: () => ({ marks: new Map([[BTC, 119]]), missing: [] }),
      checkedAt: new Date(2_000),
      database,
    })
    expect((await loadChartDrawings(userId, BTC))[0]?.alert).toEqual({
      direction: "above",
      armedAt: 2_000,
      firedAt: null,
    })
  })
})
