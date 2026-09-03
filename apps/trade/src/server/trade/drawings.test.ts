import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DRAWING_ALERT_NEEDS_LINE,
  DRAWINGS_FULL,
  MAX_DRAWINGS_PER_MARKET,
} from "@/lib/trade/drawings"
import { type CustomShellDb } from "@/server/db"
import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  clearChartDrawings,
  deleteChartDrawing,
  loadChartDrawings,
  saveChartDrawing,
  setChartDrawingAlert,
} from "@/server/trade/drawings"
import { tradeChartDrawings } from "@/server/trade/schema"

const BTC = "hyperliquid:mainnet:BTC"
const ETH = "hyperliquid:mainnet:ETH"

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

async function person() {
  return (await insertUser(database)).id
}

describe("the drawings on a chart", () => {
  it("comes back with what was drawn", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 61_500 },
    })

    expect(await loadChartDrawings(userId, BTC)).toEqual([
      { id, shape: { kind: "level", price: 61_500 }, alert: null },
    ])
  })

  it("keeps each market's drawings to itself", async () => {
    const userId = await person()
    await saveChartDrawing(userId, BTC, {
      id: uuid(),
      shape: { kind: "level", price: 61_500 },
    })
    await saveChartDrawing(userId, ETH, {
      id: uuid(),
      shape: { kind: "level", price: 2_400 },
    })

    expect(await loadChartDrawings(userId, BTC)).toHaveLength(1)
    expect(await loadChartDrawings(userId, BTC)).toEqual([
      { id: expect.any(String), shape: { kind: "level", price: 61_500 }, alert: null },
    ])
    expect(await loadChartDrawings(userId, ETH)).toEqual([
      { id: expect.any(String), shape: { kind: "level", price: 2_400 }, alert: null },
    ])
  })

  it("keeps each account's drawings to itself", async () => {
    const mine = await person()
    const theirs = await person()
    await saveChartDrawing(theirs, BTC, {
      id: uuid(),
      shape: { kind: "level", price: 61_500 },
    })

    expect(await loadChartDrawings(mine, BTC)).toEqual([])
  })

  it("moves a drawing in place instead of leaving two", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 61_500 },
    })
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 58_000 },
    })

    expect(await loadChartDrawings(userId, BTC)).toEqual([
      { id, shape: { kind: "level", price: 58_000 }, alert: null },
    ])
  })

  it("cannot be made to write over somebody else's drawing", async () => {
    const mine = await person()
    const theirs = await person()
    const id = uuid()
    await saveChartDrawing(theirs, BTC, {
      id,
      shape: { kind: "level", price: 61_500 },
    })
    // The same id, sent by somebody else: a row of their own, never a change
    // to the one already there.
    await saveChartDrawing(mine, BTC, {
      id,
      shape: { kind: "level", price: 1 },
    })

    expect(await loadChartDrawings(theirs, BTC)).toEqual([
      { id, shape: { kind: "level", price: 61_500 }, alert: null },
    ])
    expect(await loadChartDrawings(mine, BTC)).toEqual([
      { id, shape: { kind: "level", price: 1 }, alert: null },
    ])
  })

  it("cannot move a drawing to another market", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 61_500 },
    })
    await saveChartDrawing(userId, ETH, {
      id,
      shape: { kind: "level", price: 2_400 },
    })

    expect(await loadChartDrawings(userId, BTC)).toEqual([
      { id, shape: { kind: "level", price: 2_400 }, alert: null },
    ])
    expect(await loadChartDrawings(userId, ETH)).toEqual([])
  })

  it("leaves out a row it cannot read, without destroying it", async () => {
    const userId = await person()
    const good = uuid()
    await saveChartDrawing(userId, BTC, {
      id: good,
      shape: { kind: "level", price: 61_500 },
    })
    // A shape from some later build, written straight into the table.
    await database.insert(tradeChartDrawings).values({
      userId,
      id: uuid(),
      marketKey: BTC,
      shape: { kind: "rectangle" } as never,
    })

    expect(await loadChartDrawings(userId, BTC)).toEqual([
      { id: good, shape: { kind: "level", price: 61_500 }, alert: null },
    ])
    const rows = await database
      .select()
      .from(tradeChartDrawings)
      .where(eq(tradeChartDrawings.userId, userId))
    expect(rows).toHaveLength(2)
  })
})

