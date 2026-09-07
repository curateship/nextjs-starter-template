import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"
import { createPlanPostgresDatabase, deferred } from "./test-postgres"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import type { CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import type { GridPlan } from "@/lib/trade/grid"
import { tradeGridLineStops, tradeSmartLadders, tradeWallets } from "./schema"
import {
  saveChartDrawing,
  setChartDrawingAlert,
  deleteChartDrawing,
  clearChartDrawings,
} from "./drawings"
import { saveLineAlertsPaused } from "./prefs"
import { checkDrawingAlerts } from "./drawing-alerts"
import { completeGridLineStop, readGridLineStop } from "./grid-line-stops"

const marketKey = "hyperliquid:mainnet:BTC"
let client: { close: () => Promise<void>; waitForLock?: () => Promise<void> }
let database: CustomShellDb
let userId: string
let walletId: string
let drawingId: string
const armedAt = 1_000

beforeEach(async () => {
  const test = process.env.TRADE_TEST_POSTGRES_URL
    ? await createPlanPostgresDatabase()
    : await createTestDatabase()
  client = test.client
  database = test.db
  userId = (await insertUser(database)).id
  const workspace = await insertWorkspace(database, { userId })
  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: workspace.id })
    .where(eq(customShellUsers.id, userId))
  walletId = uuid()
  await database
    .insert(tradeWallets)
    .values({
      userId,
      id: walletId,
      label: "Paper",
      kind: "paper",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 1_000,
    })
  drawingId = uuid()
  await saveChartDrawing(userId, marketKey, {
    id: drawingId,
    shape: { kind: "level", price: 100 },
  })
  await setChartDrawingAlert(
    userId,
    { id: drawingId, on: true, currentPrice: 110, buffer: 2 },
    armedAt
  )
})
afterEach(async () => {
  await client.close()
})

async function attach(
  over: { marketKey?: string; drawingId?: string; armedAt?: number } = {}
) {
  const id = uuid()
  // This fixture deliberately writes at the storage boundary to bypass UI/API checks.
  await database.insert(tradeSmartLadders).values({
    userId,
    walletId,
    id,
    marketKey: over.marketKey ?? marketKey,
    kind: "grid",
    status: "active",
    plan: {
      lineStop: {
        drawingId: over.drawingId ?? drawingId,
        armedAt: over.armedAt ?? armedAt,
      },
    } as GridPlan,
  })
  return id
}

async function fire() {
  return checkDrawingAlerts({
    database,
    checkedAt: new Date(2_000),
    pushedMarks: () => ({ marks: new Map([[marketKey, 97]]), missing: [] }),
  })
}

