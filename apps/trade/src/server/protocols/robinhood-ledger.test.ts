import { afterAll, beforeAll, expect, it } from "vitest"
import { createTestDatabase, insertUser } from "@/server/test-support.fast"
import { tradeLiveFills, tradeWallets } from "@/server/trade/schema"
import {
  finishRobinhoodSend,
  pendingRobinhoodSends,
  recordRobinhoodFill,
  rememberRobinhoodSend,
  robinhoodExecutionNotes,
  withRobinhoodSendLock,
} from "./robinhood-ledger"

let test: Awaited<ReturnType<typeof createTestDatabase>>
let owner: { userId: string; walletId: string }
const hash = `0x${"a".repeat(64)}`
const address = `0x${"b".repeat(40)}`
const nvda = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"

beforeAll(async () => {
  test = await createTestDatabase()
  const user = await insertUser(test.db)
  owner = { userId: user.id, walletId: crypto.randomUUID() }
  await test.db.insert(tradeWallets).values({
    userId: owner.userId,
    id: owner.walletId,
    label: "Robinhood receipt test",
    kind: "live",
    status: "active",
    protocol: "robinhood",
    network: "mainnet",
    startingBalance: 0,
    address,
  })
}, 20000)
afterAll(async () => {
  await test?.client.close()
})

it("keeps a signed hash before sending, blocks a second send and records the fill once", async () => {
  await rememberRobinhoodSend(owner, {
    hash,
    address: address.toUpperCase().replace("0X", "0x"),
    marketId: nvda,
    kind: "swap",
    approvals: [{ hash: `0x${"c".repeat(64)}`, feeEth: 0.000016 }],
  })
  const [pending] = await pendingRobinhoodSends(owner)
  expect(pending).toMatchObject({ hash, address, state: "pending" })
  expect(pending.approvals).toEqual([
    { hash: `0x${"c".repeat(64)}`, feeEth: 0.000016 },
  ])
  // Another owner sees nothing, and nothing new may be sent from the address.
  expect(
    await pendingRobinhoodSends({ ...owner, userId: "another-owner" })
  ).toEqual([])
  await expect(withRobinhoodSendLock(address, async () => "sent")).rejects.toThrow(
    "has not confirmed the transaction"
  )

  const fill = {
    fillId: hash,
    orderId: hash,
    marketId: nvda,
    side: "buy" as const,
    px: 225.21,
    sz: 0.0444,
    at: Date.now(),
    fee: 0.04,
    closedPnl: 0,
    dir: "Open Long",
    liquidation: false,
    executionNote: "Network fee 0.000016 ETH. Approval confirmed.",
  }
  await recordRobinhoodFill(owner, fill)
  await recordRobinhoodFill(owner, fill)
  const fills = await test.db.select().from(tradeLiveFills)
  expect(fills).toHaveLength(1)
  expect(fills[0].marketKey).toBe(`robinhood:mainnet:${nvda}`)
  expect(await pendingRobinhoodSends(owner)).toEqual([])
  // A later scan does not overwrite the note the swap confirmed with.
  await finishRobinhoodSend(owner, hash, "confirmed", "Later scan note.")
  expect(
    (await robinhoodExecutionNotes(owner.userId, [owner.walletId], [hash])).get(
      hash
    )
  ).toContain("Approval confirmed")
  expect(await withRobinhoodSendLock(address, async () => "sent")).toBe("sent")
})
