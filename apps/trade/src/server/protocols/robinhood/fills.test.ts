import { beforeEach, expect, it, vi } from "vitest"
import {
  formatTransactionReceipt,
  HttpRequestError,
  TransactionReceiptNotFoundError,
  type RpcTransactionReceipt,
} from "viem"
import fixture from "./fills.fixture.json"

const m = vi.hoisted(() => ({
  explorer: vi.fn(),
  receipt: vi.fn(),
  block: vi.fn(),
  pending: vi.fn(),
  finish: vi.fn(),
  note: vi.fn(),
  remember: vi.fn(),
  record: vi.fn(),
}))
vi.mock("./client", async (original) => ({
  ...(await original<object>()),
  robinhoodServiceGet: m.explorer,
}))
vi.mock("./rpc", () => ({
  robinhoodTokenDecimals: async () => 18,
  robinhoodReadClient: () => ({
    getTransactionReceipt: m.receipt,
    getBlock: m.block,
  }),
}))
vi.mock("./markets", () => ({ robinhoodEthPrice: async () => 2685 }))
vi.mock("./account", () => ({ clearRobinhoodAccountState: vi.fn() }))
vi.mock("@/server/protocols/robinhood-ledger", () => ({
  pendingRobinhoodSends: m.pending,
  finishRobinhoodSend: m.finish,
  noteRobinhoodTransaction: m.note,
  rememberRobinhoodSend: m.remember,
  recordRobinhoodFill: m.record,
}))
import { fetchRobinhoodOrderFills } from "./fills"

// A real wallet's two swaps on 24 Sep 2026: 177.45 USDG for NVDA at 14:31,
// and a token sold for 177.36 USDG at 14:29. Its next transfer, at 13:34, is
// older than the sweep asks for.
const WALLET = fixture.wallet
const BUY = fixture.receipt.transactionHash
const SELL = fixture.sellReceipt.transactionHash
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"
const SOLD = "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3"
const since = Date.parse("2026-09-24T14:00:00Z")
const owner = { userId: "u", walletId: "w" }
const receipts = new Map([
  [BUY, formatTransactionReceipt(fixture.receipt as unknown as RpcTransactionReceipt)],
  [SELL, formatTransactionReceipt(fixture.sellReceipt as unknown as RpcTransactionReceipt)],
])
const times = new Map([
  [receipts.get(BUY)!.blockNumber, BigInt(fixture.blockTimestamp)],
  [receipts.get(SELL)!.blockNumber, BigInt(fixture.sellBlockTimestamp)],
])
const fills = () =>
  fetchRobinhoodOrderFills("mainnet", WALLET, since, () => null, undefined, owner)

beforeEach(() => {
  vi.resetAllMocks()
  m.explorer.mockResolvedValue(fixture.transfers)
  m.pending.mockResolvedValue([])
  m.receipt.mockImplementation(async ({ hash }: { hash: string }) => {
    const receipt = receipts.get(hash)
    if (!receipt) throw new TransactionReceiptNotFoundError({ hash: hash as `0x${string}` })
    return receipt
  })
  m.block.mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) => ({
    timestamp: times.get(blockNumber),
  }))
})

it("finds swaps made anywhere through the wallet's USDG transfers, back to the last sweep", async () => {
  const found = await fills()
  expect(found).toHaveLength(2)
  const buy = found.find((fill) => fill.orderId === BUY)!
  expect(buy).toMatchObject({ marketId: NVDA, side: "buy" })
  expect(buy.sz).toBeCloseTo(0.796613866046923, 12)
  expect(buy.px * buy.sz).toBeCloseTo(177.4467, 6)
  expect(buy.executionNote).toContain("ETH")
  expect(found.find((fill) => fill.orderId === SELL)).toMatchObject({
    marketId: SOLD,
    side: "sell",
  })
  expect(m.record).toHaveBeenCalledTimes(2)
  // One explorer page reached 13:34, older than the sweep asks for.
  expect(m.explorer).toHaveBeenCalledTimes(1)
  expect(m.explorer.mock.calls[0][1]).toBe(
    `/api/v2/addresses/${WALLET}/token-transfers`
  )
})

it("never reads a settled swap's receipt twice", async () => {
  await fills()
  const reads = m.receipt.mock.calls.length
  await fills()
  expect(m.receipt.mock.calls.length).toBe(reads)
})

it("looks back a week at most, however old the last fill", async () => {
  // Sixteen days after the saved transfers, a sweep from the very beginning
  // stops at the first of them: all are older than a week.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.parse("2026-10-10T00:00:00Z"))
  try {
    const found = await fetchRobinhoodOrderFills(
      "mainnet",
      `0x${"7".repeat(40)}`,
      0,
      () => null,
      undefined,
      owner
    )
    expect(found).toEqual([])
    expect(m.receipt).not.toHaveBeenCalled()
    expect(m.explorer).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})

it("still settles this app's own swap when the explorer refuses", async () => {
  m.explorer.mockRejectedValue(new Error("ROBINHOOD_SERVICE_REFUSED:Blockscout:524"))
  m.pending.mockResolvedValue([
    { hash: BUY, kind: "swap", marketId: NVDA, approvals: [{ hash: `0x${"c".repeat(64)}`, feeEth: 0.000016 }] },
  ])
  const found = await fills()
  expect(found.map((fill) => fill.orderId)).toEqual([BUY])
  expect(found[0].executionNote).toContain("Approval confirmed")
  expect(found[0].fee).toBeGreaterThan(0.000016 * 2685)
})

it("leaves a signed swap that is not mined yet for the next pass", async () => {
  const unmined = `0x${"d".repeat(64)}`
  m.explorer.mockResolvedValue({ items: [], next_page_params: null })
  m.pending.mockResolvedValue([
    { hash: unmined, kind: "swap", marketId: NVDA, approvals: [] },
  ])
  expect(await fills()).toEqual([])
  expect(m.finish).not.toHaveBeenCalled()
})

it("refuses a practice network, a bad address or an unknown owner before asking anyone", async () => {
  await expect(
    fetchRobinhoodOrderFills("testnet", WALLET, since, () => null, undefined, owner)
  ).rejects.toThrow("ROBINHOOD_NETWORK_UNSUPPORTED")
  await expect(
    fetchRobinhoodOrderFills("mainnet", "0x12", since, () => null, undefined, owner)
  ).rejects.toThrow("LIVE_WALLET_ADDRESS")
  await expect(
    fetchRobinhoodOrderFills("mainnet", WALLET, since, () => null)
  ).rejects.toThrow("LIVE_WALLET_NOT_FOUND")
  expect(m.explorer).not.toHaveBeenCalled()
})

it("says so only when the node fails too, after the explorer refused", async () => {
  m.explorer.mockRejectedValue(new Error("ROBINHOOD_SERVICE_REFUSED:Blockscout:403"))
  m.pending.mockResolvedValue([{ hash: BUY, kind: "swap", marketId: NVDA, approvals: [] }])
  m.receipt.mockRejectedValue(
    new HttpRequestError({ url: "https://node.example", status: 502 })
  )
  await expect(fills()).rejects.toThrow(
    "EXCHANGE_BUSY:Neither Robinhood Chain's explorer nor its node answered a trade history request."
  )
})
