import { beforeEach, expect, it, vi } from "vitest"
import { BaseError, decodeFunctionData, erc20Abi, maxUint256 } from "viem"
import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"
const m = vi.hoisted(() => ({
  gate: vi.fn(),
  request: vi.fn(),
  risk: vi.fn(),
  decimals: vi.fn(),
  read: vi.fn(),
  estimate: vi.fn(),
  call: vi.fn(),
  unsellable: vi.fn(),
  receipt: vi.fn(),
  block: vi.fn(),
  prepare: vi.fn(),
  sign: vi.fn(),
  send: vi.fn(),
  remember: vi.fn(),
  finish: vi.fn(),
  pending: vi.fn(),
  note: vi.fn(),
  record: vi.fn(),
  verify: vi.fn(),
}))
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createWalletClient: () => ({
    prepareTransactionRequest: m.prepare,
    signTransaction: m.sign,
    sendRawTransaction: m.send,
  }),
}))
vi.mock("viem/accounts", () => ({
  privateKeyToAccount: () => ({
    address: "0x1111111111111111111111111111111111111111",
  }),
}))
vi.mock("./wallet", () => ({
  verifyBnbWallet: m.verify,
  packBnbCredential: () => "unused-test-key",
}))
vi.mock("./rpc", () => ({
  bnbTokenDecimals: m.decimals,
  bnbReadClient: () => ({
    readContract: m.read,
    estimateGas: m.estimate,
    call: m.call,
    waitForTransactionReceipt: m.receipt,
    getBlock: m.block,
  }),
}))
vi.mock("./account", () => ({
  clearBnbAccountState: vi.fn(),
  fetchBnbPortfolio: vi.fn(),
}))
vi.mock("./markets", () => ({
  bnbBuyRefusal: m.risk,
  bnbKnownUnsellable: m.unsellable,
  bnbAccountMarkets: async () => ({
    prices: new Map([["0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", 750]]),
  }),
  fetchBnbPrices: vi.fn(),
}))
vi.mock("./ledger", () => ({
  withBnbSendLock: async (_: string, work: () => Promise<unknown>) => work(),
  rememberBnbSend: m.remember,
  pendingBnbSends: m.pending,
  finishBnbSend: m.finish,
  noteBnbTransaction: m.note,
  recordBnbFill: m.record,
}))
vi.mock("@/server/protocols/real-money", () => ({
  assertRealMoneyAllowed: m.gate,
}))
vi.mock("./quote", async (original) => ({
  ...(await original<typeof import("./quote")>()),
  kyberRequest: m.request,
  validateBnbBuild: () => ({
    data: "0x1234",
    router: "0x3333333333333333333333333333333333333333",
    amountOut: 5n * 10n ** 18n,
  }),
}))
import {
  placeBnbOrder,
  quoteBnbSwap,
  closeBnbPosition,
  transferFromFailed,
} from "./orders"
import { BNB_USDT } from "./client"
const token = "0x2222222222222222222222222222222222222222"
const wallet = "0x1111111111111111111111111111111111111111"
const auth: OrderAuth = {
  agentKey: "test-only",
  allocateNonce: async () => 1,
  accountAddress: wallet,
  owner: { userId: "u", walletId: "w" },
}
const params: PlaceOrderParams = {
  marketId: token,
  leverage: 1,
  side: "buy",
  kind: "market",
  sz: 5,
  px: 2,
  slippage: 0.005,
  reduceOnly: false,
  tpPx: null,
  slPx: null,
}
beforeEach(() => {
  vi.resetAllMocks()
  m.decimals.mockResolvedValue(18)
  m.risk.mockResolvedValue(null)
  m.pending.mockResolvedValue([])
  m.read.mockResolvedValue(maxUint256)
  m.estimate.mockResolvedValue(100000n)
  m.prepare.mockImplementation(async (x) => x)
  m.sign.mockResolvedValue("0x1234")
  m.receipt.mockRejectedValue(new Error("receipt timeout"))
  m.request.mockImplementation(async (path, args) =>
    path === "routes"
      ? {
          code: 0,
          data: {
            routerAddress: "0x3333333333333333333333333333333333333333",
            routeSummary: {
              tokenIn: args.tokenIn,
              tokenOut: args.tokenOut,
              amountIn: args.amountIn,
              amountOut: String(BigInt(args.amountIn) / 2n),
              amountInUsd: "10",
              amountOutUsd: "10",
              route: [[{ exchange: "pool" }]],
            },
          },
        }
      : {}
  )
})
it("builds a free route with the switch off and never prepares or signs", async () => {
  m.gate.mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "LIVE_MAINNET_OFF"
  )
  expect(m.request.mock.calls.map((c) => c[0])).toEqual([
    "routes",
    "route/build",
  ])
  expect(m.request.mock.calls[1][1]).toMatchObject({
    sender: wallet,
    recipient: wallet,
    slippageTolerance: expect.any(Number),
  })
  expect(m.sign).not.toHaveBeenCalled()
  expect(m.prepare).not.toHaveBeenCalled()
  expect(m.send).not.toHaveBeenCalled()
})
it("refuses a flagged buy before building or signing", async () => {
  m.risk.mockResolvedValue("GoPlus says this coin cannot be sold once bought")
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow("GoPlus")
  expect(m.request).not.toHaveBeenCalled()
  expect(m.sign).not.toHaveBeenCalled()
})
it("does not sign when the route expires during transaction preparation", async () => {
  const now = Date.now()
  const clock = vi.spyOn(Date, "now").mockReturnValue(now)
  m.prepare.mockImplementation(async (request) => {
    clock.mockReturnValue(now + 121_000)
    return request
  })
  try {
    await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
      "route expired"
    )
    expect(m.sign).not.toHaveBeenCalled()
    expect(m.remember).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  } finally {
    clock.mockRestore()
  }
})
it("checks real-money permission again after transaction preparation", async () => {
  m.prepare.mockImplementation(async (request) => {
    m.gate.mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
    return request
  })
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "LIVE_MAINNET_OFF"
  )
  expect(m.sign).not.toHaveBeenCalled()
  expect(m.remember).not.toHaveBeenCalled()
  expect(m.send).not.toHaveBeenCalled()
})
it("uses sufficient allowance without another approval and saves the hash before sending", async () => {
  const outcome = await placeBnbOrder("mainnet", auth, params)
  expect(m.prepare).toHaveBeenCalledTimes(1)
  expect(m.prepare.mock.calls[0][0].to).toBe(
    "0x3333333333333333333333333333333333333333"
  )
  expect(m.remember.mock.invocationCallOrder[0]).toBeLessThan(
    m.send.mock.invocationCallOrder[0]
  )
  expect(outcome.filledSz).toBeNull()
  expect(outcome.executionNote).toContain("not confirmed")
})
it("approves the returned router once when short and waits before sending the swap", async () => {
  m.read.mockResolvedValueOnce(0n).mockResolvedValue(maxUint256)
  m.receipt.mockResolvedValueOnce({
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
  })
  await placeBnbOrder("mainnet", auth, params)
  expect(m.prepare).toHaveBeenCalledTimes(2)
  const approval = m.prepare.mock.calls[0][0]
  expect(approval.to).toBe(BNB_USDT)
  expect(
    decodeFunctionData({ abi: erc20Abi, data: approval.data }).args
  ).toEqual(["0x3333333333333333333333333333333333333333", maxUint256])
  expect(m.receipt.mock.invocationCallOrder[0]).toBeLessThan(
    m.prepare.mock.invocationCallOrder[1]
  )
  expect(m.note.mock.calls.flat().join(" ")).toContain(
    "Unlimited approval confirmed"
  )
})
it("never sends a swap while approval confirmation is missing", async () => {
  m.read.mockResolvedValue(0n)
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "approval"
  )
  expect(m.send).toHaveBeenCalledTimes(1)
  expect(m.estimate).not.toHaveBeenCalled()
})
it("does not retry an ambiguous broadcast or invent a fill", async () => {
  m.send.mockRejectedValue(new Error("connection lost"))
  const outcome = await placeBnbOrder("mainnet", auth, params)
  expect(m.send).toHaveBeenCalledTimes(1)
  expect(outcome.avgPx).toBeNull()
  expect(outcome.filledSz).toBeNull()
  expect(m.record).not.toHaveBeenCalled()
})
it("caps a sell to the current balance and never asks the buy scam guard", async () => {
  m.read.mockResolvedValueOnce(3n * 10n ** 18n).mockResolvedValue(maxUint256)
  m.gate.mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
  await expect(
    placeBnbOrder("mainnet", auth, {
      ...params,
      side: "sell",
      px: 0.5,
      reduceOnly: true,
    })
  ).rejects.toThrow("LIVE_MAINNET_OFF")
  expect(m.request.mock.calls[0][1].amountIn).toBe(String(3n * 10n ** 18n))
  expect(m.risk).not.toHaveBeenCalled()
})
it("refuses an oversell without reduce-only", async () => {
  m.read.mockResolvedValue(1n)
  await expect(
    placeBnbOrder("mainnet", auth, { ...params, side: "sell" })
  ).rejects.toThrow("Sell only what I hold")
  expect(m.sign).not.toHaveBeenCalled()
})
it("only recognizes the named preflight transfer failure", () => {
  expect(transferFromFailed(new BaseError("TRANSFER_FROM_FAILED"))).toBe(true)
  expect(transferFromFailed(new BaseError("insufficient funds"))).toBe(false)
  expect(transferFromFailed(new Error("network timeout"))).toBe(false)
})
it("retries only a known transfer simulation failure with one extra approval", async () => {
  m.estimate
    .mockRejectedValueOnce(new BaseError("TRANSFER_FROM_FAILED"))
    .mockResolvedValue(100000n)
  m.receipt.mockResolvedValueOnce({
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
  })
  await placeBnbOrder("mainnet", auth, params)
  expect(m.prepare).toHaveBeenCalledTimes(2)
  expect(m.estimate).toHaveBeenCalledTimes(2)
  expect(m.send).toHaveBeenCalledTimes(2)
})
it("stops after one extra approval when the simulation still fails", async () => {
  m.estimate.mockRejectedValue(new BaseError("TRANSFER_FROM_FAILED"))
  m.receipt.mockResolvedValueOnce({
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
  })
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "one fresh approval"
  )
  expect(m.prepare).toHaveBeenCalledTimes(1)
  expect(m.estimate).toHaveBeenCalledTimes(2)
  expect(m.send).toHaveBeenCalledTimes(1)
})
it("records a reverted swap without another send and states the spent gas", async () => {
  m.receipt.mockResolvedValue({
    status: "reverted",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
  })
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "BNB was spent"
  )
  expect(m.finish.mock.calls[0][2]).toBe("failed")
  expect(m.send).toHaveBeenCalledTimes(1)
  expect(m.record).not.toHaveBeenCalled()
})

