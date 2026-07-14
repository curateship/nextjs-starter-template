import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import * as schema from "@/server/schema"
import {
  getTradingNotificationPage,
  markTradingNotificationRead,
} from "@/server/trading-notifications"
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

async function createUserAndWallet(email: string) {
  const userId = uuid()
  const walletId = uuid()
  const createdAt = now()
  await database.insert(schema.customShellUsers).values({
    id: userId,
    email,
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
    agentAddress: `0x${walletId.replaceAll("-", "").padEnd(40, "0").slice(0, 40)}`,
    encryptedPrivateKey: "encrypted",
    createdAt,
    updatedAt: createdAt,
  })
  return { userId, walletId }
}

async function insertNotification(userId: string, walletId: string) {
  const id = uuid()
  await database.insert(schema.tradingNotifications).values({
    id,
    userId,
    walletId,
    eventKey: "mainnet:0x111:101",
    kind: "position_opened",
    coin: "ETH",
    side: "long",
    price: "1800",
    size: "0.25",
    occurredAt: new Date("2026-07-13T20:00:00.000Z"),
    createdAt: now(),
  })
  return id
}

describe("trading notifications", () => {
  it("lists notifications only for their owner", async () => {
    const owner = await createUserAndWallet("owner@example.test")
    const other = await createUserAndWallet("other@example.test")
    await insertNotification(owner.userId, owner.walletId)

    const ownerPage = await getTradingNotificationPage(
      owner.userId,
      20,
      database as unknown as CustomShellDb
    )
    const otherPage = await getTradingNotificationPage(
      other.userId,
      20,
      database as unknown as CustomShellDb
    )

    expect(ownerPage.unreadCount).toBe(1)
    expect(ownerPage.items).toMatchObject([
      {
        kind: "position_opened",
        coin: "ETH",
        walletLabel: "Main Wallet",
        network: "mainnet",
      },
    ])
    expect(otherPage).toEqual({ items: [], unreadCount: 0 })
  })

  it("marks only the owner's notification as read", async () => {
    const owner = await createUserAndWallet("owner@example.test")
    const other = await createUserAndWallet("other@example.test")
    const notificationId = await insertNotification(
      owner.userId,
      owner.walletId
    )

    await expect(
      markTradingNotificationRead(
        other.userId,
        notificationId,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("Notification not found")

    await markTradingNotificationRead(
      owner.userId,
      notificationId,
      database as unknown as CustomShellDb
    )
    const page = await getTradingNotificationPage(
      owner.userId,
      20,
      database as unknown as CustomShellDb
    )
    expect(page.unreadCount).toBe(0)
    expect(page.items[0]?.readAt).not.toBeNull()
  })
})
