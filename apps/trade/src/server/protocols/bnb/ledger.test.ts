import { afterAll, beforeAll, expect, it } from "vitest"
import { createTestDatabase, insertUser } from "@/server/test-support.fast"
import { tradeWallets, tradeLiveFills } from "@/server/trade/schema"
import {
  bnbExecutionNotes,
  finishBnbSend,
  pendingBnbSends,
  recordBnbFill,
  rememberBnbSend,
} from "./ledger"
let test: Awaited<ReturnType<typeof createTestDatabase>>
let owner: { userId: string; walletId: string }
const hash = `0x${"a".repeat(64)}`
const address = `0x${"b".repeat(40)}`
beforeAll(async () => {
  test = await createTestDatabase()
  const user = await insertUser(test.db)
  owner = { userId: user.id, walletId: crypto.randomUUID() }
  await test.db
    .insert(tradeWallets)
    .values({
      userId: owner.userId,
      id: owner.walletId,
      label: "BNB receipt test",
      kind: "live",
      status: "active",
      protocol: "bnb",
      network: "mainnet",
      startingBalance: 0,
      address,
    })
}, 20000)
afterAll(async () => {
  await test?.client.close()
})
it("migrates the schema, retains full hashes, scopes pending sends and preserves confirmed notes", async () => {
  await rememberBnbSend(owner, {
    hash,
    address,
    marketId: address,
    kind: "swap",
  })
  expect((await pendingBnbSends(owner))[0].hash).toBe(hash)
  expect(await pendingBnbSends({ ...owner, userId: "another-owner" })).toEqual(
    []
  )
  const fill = {
    fillId: hash,
    orderId: hash,
    marketId: address,
    side: "buy" as const,
    px: 2,
    sz: 5,
    at: Date.now(),
    fee: 0.01,
    closedPnl: 0,
    dir: "Open Long",
    liquidation: false,
    executionNote: "Network fee. Unlimited approval confirmed.",
  }
  await recordBnbFill(owner, fill)
  await recordBnbFill(owner, fill)
  expect((await test.db.select().from(tradeLiveFills)).length).toBe(1)
  await finishBnbSend(
    owner,
    hash,
    "confirmed",
    "Network fee. Unlimited approval confirmed."
  )
  await finishBnbSend(
    owner,
    hash,
    "confirmed",
    "Later scan must not erase approval details."
  )
  expect(await pendingBnbSends(owner)).toEqual([])
  expect(
    (await bnbExecutionNotes(owner.userId, [owner.walletId], [hash])).get(hash)
  ).toContain("Unlimited approval")
  expect(
    await bnbExecutionNotes("another-owner", [owner.walletId], [hash])
  ).toEqual(new Map())
})
