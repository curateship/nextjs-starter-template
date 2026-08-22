import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import type { CustomShellDb } from "@/server/db"
import { assertRealMoneySwitchOn } from "@/server/protocols/real-money"
import { createTestDatabase } from "@/server/test-support"
import {
  realMoneySwitch,
  setRealMoneySwitch,
  setWorkerSwitch,
} from "@/server/trade/workers"
import { tradeWorkerControls } from "@/server/trade/schema"

/**
 * The real-money permission, both layers.
 *
 * The point being pinned down: a fresh database means OFF, whatever the
 * environment says — real money is opt-in twice, and nothing here may seed it
 * on. The worker switches next to it default ON, which is right for them and
 * would be wrong for this.
 */

let db: CustomShellDb

beforeEach(async () => {
  ;({ db } = await createTestDatabase())
  delete process.env.TRADE_ENABLE_MAINNET
})

afterEach(() => {
  delete process.env.TRADE_ENABLE_MAINNET
})

describe("the real-money switch", () => {
  it("is off in a fresh database, even with the master lock open", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    expect(await realMoneySwitch(db)).toEqual({
      masterAllowed: true,
      enabled: false,
    })
    await expect(assertRealMoneySwitchOn(db)).rejects.toThrow(
      "LIVE_MAINNET_OFF"
    )
  })

  it("stays refused by the master lock even when the toggle is on", async () => {
    await setRealMoneySwitch(true, db)
    expect(await realMoneySwitch(db)).toEqual({
      masterAllowed: false,
      enabled: true,
    })
    await expect(assertRealMoneySwitchOn(db)).rejects.toThrow(
      "LIVE_MAINNET_OFF"
    )
  })

  it("passes only when both layers say yes, and off turns it back off", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    await setRealMoneySwitch(true, db)
    await expect(assertRealMoneySwitchOn(db)).resolves.toBeUndefined()

    await setRealMoneySwitch(false, db)
    await expect(assertRealMoneySwitchOn(db)).rejects.toThrow(
      "LIVE_MAINNET_OFF"
    )
  })
})

describe("the ladders switch", () => {
  it("starts a new health window only when it is switched on", async () => {
    const oldEnabledAt = new Date("2026-08-01T00:00:00.000Z")
    await db
      .update(tradeWorkerControls)
      .set({ enabledAt: oldEnabledAt })
      .where(eq(tradeWorkerControls.kind, "ladders"))

    await setWorkerSwitch("ladders", { paused: true }, db)
    const [paused] = await db
      .select({ enabledAt: tradeWorkerControls.enabledAt })
      .from(tradeWorkerControls)
      .where(eq(tradeWorkerControls.kind, "ladders"))
    expect(paused?.enabledAt).toEqual(oldEnabledAt)

    await setWorkerSwitch("ladders", { enabled: true }, db)
    const [enabled] = await db
      .select({ enabledAt: tradeWorkerControls.enabledAt })
      .from(tradeWorkerControls)
      .where(eq(tradeWorkerControls.kind, "ladders"))
    expect(enabled?.enabledAt.getTime()).toBeGreaterThan(oldEnabledAt.getTime())
  })
})
