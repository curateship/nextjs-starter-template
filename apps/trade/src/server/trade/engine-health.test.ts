import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import type { CustomShellDb } from "@/server/db"
import {
  customShellAnnouncements,
  customShellNotifications,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  tradeEngineOutages,
  tradeWorkerControls,
  tradeWorkerHeartbeats,
} from "@/server/trade/schema"
import {
  ENGINE_OUTAGE_AFTER_MS,
  monitorTradingEngine,
} from "@/server/trade/engine-health"

let database: CustomShellDb
let close: () => Promise<void>
let adminId: string
const publish = vi.fn(async () => {})
const startedAt = new Date("2026-08-22T07:12:00.000Z")

beforeEach(async () => {
  const test = await createTestDatabase()
  database = test.db
  close = () => test.client.close()
  const workspace = await insertWorkspace(database)
  adminId = (
    await insertUser(database, {
      role: "admin",
      currentWorkspaceId: workspace.id,
    })
  ).id
  publish.mockClear()
})

afterEach(async () => {
  await close()
})

async function setControl(enabled: boolean, updatedAt = startedAt) {
  await database
    .update(tradeWorkerControls)
    .set({ enabled, enabledAt: updatedAt, paused: false, updatedAt })
    .where(eq(tradeWorkerControls.kind, "ladders"))
}

async function heartbeat(lastSeenAt: Date) {
  await database.insert(tradeWorkerHeartbeats).values({
    id: crypto.randomUUID(),
    kind: "ladders",
    startedAt,
    lastSeenAt,
    role: "leader",
    meta: {},
  })
}

async function notices() {
  return database
    .select({
      title: customShellAnnouncements.title,
      body: customShellAnnouncements.body,
    })
    .from(customShellNotifications)
    .innerJoin(
      customShellAnnouncements,
      eq(customShellAnnouncements.id, customShellNotifications.announcementId)
    )
    .where(eq(customShellNotifications.recipientUserId, adminId))
}

describe("trading engine health notices", () => {
  it("stays quiet through the measured restart window", async () => {
    await setControl(true)
    await heartbeat(startedAt)

    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + 12_318),
      publish,
    })

    expect(await notices()).toEqual([])
    expect(publish).not.toHaveBeenCalled()
  })

  it("sends one outage notice after 45 seconds and stays quiet after that", async () => {
    await setControl(true)
    await heartbeat(startedAt)
    const checkedAt = new Date(startedAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1)

    await monitorTradingEngine({ database, checkedAt, publish })
    await monitorTradingEngine({
      database,
      checkedAt: new Date(checkedAt.getTime() + 15_000),
      publish,
    })

    expect(await notices()).toEqual([
      {
        title: "The trading engine stopped at 3:12 AM EDT",
        body: "Watched orders and ladder rungs will not fire until it is running again.",
      },
    ])
    expect(publish).toHaveBeenCalledTimes(1)
    expect(await database.select().from(tradeEngineOutages)).toHaveLength(1)
  })

  it("sends one all clear with the outage length, then clears the outage", async () => {
    await setControl(true)
    await heartbeat(startedAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1),
      publish,
    })

    const recoveredAt = new Date(startedAt.getTime() + 72_000)
    await heartbeat(recoveredAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(recoveredAt.getTime() + 1_000),
      publish,
    })
    await monitorTradingEngine({
      database,
      checkedAt: new Date(recoveredAt.getTime() + 16_000),
      publish,
    })

    expect(await notices()).toEqual([
      {
        title: "The trading engine stopped at 3:12 AM EDT",
        body: "Watched orders and ladder rungs will not fire until it is running again.",
      },
      {
        title: "The trading engine came back at 3:13 AM EDT",
        body: "It was unavailable for 1 minute 12 seconds. Watched orders and ladder rungs are working again.",
      },
    ])
    expect(publish).toHaveBeenCalledTimes(2)
    expect(await database.select().from(tradeEngineOutages)).toEqual([])
  })

  it("sends nothing while the ladders switch is off", async () => {
    await setControl(false)
    await heartbeat(startedAt)

    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1),
      publish,
    })

    expect(await notices()).toEqual([])
    expect(publish).not.toHaveBeenCalled()
    expect(await database.select().from(tradeEngineOutages)).toEqual([])
  })

  it("clears a recorded outage without an all clear when switched off", async () => {
    await setControl(true)
    await heartbeat(startedAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1),
      publish,
    })
    publish.mockClear()

    await setControl(false, new Date(startedAt.getTime() + 60_000))
    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + 61_000),
      publish,
    })

    expect(await notices()).toHaveLength(1)
    expect(publish).not.toHaveBeenCalled()
    expect(await database.select().from(tradeEngineOutages)).toEqual([])
  })

  it("stays quiet when switched off and on again between checks", async () => {
    await setControl(true)
    await heartbeat(startedAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1),
      publish,
    })
    publish.mockClear()

    await setControl(false, new Date(startedAt.getTime() + 60_000))
    const switchedOnAt = new Date(startedAt.getTime() + 61_000)
    await setControl(true, switchedOnAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(switchedOnAt.getTime() + 1_000),
      publish,
    })

    expect(await notices()).toHaveLength(1)
    expect(publish).not.toHaveBeenCalled()
    expect(await database.select().from(tradeEngineOutages)).toEqual([])
  })

  it("starts a new outage after a quick off and on reaches 45 seconds", async () => {
    await setControl(true)
    await heartbeat(startedAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(startedAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1),
      publish,
    })
    publish.mockClear()

    await setControl(false, new Date(startedAt.getTime() + 60_000))
    const switchedOnAt = new Date(startedAt.getTime() + 61_000)
    await setControl(true, switchedOnAt)
    await monitorTradingEngine({
      database,
      checkedAt: new Date(switchedOnAt.getTime() + ENGINE_OUTAGE_AFTER_MS + 1),
      publish,
    })

    expect(await notices()).toHaveLength(2)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(await database.select().from(tradeEngineOutages)).toEqual([
      expect.objectContaining({ outageStartedAt: switchedOnAt }),
    ])
  })

  it("gives a newly switched-on engine the full 45 seconds", async () => {
    await setControl(false)
    await heartbeat(startedAt)
    const switchedOnAt = new Date(startedAt.getTime() + 10 * 60_000)
    await setControl(true, switchedOnAt)

    await monitorTradingEngine({
      database,
      checkedAt: new Date(switchedOnAt.getTime() + ENGINE_OUTAGE_AFTER_MS),
      publish,
    })

    expect(await notices()).toEqual([])
    expect(publish).not.toHaveBeenCalled()
  })
})
