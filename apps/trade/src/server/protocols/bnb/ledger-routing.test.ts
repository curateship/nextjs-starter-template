import { expect, it, vi } from "vitest"
import { getTableConfig } from "drizzle-orm/pg-core"
const m = vi.hoisted(() => ({
  rootInsert: vi.fn(),
  walletInsert: vi.fn(),
  walletUpdate: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock("@/server/db", () => ({ db: { insert: m.rootInsert } }))
vi.mock("@/server/trade/db", () => ({
  db: { insert: m.walletInsert, transaction: m.transaction },
}))
vi.mock("@/server/trade/history-version", () => ({ bumpTradeHistory: vi.fn() }))
import { rememberBnbSend, recordBnbFill, noteBnbTransaction } from "./ledger"
import { tradeBnbTransactions } from "@/server/trade/schema"
it("keeps durable hashes outside the wallet transaction and all history writes inside it", async () => {
  const owner = { userId: "u", walletId: "w" }
  const hash = `0x${"a".repeat(64)}`
  const token = `0x${"b".repeat(40)}`
  m.rootInsert.mockReturnValue({
    values: () => ({ onConflictDoNothing: async () => undefined }),
  })
  m.walletInsert.mockReturnValue({
    values: () => ({
      onConflictDoNothing: () => ({ returning: async () => [{ id: hash }] }),
    }),
  })
  m.walletUpdate.mockReturnValue({
    set: () => ({ where: async () => undefined }),
  })
  m.transaction.mockImplementation((work) =>
    work({ insert: m.walletInsert, update: m.walletUpdate })
  )
  await rememberBnbSend(owner, {
    hash,
    address: token,
    marketId: token,
    kind: "swap",
  })
  expect(m.rootInsert).toHaveBeenCalledTimes(1)
  expect(m.walletInsert).not.toHaveBeenCalled()
  await recordBnbFill(owner, {
    fillId: hash,
    orderId: hash,
    marketId: token,
    side: "buy",
    px: 2,
    sz: 5,
    at: 1,
    fee: 0.01,
    dir: "Open Long",
    closedPnl: 0,
    liquidation: false,
  })
  await noteBnbTransaction(owner, token, "Receipt confirmed")
  expect(m.rootInsert).toHaveBeenCalledTimes(1)
  expect(m.walletInsert).toHaveBeenCalledTimes(2)
  expect(m.walletUpdate).toHaveBeenCalledWith(tradeBnbTransactions)
  // A wallet FK on the independent insert would wait on the caller's wallet lock.
  expect(
    getTableConfig(tradeBnbTransactions).foreignKeys.map(
      (key) => getTableConfig(key.reference().foreignTable).name
    )
  ).toEqual(["users"])
})