describe("a grid's durable drawing stop", () => {
  it("records the actual buffered firing once for every linked grid", async () => {
    const first = await attach()
    const second = await attach()
    expect(await fire()).toBe(1)
    expect(await fire()).toBe(0)
    const rows = await database.select().from(tradeGridLineStops)
    expect(rows.map((row) => row.gridId).sort()).toEqual([first, second].sort())
    expect(
      rows.every(
        (row) =>
          row.state === "pending" &&
          row.threshold === 98 &&
          row.linePrice === 100 &&
          row.firedAt === 2_000
      )
    ).toBe(true)
    // A new reader after the price recovers still sees the closing instruction.
    const pending = await readGridLineStop(
      userId,
      first,
      marketKey,
      { drawingId, armedAt },
      database
    )
    expect(pending.state).toBe("pending")
  })

  it("refuses stale alerts and alerts from another market or account", async () => {
    await expect(attach({ armedAt: 999 })).rejects.toThrow()
    await expect(
      attach({ marketKey: "hyperliquid:mainnet:ETH" })
    ).rejects.toThrow()
    await expect(attach({ drawingId: uuid() })).rejects.toThrow()
    const other = (await insertUser(database)).id
    const otherLine = uuid()
    await saveChartDrawing(other, marketKey, {
      id: otherLine,
      shape: { kind: "level", price: 50 },
    })
    await setChartDrawingAlert(
      other,
      { id: otherLine, on: true, currentPrice: 110 },
      armedAt
    )
    await expect(attach({ drawingId: otherLine })).rejects.toThrow()
    await fire()
    await expect(attach()).rejects.toThrow()
    expect(await database.select().from(tradeGridLineStops)).toHaveLength(0)
  })

  it("blocks individual and bulk deletion, disabling, invalid moves and master pause", async () => {
    await attach()
    await expect(deleteChartDrawing(userId, drawingId)).rejects.toThrow()
    await expect(clearChartDrawings(userId, marketKey)).rejects.toThrow()
    await expect(
      setChartDrawingAlert(userId, {
        id: drawingId,
        on: false,
        currentPrice: 110,
      })
    ).rejects.toThrow()
    await expect(
      saveChartDrawing(userId, marketKey, {
        id: drawingId,
        shape: {
          kind: "fib",
          from: { time: 0, price: 100 },
          to: { time: 1_000, price: 90 },
        },
      })
    ).rejects.toThrow()
    await expect(saveLineAlertsPaused(userId, true, database)).rejects.toThrow()
    const { clearAlerts } = await import("./alerts")
    await expect(clearAlerts(userId, "active", database)).rejects.toThrow()
    await saveChartDrawing(
      userId,
      marketKey,
      { id: drawingId, shape: { kind: "level", price: 99 } },
      110
    )
  })

  it("cannot discard a pending close through a plan edit", async () => {
    const id = await attach()
    await fire()
    const { tradeChartDrawings } = await import("./schema")
    await expect(
      database
        .update(tradeChartDrawings)
        .set({
          alert: { direction: "below", armedAt, firedAt: null, buffer: 3 },
        })
        .where(
          and(
            eq(tradeChartDrawings.userId, userId),
            eq(tradeChartDrawings.id, drawingId)
          )
        )
    ).rejects.toThrow()
    const where = and(
      eq(tradeSmartLadders.userId, userId),
      eq(tradeSmartLadders.id, id)
    )
    await expect(
      database
        .update(tradeSmartLadders)
        .set({ plan: { lineStop: null } as GridPlan })
        .where(where)
    ).rejects.toThrow()
    await expect(
      database.update(tradeSmartLadders).set({ status: "done" }).where(where)
    ).rejects.toThrow()
    await database.transaction(async (tx) => {
      await completeGridLineStop(userId, id, tx)
      await tx.update(tradeSmartLadders).set({ status: "done" }).where(where)
    })
    expect(await deleteChartDrawing(userId, drawingId)).toBe(true)
  })

  it("releases an unfired link only after the replacement plan saves", async () => {
    const id = await attach()
    await database
      .update(tradeSmartLadders)
      .set({ plan: { lineStop: null } as GridPlan })
      .where(eq(tradeSmartLadders.id, id))
    expect((await database.select().from(tradeGridLineStops))[0].state).toBe(
      "released"
    )
    expect(await deleteChartDrawing(userId, drawingId)).toBe(true)
  })

  it("requires a compatible leader and refuses an older online standby", async () => {
    const { requireGridLineStopEngine } = await import("./grid-line-stops")
    const { tradeWorkerHeartbeats } = await import("./schema")
    await expect(requireGridLineStopEngine(database)).rejects.toThrow(
      "SMART_GRID_LINE_STOP_ENGINE"
    )
    await database.insert(tradeWorkerHeartbeats).values([
      {
        id: "new",
        kind: "ladders",
        role: "leader",
        startedAt: new Date(),
        lastSeenAt: new Date(),
        meta: { gridLineStop: true },
      },
      {
        id: "old",
        kind: "ladders",
        role: "standby",
        startedAt: new Date(),
        lastSeenAt: new Date(),
        meta: {},
      },
    ])
    await expect(requireGridLineStopEngine(database)).rejects.toThrow(
      "SMART_GRID_LINE_STOP_ENGINE"
    )
    await database
      .delete(tradeWorkerHeartbeats)
      .where(eq(tradeWorkerHeartbeats.id, "old"))
    await expect(requireGridLineStopEngine(database)).resolves.toBeUndefined()
  })
})

describe.runIf(!!process.env.TRADE_TEST_POSTGRES_URL)(
  "concurrent drawing stop changes",
  () => {
    it("queues a firing that races attachment instead of losing it", async () => {
      const attached = deferred()
      const finish = deferred()
      const id = uuid()
      const placement = database.transaction(async (tx) => {
        await tx
          .insert(tradeSmartLadders)
          .values({
            userId,
            walletId,
            id,
            marketKey,
            kind: "grid",
            status: "active",
            plan: { lineStop: { drawingId, armedAt } } as GridPlan,
          })
        attached.resolve()
        await finish.promise
      })
      await attached.promise
      const firing = fire()
      try {
        await client.waitForLock!()
      } finally {
        finish.resolve()
      }
      await placement
      expect(await firing).toBe(1)
      expect((await database.select().from(tradeGridLineStops))[0].state).toBe(
        "pending"
      )
    })
    it("refuses a deletion that was waiting while the grid attached", async () => {
      const attached = deferred()
      const finish = deferred()
      const placement = database.transaction(async (tx) => {
        await tx
          .insert(tradeSmartLadders)
          .values({
            userId,
            walletId,
            id: uuid(),
            marketKey,
            kind: "grid",
            status: "active",
            plan: { lineStop: { drawingId, armedAt } } as GridPlan,
          })
        attached.resolve()
        await finish.promise
      })
      await attached.promise
      const deletion = deleteChartDrawing(userId, drawingId).then(
        () => false,
        () => true
      )
      try {
        await client.waitForLock!()
      } finally {
        finish.resolve()
      }
      await placement
      expect(await deletion).toBe(true)
      expect((await database.select().from(tradeGridLineStops))[0].state).toBe(
        "watching"
      )
    })
  }
)
