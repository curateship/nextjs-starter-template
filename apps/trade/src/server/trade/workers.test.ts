import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { assertRealMoneySwitchOn } from "@/server/protocols/real-money"
import { createTestDatabase } from "@/server/test-support"
import {
  realMoneySwitch,
  setRealMoneySwitch,
} from "@/server/trade/workers"

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