describe("deleting a drawing", () => {
  it("removes it and says it did", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 61_500 },
    })

    expect(await deleteChartDrawing(userId, id)).toBe(true)
    expect(await loadChartDrawings(userId, BTC)).toEqual([])
  })

  it("will not delete somebody else's, and says nothing went", async () => {
    const mine = await person()
    const theirs = await person()
    const id = uuid()
    await saveChartDrawing(theirs, BTC, {
      id,
      shape: { kind: "level", price: 61_500 },
    })

    expect(await deleteChartDrawing(mine, id)).toBe(false)
    expect(await loadChartDrawings(theirs, BTC)).toHaveLength(1)
  })

  it("lets the same drawing be put back, which is what Undo does", async () => {
    const userId = await person()
    const id = uuid()
    const shape = { kind: "level", price: 61_500 } as const
    await saveChartDrawing(userId, BTC, { id, shape })
    await deleteChartDrawing(userId, id)
    await saveChartDrawing(userId, BTC, { id, shape })

    expect(await loadChartDrawings(userId, BTC)).toEqual([{ id, shape, alert: null }])
  })
})

describe("clearing a chart", () => {
  it("takes every drawing on that market and says how many went", async () => {
    const userId = await person()
    await saveChartDrawing(userId, BTC, {
      id: uuid(),
      shape: { kind: "level", price: 61_500 },
    })
    await saveChartDrawing(userId, BTC, {
      id: uuid(),
      shape: {
        kind: "trendline",
        from: { time: 1_000, price: 10 },
        to: { time: 2_000, price: 20 },
      },
    })

    expect(await clearChartDrawings(userId, BTC)).toBe(2)
    expect(await loadChartDrawings(userId, BTC)).toEqual([])
  })

  it("leaves the other markets alone", async () => {
    const userId = await person()
    await saveChartDrawing(userId, BTC, {
      id: uuid(),
      shape: { kind: "level", price: 61_500 },
    })
    await saveChartDrawing(userId, ETH, {
      id: uuid(),
      shape: { kind: "level", price: 2_400 },
    })

    expect(await clearChartDrawings(userId, BTC)).toBe(1)
    expect(await loadChartDrawings(userId, ETH)).toHaveLength(1)
  })

  it("leaves other accounts alone", async () => {
    const mine = await person()
    const theirs = await person()
    await saveChartDrawing(theirs, BTC, {
      id: uuid(),
      shape: { kind: "level", price: 61_500 },
    })

    expect(await clearChartDrawings(mine, BTC)).toBe(0)
    expect(await loadChartDrawings(theirs, BTC)).toHaveLength(1)
  })
})

describe("the cap on one market", () => {
  it("refuses a new drawing past it, and still lets old ones move", async () => {
    const userId = await person()
    await database.insert(tradeChartDrawings).values(
      Array.from({ length: MAX_DRAWINGS_PER_MARKET }, () => ({
        userId,
        id: uuid(),
        marketKey: BTC,
        shape: { kind: "level" as const, price: 1 },
      }))
    )
    const [first] = await loadChartDrawings(userId, BTC)

    await expect(
      saveChartDrawing(userId, BTC, {
        id: uuid(),
        shape: { kind: "level", price: 2 },
      })
    ).rejects.toThrow(DRAWINGS_FULL)

    // Moving one that is already there is not a new drawing.
    await saveChartDrawing(userId, BTC, {
      id: first.id,
      shape: { kind: "level", price: 3 },
    })
    expect(await loadChartDrawings(userId, BTC)).toHaveLength(
      MAX_DRAWINGS_PER_MARKET
    )
  })

  it("is counted per market, not per account", async () => {
    const userId = await person()
    await database.insert(tradeChartDrawings).values(
      Array.from({ length: MAX_DRAWINGS_PER_MARKET }, () => ({
        userId,
        id: uuid(),
        marketKey: BTC,
        shape: { kind: "level" as const, price: 1 },
      }))
    )

    await saveChartDrawing(userId, ETH, {
      id: uuid(),
      shape: { kind: "level", price: 2_400 },
    })
    expect(await loadChartDrawings(userId, ETH)).toHaveLength(1)
  })
})