it("scrubs unknown node errors on quote, buy and close before shared logging", async () => {
  const secret = "LIVE_ORDER_REFUSED:FAKE_SECRET_rpc_key"
  m.decimals.mockRejectedValue(new Error(secret))
  for (const work of [
    () =>
      quoteBnbSwap("mainnet", wallet, {
        marketId: token,
        side: "buy",
        sz: 5,
        px: 2,
        slippage: 0.005,
      }),
    () => placeBnbOrder("mainnet", auth, params),
    () => closeBnbPosition("mainnet", auth, { marketId: token, szi: 5 }),
  ]) {
    await expect(work()).rejects.toThrow(
      "BNB Chain refused the trade, and no coins moved."
    )
  }
  expect(m.sign).not.toHaveBeenCalled()
  expect(m.note).not.toHaveBeenCalled()
})

it("explains insufficient gas before signing and preserves confirmed approval fees", async () => {
  m.read.mockResolvedValueOnce(0n).mockResolvedValue(maxUint256)
  m.receipt.mockResolvedValueOnce({
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
  })
  m.estimate.mockRejectedValue(
    new BaseError("insufficient funds for gas * price + value FAKE_KEY")
  )
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "Confirmed approvals spent 0.000021 BNB separately."
  )
  expect(m.send).toHaveBeenCalledTimes(1)
  expect(m.record).not.toHaveBeenCalled()
})

