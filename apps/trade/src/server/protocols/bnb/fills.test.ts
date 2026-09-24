import { beforeEach, expect, it, vi } from "vitest"
import { formatTransactionReceipt, type RpcTransactionReceipt } from "viem"
import fixture from "./swap.fixture.json"
const m = vi.hoisted(() => ({
  head: vi.fn(),
  logs: vi.fn(),
  receipt: vi.fn(),
  block: vi.fn(),
  decimals: vi.fn(),
  pending: vi.fn(),
  remember: vi.fn(),
  finish: vi.fn(),
  record: vi.fn(),
  note: vi.fn(),
}))
vi.mock("./rpc", () => {
  const client = () => ({
    getBlockNumber: m.head,
    getLogs: m.logs,
    getTransactionReceipt: m.receipt,
    getBlock: m.block,
  })
  return {
    bnbReadClient: client,
    bnbLogsClient: client,
    bnbTokenDecimals: m.decimals,
  }
})
vi.mock("@/server/protocols/bnb-ledger", () => ({
  pendingBnbSends: m.pending,
  rememberBnbSend: m.remember,
  finishBnbSend: m.finish,
  recordBnbFill: m.record,
  noteBnbTransaction: m.note,
}))
vi.mock("./markets", () => ({
  bnbAccountMarkets: async () => ({
    prices: new Map([["0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", 750]]),
  }),
}))
vi.mock("./account", () => ({ clearBnbAccountState: vi.fn() }))
import { fetchBnbOrderFills } from "./fills"
import { bnbRefusalError } from "./refusals"
const receipt = formatTransactionReceipt(
  fixture.receipt as RpcTransactionReceipt
)
const owner = () => ({ userId: "u", walletId: crypto.randomUUID() })
beforeEach(() => {
  vi.resetAllMocks()
  m.head.mockResolvedValue(receipt.blockNumber + 10n)
  m.pending.mockResolvedValue([])
  m.logs.mockResolvedValue([{ transactionHash: receipt.transactionHash }])
  m.receipt.mockResolvedValue(receipt)
  m.block.mockResolvedValue({ timestamp: BigInt(fixture.block.timestamp) })
  m.decimals.mockResolvedValue(18)
})

it("does not claim a mined swap moved nothing when its decimals read fails", async () => {
  m.decimals.mockRejectedValue(bnbRefusalError("unknown"))
  const read = fetchBnbOrderFills(
    "mainnet",
    receipt.from,
    0,
    () => null,
    "background",
    owner()
  )
  await expect(read).rejects.toThrow(/did not answer a trade history request/)
  await expect(read).rejects.not.toThrow(/coins moved/i)
  expect(m.record).not.toHaveBeenCalled()
})

it("keeps the pages a node serves when it refuses an older one", async () => {
  const refusal = Object.assign(new Error("limit exceeded"), {
    shortMessage: "limit exceeded",
  })
  // The oldest page of the scan is past what a free node keeps. Every newer
  // page is there, and the swap in them has to reach the Journal.
  m.logs.mockRejectedValueOnce(refusal).mockRejectedValueOnce(refusal)
  const fills = await fetchBnbOrderFills(
    "mainnet",
    receipt.from,
    0,
    () => null,
    "background",
    owner()
  )
  expect(fills).toHaveLength(1)
  expect(m.record).toHaveBeenCalled()
})

it("says the node would not answer, not that a transaction is unconfirmed", async () => {
  m.logs.mockRejectedValue(
    Object.assign(new Error("limit exceeded"), { shortMessage: "limit exceeded" })
  )
  const read = fetchBnbOrderFills(
    "mainnet",
    receipt.from,
    0,
    () => null,
    "background",
    owner()
  )
  await expect(read).rejects.toThrow(/will not answer a trade history request/)
  await expect(read).rejects.not.toThrow(/fee is not confirmed/)
})