describe("the alert a trendline carries", () => {
  const line = {
    kind: "trendline" as const,
    from: { time: 0, price: 100 },
    to: { time: 1_000, price: 110 },
  }

  it("arms from the live price, reads back, and switches off", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, { id, shape: line })

    // At time 2,000 the line is at $120; a price of $100 sits below it.
    const armed = await setChartDrawingAlert(
      userId,
      { id, on: true, currentPrice: 100 },
      2_000
    )
    expect(armed.alert).toEqual({
      direction: "above",
      armedAt: 2_000,
      firedAt: null,
    })
    expect(await loadChartDrawings(userId, BTC)).toEqual([
      { id, shape: line, alert: armed.alert },
    ])

    const off = await setChartDrawingAlert(userId, {
      id,
      on: false,
      currentPrice: 100,
    })
    expect(off.alert).toBeNull()
    expect((await loadChartDrawings(userId, BTC))[0]?.alert).toBeNull()
  })

  it("refuses a level, and a line that is not there", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, {
      id,
      shape: { kind: "level", price: 100 },
    })
    await expect(
      setChartDrawingAlert(userId, { id, on: true, currentPrice: 90 })
    ).rejects.toThrow(DRAWING_ALERT_NEEDS_LINE)
    await expect(
      setChartDrawingAlert(userId, { id: uuid(), on: true, currentPrice: 90 })
    ).rejects.toThrow("DRAWING_NOT_FOUND")
  })

  it("points a moved line's alert at the price again, but leaves a fired one", async () => {
    const userId = await person()
    const id = uuid()
    await saveChartDrawing(userId, BTC, { id, shape: line })
    await setChartDrawingAlert(userId, { id, on: true, currentPrice: 100 }, 2_000)

    // Dragged up to $200 and above, with the price still at $150: waits for a rise.
    const higher = { ...line, from: { time: 0, price: 200 }, to: { time: 1_000, price: 210 } }
    await saveChartDrawing(userId, BTC, { id, shape: higher }, 150, 2_000)
    expect((await loadChartDrawings(userId, BTC))[0]?.alert?.direction).toBe(
      "above"
    )
    // Dragged below the price: now waits for a fall.
    const lower = { ...line, from: { time: 0, price: 50 }, to: { time: 1_000, price: 60 } }
    await saveChartDrawing(userId, BTC, { id, shape: lower }, 150, 2_000)
    expect((await loadChartDrawings(userId, BTC))[0]?.alert?.direction).toBe(
      "below"
    )
    // A move with no live price on the screen changes nothing about the alert.
    await saveChartDrawing(userId, BTC, { id, shape: higher })
    expect((await loadChartDrawings(userId, BTC))[0]?.alert?.direction).toBe(
      "below"
    )

    await database
      .update(tradeChartDrawings)
      .set({ alert: { direction: "below", armedAt: 2_000, firedAt: 3_000 } })
      .where(eq(tradeChartDrawings.id, id))
    await saveChartDrawing(userId, BTC, { id, shape: higher }, 150, 4_000)
    expect((await loadChartDrawings(userId, BTC))[0]?.alert).toEqual({
      direction: "below",
      armedAt: 2_000,
      firedAt: 3_000,
    })
  })
})