it("explains a reverted price cap with its receipt fee and hash", async () => {
  m.receipt.mockResolvedValue({
    status: "reverted",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    blockNumber: 100n,
  })
  m.call.mockRejectedValue(
    new BaseError("Return amount is not enough FAKE_KEY")
  )
  await expect(placeBnbOrder("mainnet", auth, params)).rejects.toThrow(
    "Worst fill allowed %"
  )
  const note = m.finish.mock.calls[0][3]
  expect(note).toContain("0.000021 BNB was spent")
  expect(note).toContain("bscscan.com")
  expect(note).not.toContain("FAKE_KEY")
  expect(m.send).toHaveBeenCalledTimes(1)
})

it("names a newly flagged coin only after a sell reverts", async () => {
  m.unsellable.mockReturnValue(true)
  m.receipt.mockResolvedValue({
    status: "reverted",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
  })
  await expect(
    placeBnbOrder("mainnet", auth, { ...params, side: "sell", px: 0.5 })
  ).rejects.toThrow("GoPlus flags it")
  expect(m.risk).not.toHaveBeenCalled()
  expect(m.send).toHaveBeenCalledTimes(1)
})

it("does not treat a replacement receipt as the requested swap or retry it", async () => {
  const replacementHash = `0x${"f".repeat(64)}`
  m.receipt.mockResolvedValue({
    status: "success",
    transactionHash: replacementHash,
  })
  const result = await placeBnbOrder("mainnet", auth, params)
  expect(result.filledSz).toBeNull()
  expect(result.executionNote).toContain("replacement transaction")
  expect(result.executionNote).toContain(replacementHash)
  expect(m.record).not.toHaveBeenCalled()
  expect(m.finish).not.toHaveBeenCalled()
  expect(m.send).toHaveBeenCalledTimes(1)
})

it("keeps a node 429 after broadcast uncertain and sends only once", async () => {
  m.send.mockRejectedValue(Object.assign(new Error("FAKE_RPC_KEY"), { status: 429 }))
  const result = await placeBnbOrder("mainnet", auth, params)
  expect(result.executionNote).toContain("node is limiting requests")
  expect(result.executionNote).toContain("fee is not confirmed")
  expect(result.executionNote).not.toContain("FAKE_RPC_KEY")
  expect(result.executionNote).not.toContain("No swap coins moved")
  expect(m.send).toHaveBeenCalledTimes(1)
  expect(m.record).not.toHaveBeenCalled()
})
