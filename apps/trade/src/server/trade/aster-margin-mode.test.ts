import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { encryptSecret } from "@/server/auth/encryption"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { tradeWallets } from "@/server/trade/schema"
import { setRealMoneySwitch } from "@/server/trade/workers"

const { readAccountMode, changeAccountMode } = vi.hoisted(() => ({
  readAccountMode: vi.fn(),
  changeAccountMode: vi.fn(),
}))
vi.mock("@/server/protocols/aster/orders", () => ({
  readAsterAccountMarginMode: readAccountMode,
  changeAsterAccountMarginMode: changeAccountMode,
}))

import {
  loadAsterMarginModeSettings,
  saveAsterMarginModeSetting,
} from "@/server/protocols/aster-margin-mode"

let client: PGlite
let database: CustomShellDb
let previousMainnet: string | undefined

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  previousMainnet = process.env.TRADE_ENABLE_MAINNET
  process.env.TRADE_ENABLE_MAINNET = "true"
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a test-only secret"
  await setRealMoneySwitch(true, database)
  readAccountMode.mockReset()
  changeAccountMode.mockReset()
})

afterEach(async () => {
  if (previousMainnet === undefined) delete process.env.TRADE_ENABLE_MAINNET
  else process.env.TRADE_ENABLE_MAINNET = previousMainnet
  await client.close()
})

async function asterWallet(
  userId: string,
  overrides: Partial<typeof tradeWallets.$inferInsert> = {}
) {
  const id = crypto.randomUUID()
  await database.insert(tradeWallets).values({
    id,
    userId,
    label: "Aster live",
    kind: "live",
    protocol: "aster",
    network: "mainnet",
    startingBalance: 100,
    address: "0x1234567890abcdef1234567890abcdef12345678",
    agentKeyEncrypted: encryptSecret("aster-api-key"),
    ...overrides,
  })
  return id
}

describe("Aster margin settings", () => {
  it("changes Aster first, verifies the answer and then saves the mode", async () => {
    const user = await insertUser(database)
    const walletId = await asterWallet(user.id)
    readAccountMode.mockResolvedValue("cross")

    const saved = await saveAsterMarginModeSetting(user.id, walletId, "cross")

    expect(changeAccountMode).toHaveBeenCalledWith(
      "mainnet",
      expect.objectContaining({
        accountAddress: "0x1234567890abcdef1234567890abcdef12345678",
        agentKey: "aster-api-key",
      }),
      "cross",
      true
    )
    expect(readAccountMode).toHaveBeenCalledWith(
      "mainnet",
      expect.any(Object),
      true
    )
    expect(saved).toEqual({ walletId, label: "Aster live", mode: "cross" })

    const [row] = await database
      .select({ mode: tradeWallets.asterMarginMode })
      .from(tradeWallets)
      .where(eq(tradeWallets.id, walletId))
    expect(row.mode).toBe("cross")
  })

  it("does not expose or change another person's wallet", async () => {
    const owner = await insertUser(database)
    const stranger = await insertUser(database)
    const walletId = await asterWallet(owner.id)

    await expect(
      saveAsterMarginModeSetting(stranger.id, walletId, "cross")
    ).rejects.toThrow("LIVE_WALLET_NOT_FOUND")
    expect(changeAccountMode).not.toHaveBeenCalled()
  })

  it("keeps the saved mode when Aster does not confirm the change", async () => {
    const user = await insertUser(database)
    const walletId = await asterWallet(user.id, {
      asterMarginMode: "isolated",
    })
    readAccountMode.mockResolvedValue("isolated")

    await expect(
      saveAsterMarginModeSetting(user.id, walletId, "cross")
    ).rejects.toThrow("LIVE_MARGIN_MODE")

    const [row] = await database
      .select({ mode: tradeWallets.asterMarginMode })
      .from(tradeWallets)
      .where(eq(tradeWallets.id, walletId))
    expect(row.mode).toBe("isolated")
  })

  it("reads Aster's current mode and repairs an out-of-date saved choice", async () => {
    const user = await insertUser(database)
    const walletId = await asterWallet(user.id, {
      asterMarginMode: "isolated",
    })
    readAccountMode.mockResolvedValue("cross")

    await expect(loadAsterMarginModeSettings(user.id)).resolves.toEqual([
      { walletId, label: "Aster live", mode: "cross" },
    ])

    const [row] = await database
      .select({ mode: tradeWallets.asterMarginMode })
      .from(tradeWallets)
      .where(eq(tradeWallets.id, walletId))
    expect(row.mode).toBe("cross")
  })
})