it("journals a recovered failed receipt with paid gas and no invented fill", async () => {
  const scope = owner()
  const token = "0xa2120b9e674d3fc3875f415a7df52e382f141225"
  m.pending.mockResolvedValue([
    {
      hash: receipt.transactionHash,
      kind: "swap",
      marketId: token,
      approvals: [{ hash: `0x${"b".repeat(64)}`, feeBnb: 0.000021 }],
    },
  ])
  m.receipt.mockResolvedValue({ ...receipt, status: "reverted" })
  expect(
    await fetchBnbOrderFills(
      "mainnet",
      receipt.from,
      0,
      () => null,
      "background",
      scope
    )
  ).toEqual([])
  expect(m.note).toHaveBeenCalledWith(
    scope,
    token,
    expect.stringContaining("BNB was spent on network fees"),
    "refused"
  )
  expect(m.finish).toHaveBeenCalledWith(
    scope,
    receipt.transactionHash,
    "failed",
    expect.stringContaining("bscscan.com")
  )
  expect(m.record).not.toHaveBeenCalled()
  expect(m.note.mock.calls[0][2]).toContain(
    "Confirmed approvals spent 0.000021 BNB separately."
  )
})
it("keeps missing ownership as a validation error before any chain read", async () => {
  await expect(
    fetchBnbOrderFills("mainnet", receipt.from, 0, () => null)
  ).rejects.toThrow("LIVE_WALLET_NOT_FOUND")
  expect(m.head).not.toHaveBeenCalled()
})
it("pages wallet-filtered USDT logs and deduplicates a public swap into one actual fill", async () => {
  const fills = await fetchBnbOrderFills(
    "mainnet",
    receipt.from,
    0,
    () => null,
    "background",
    owner()
  )
  expect(fills).toHaveLength(1)
  expect(fills[0].sz).toBeCloseTo(10999.84805120629, 8)
  expect(m.receipt).toHaveBeenCalledTimes(1)
  expect(m.logs).toHaveBeenCalledTimes(20)
  for (const [args] of m.logs.mock.calls) {
    expect(
      BigInt(args.toBlock) - BigInt(args.fromBlock) + 1n
    ).toBeLessThanOrEqual(1000n)
    expect(Object.values(args.args)).toEqual([receipt.from])
  }
})
it("recovers a pending receipt even when it predates the recent-log window or since cursor", async () => {
  m.logs.mockResolvedValue([])
  m.pending.mockResolvedValue([
    {
      hash: receipt.transactionHash,
      kind: "swap",
      marketId: "0xa2120b9e674d3fc3875f415a7df52e382f141225",
    },
  ])
  expect(
    await fetchBnbOrderFills(
      "mainnet",
      receipt.from,
      Date.now(),
      () => null,
      "background",
      owner()
    )
  ).toHaveLength(1)
  expect(m.record).toHaveBeenCalledTimes(1)
  expect(m.record.mock.calls[0][1].orderId).toBe(receipt.transactionHash)
})
it("does not invent a fill or clear pending when a receipt is not mined", async () => {
  m.logs.mockResolvedValue([])
  m.pending.mockResolvedValue([{ hash: receipt.transactionHash, kind: "swap" }])
  m.receipt.mockRejectedValue(
    Object.assign(new Error("not mined"), {
      name: "TransactionReceiptNotFoundError",
    })
  )
  expect(
    await fetchBnbOrderFills(
      "mainnet",
      receipt.from,
      0,
      () => null,
      "background",
      owner()
    )
  ).toEqual([])
  expect(m.record).not.toHaveBeenCalled()
  expect(m.finish).not.toHaveBeenCalled()
})
it("does not advance the block cursor after a provider failure", async () => {
  const scope = owner()
  m.receipt.mockRejectedValueOnce(new Error("RPC unavailable"))
  await expect(
    fetchBnbOrderFills(
      "mainnet",
      receipt.from,
      0,
      () => null,
      "background",
      scope
    )
  ).rejects.toThrow("EXCHANGE_BUSY:BNB Chain's node did not answer")
  const first = m.logs.mock.calls[0][0].fromBlock
  m.logs.mockClear()
  await fetchBnbOrderFills(
    "mainnet",
    receipt.from,
    0,
    () => null,
    "background",
    scope
  )
  expect(m.logs.mock.calls[0][0].fromBlock).toBe(first)
})
