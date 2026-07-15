import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import * as schema from "@/server/schema"
import {
  syncTradingNotificationsForAllUsers,
  syncTradingNotificationsForUser,
  type TradingNotificationExchange,
} from "@/server/trading-notification-sync"
import { getTradingNotificationPage } from "@/server/trading-notifications"
import type { CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0004_trading.sql",
    "../../drizzle/0021_wallet_onboarding.sql",
    "../../drizzle/0031_trading_notifications.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

async function createUserAndWallet() {
  const userId = uuid()
  const walletId = uuid()
  const createdAt = now()
  await database.insert(schema.customShellUsers).values({
    id: userId,
    email: "owner@example.test",
    name: "Trader",
    role: "user",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  await database.insert(schema.tradingWallets).values({
    id: walletId,
    userId,
    label: "Main Wallet",
    network: "mainnet",
    accountAddress: "0x1111111111111111111111111111111111111111",
    agentAddress: "0x2222222222222222222222222222222222222222",
    encryptedPrivateKey: "encrypted",
    createdAt,
    updatedAt: createdAt,
  })
  return { userId, walletId }
}

function exchangeWith(
  fills: Awaited<ReturnType<TradingNotificationExchange["listFills"]>>,
  orders: Awaited<ReturnType<TradingNotificationExchange["listOrders"]>> = []
) {
  return {
    listFills: vi.fn().mockResolvedValue(fills),
    listOrders: vi.fn().mockResolvedValue(orders),
    getOrder: vi.fn().mockResolvedValue(null),
  } satisfies TradingNotificationExchange
}

describe("syncTradingNotificationsForUser", () => {
  it("syncs active wallets without a browser request", async () => {
    const { userId } = await createUserAndWallet()
    const exchange = exchangeWith([
      {
        tid: 100,
        oid: 500,
        coin: "BTC",
        px: "68000",
        sz: "0.01",
        side: "B",
        startPosition: "0",
        time: Date.parse("2026-07-13T20:00:20.000Z"),
      },
    ])

    await syncTradingNotificationsForAllUsers({
      database: database as unknown as CustomShellDb,
      exchange,
      syncedAt: new Date("2026-07-13T20:00:20.000Z"),
    })

    expect(
      await getTradingNotificationPage(
        userId,
        20,
        database as unknown as CustomShellDb
      )
    ).toMatchObject({ items: [{ coin: "BTC", kind: "position_opened" }] })
  })

  it("records verified fills returned by Hyperliquid", async () => {
    const { userId } = await createUserAndWallet()
    const exchange = exchangeWith([
      {
        tid: 101,
        oid: 501,
        coin: "ETH",
        px: "1800",
        sz: "0.25",
        side: "B",
        startPosition: "0",
        time: Date.parse("2026-07-13T20:00:20.000Z"),
      },
    ])

    await syncTradingNotificationsForUser(userId, {
      database: database as unknown as CustomShellDb,
      exchange,
      syncedAt: new Date("2026-07-13T20:00:20.000Z"),
    })
    await syncTradingNotificationsForUser(userId, {
      database: database as unknown as CustomShellDb,
      exchange,
      syncedAt: new Date("2026-07-13T20:00:30.000Z"),
    })

    const page = await getTradingNotificationPage(
      userId,
      20,
      database as unknown as CustomShellDb
    )
    expect(page.items).toMatchObject([
      { kind: "position_opened", coin: "ETH", side: "long" },
    ])
    expect(page.items).toHaveLength(1)
  })

  it("recovers take-profit fills after the previous sync", async () => {
    const { userId } = await createUserAndWallet()
    const firstExchange = exchangeWith([])
    await syncTradingNotificationsForUser(userId, {
      database: database as unknown as CustomShellDb,
      exchange: firstExchange,
      syncedAt: new Date("2026-07-13T20:00:20.000Z"),
    })

    const exchange = exchangeWith(
      [
        {
          tid: 102,
          oid: 700,
          coin: "ETH",
          px: "1900",
          sz: "0.25",
          side: "A",
          startPosition: "0.25",
          time: Date.parse("2026-07-13T20:05:00.000Z"),
        },
      ],
      [{ oid: 700, orderType: "Take Profit Market" }]
    )

    await syncTradingNotificationsForUser(userId, {
      database: database as unknown as CustomShellDb,
      exchange,
      syncedAt: new Date("2026-07-13T20:05:10.000Z"),
    })

    const page = await getTradingNotificationPage(
      userId,
      20,
      database as unknown as CustomShellDb
    )
    expect(page.items).toMatchObject([
      { kind: "take_profit", coin: "ETH", side: "long" },
    ])
  })

  it("does not call Hyperliquid again inside the sync interval", async () => {
    const { userId } = await createUserAndWallet()
    const exchange = exchangeWith([])
    await syncTradingNotificationsForUser(userId, {
      database: database as unknown as CustomShellDb,
      exchange,
      syncedAt: new Date("2026-07-13T20:00:20.000Z"),
    })

    exchange.listFills.mockClear()
    await syncTradingNotificationsForUser(userId, {
      database: database as unknown as CustomShellDb,
      exchange,
      syncedAt: new Date("2026-07-13T20:00:22.000Z"),
    })

    expect(exchange.listFills).not.toHaveBeenCalled()
  })

  it("rejects malformed fill data returned by the exchange", async () => {
    const { userId } = await createUserAndWallet()
    const exchange = exchangeWith([
      {
        tid: 103,
        oid: 502,
        coin: "<script>",
        px: "1800",
        sz: "0.25",
        side: "B",
        startPosition: "0",
        time: Date.parse("2026-07-13T20:00:20.000Z"),
      },
    ])

    await expect(
      syncTradingNotificationsForUser(userId, {
        database: database as unknown as CustomShellDb,
        exchange,
        syncedAt: new Date("2026-07-13T20:00:20.000Z"),
      })
    ).rejects.toThrow("Hyperliquid returned an invalid fill")
  })
})
