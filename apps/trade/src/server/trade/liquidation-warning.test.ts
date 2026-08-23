import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { TradePosition } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
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
import { checkLiquidationWarnings } from "@/server/trade/liquidation-warning"
import { saveLiquidationWarning } from "@/server/trade/prefs"
import { tradeLiquidationWarnings, tradeWallets } from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb
let userId: string

const wallet: TradeWallet = {
  id: "w1",
  label: "Main",
  kind: "live",
  status: "active",
  protocol: "hyperliquid",
  network: "mainnet",
  startingBalance: 1_000,
  address: "0x1111111111111111111111111111111111111111",
  hasKey: true,
  keyValidUntil: null,
}

const position: TradePosition = {
  id: "p1",
  walletId: wallet.id,
  marketKey: "hyperliquid:mainnet:ETH",
  szi: 1,
  entryPx: 100,
  leverage: 5,
  maxLeverage: 20,
  tpPx: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 0,
  live: {
    marginUsed: 20,
    liquidationPx: 82,
    tpOrderId: null,
    slOrderId: null,
  },
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const user = await insertUser(database)
  userId = user.id
  const workspace = await insertWorkspace(database, { userId })
  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: workspace.id })
    .where(eq(customShellUsers.id, userId))
  await database.insert(tradeWallets).values({
    userId,
    id: wallet.id,
    label: wallet.label,
    kind: wallet.kind,
    status: wallet.status,
    protocol: wallet.protocol,
    network: wallet.network,
    startingBalance: wallet.startingBalance,
    address: wallet.address,
  })
})

afterEach(async () => client.close())

describe("the liquidation crossing record", () => {
  it("sends once inside, clears outside, sends once after re-entry, and deletes on close", async () => {
    await saveLiquidationWarning(userId, { usd: 5, pct: null })
    const check = (mark: number, positions = [position]) =>
      checkLiquidationWarnings({
        userId,
        wallet,
        positions,
        marks: new Map([[position.marketKey, mark]]),
        database,
      })

    await check(86)
    await check(85)
    expect(await database.select().from(customShellNotifications)).toHaveLength(
      1
    )

    await check(90)
    await check(86)
    expect(await database.select().from(customShellNotifications)).toHaveLength(
      2
    )
    const notices = await database.select().from(customShellAnnouncements)
    expect(notices[0]?.title).toContain(
      "ETH on Hyperliquid main is 4.65% from liquidation at $82.00"
    )

    await check(86, [])
    expect(await database.select().from(tradeLiquidationWarnings)).toHaveLength(
      0
    )
  })

  it("does nothing while both settings are blank", async () => {
    await checkLiquidationWarnings({
      userId,
      wallet,
      positions: [position],
      marks: new Map([[position.marketKey, 82.1]]),
      database,
    })
    expect(await database.select().from(customShellNotifications)).toHaveLength(
      0
    )
  })
})
