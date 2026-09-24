import { beforeEach, expect, it, vi } from "vitest"
import {
  decodeFunctionData,
  erc20Abi,
  EstimateGasExecutionError,
  maxUint256,
  RpcRequestError,
} from "viem"
import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"

const m = vi.hoisted(() => ({
  kyber: vi.fn(),
  velora: vi.fn(),
  kyberBuild: vi.fn(),
  veloraBuild: vi.fn(),
  gate: vi.fn(),
  decimals: vi.fn(),
  read: vi.fn(),
  estimate: vi.fn(),
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
  risk: vi.fn(),
  catalog: vi.fn(),
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
  verifyRobinhoodWallet: vi.fn(),
  packRobinhoodCredential: () => "unused-test-key",
}))
vi.mock("./rpc", () => ({
  robinhoodTokenDecimals: m.decimals,
  robinhoodReadClient: () => ({
    readContract: m.read,
    estimateGas: m.estimate,
    call: vi.fn(),
    waitForTransactionReceipt: m.receipt,
    getBlock: m.block,
  }),
}))
vi.mock("./account", () => ({ clearRobinhoodAccountState: vi.fn() }))
vi.mock("./markets", () => ({
  fetchRobinhoodMarkets: m.catalog,
  robinhoodBuyRefusal: m.risk,
  robinhoodKnownUnsellable: () => false,
  robinhoodEthPrice: async () => 2685,
}))
vi.mock("@/server/protocols/robinhood-ledger", () => ({
  withRobinhoodSendLock: async (_: string, work: () => Promise<unknown>) =>
    work(),
  rememberRobinhoodSend: m.remember,
  pendingRobinhoodSends: m.pending,
  finishRobinhoodSend: m.finish,
  noteRobinhoodTransaction: m.note,
  recordRobinhoodFill: m.record,
}))
vi.mock("@/server/protocols/real-money", () => ({
  assertRealMoneyAllowed: m.gate,
}))
// The two routers stand in for KyberSwap and Velora; their own checks are
// tested in velora.test.ts and bnb/quote.test.ts.
vi.mock("./quote", () => ({ robinhoodRouters: [m.kyber, m.velora] }))

import { robinhoodRefusals } from "./refusals"
import { placeRobinhoodOrder, quoteRobinhoodSwap } from "./orders"

const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
const KYBER_ROUTER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5"
const VELORA_ROUTER = "0x6a000f20005980200259b80c5102003040001068"
const wallet = "0x1111111111111111111111111111111111111111"
const auth: OrderAuth = {
  agentKey: "test-only",
  allocateNonce: async () => 1,
  accountAddress: wallet,
  owner: { userId: "u", walletId: "w" },
}
// $10 of NVDA at a limit of $226.
const params: PlaceOrderParams = {
  marketId: NVDA,
  leverage: 1,
  side: "buy",
  kind: "market",
  sz: 10 / 226,
  px: 226,
  slippage: 0.005,
  reduceOnly: false,
  tpPx: null,
  slPx: null,
}
const quoteParams = {
  marketId: NVDA,
  side: "buy" as const,
  sz: params.sz,
  px: 226,
  slippage: 0.005,
}
function route(provider: string, nvda: number, to: string, build = vi.fn()) {
  build.mockResolvedValue({ data: "0x1234", to })
  return {
    quote: {
      provider,
      sz: nvda,
      usd: 10,
      price: 10 / nvda,
      priceImpact: 0.001,
      route: "pool",
      refusal: null as string | null,
    },
    amountOut: BigInt(Math.round(nvda * 1e18)),
    build,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.decimals.mockResolvedValue(18)
  m.risk.mockResolvedValue(null)
  m.pending.mockResolvedValue([])
  // $10 of USDG to buy with, and no allowance to any router yet.
  m.read.mockImplementation(async ({ functionName }: { functionName: string }) =>
    functionName === "balanceOf" ? 10_000_000n : 0n
  )
  m.estimate.mockResolvedValue(300_000n)
  m.prepare.mockImplementation(async (request) => request)
  m.sign.mockResolvedValue("0x1234")
  m.receipt.mockResolvedValue({
    status: "success",
    gasUsed: 40_000n,
    effectiveGasPrice: 42_000_000n,
  })
  m.catalog.mockResolvedValue({
    rows: [{ marketId: NVDA, category: "stocks" }],
  })
  m.kyber.mockResolvedValue(route("KyberSwap", 0.0444, KYBER_ROUTER, m.kyberBuild))
  m.velora.mockResolvedValue(route("Velora", 0.0449, VELORA_ROUTER, m.veloraBuild))
})

it("asks both routers for USDG at 6 decimals and uses the one giving more NVDA", async () => {
  const quote = await quoteRobinhoodSwap("mainnet", wallet, quoteParams)
  expect(quote.provider).toBe("Velora")
  // $10.00 of USDG is 10,000,000 of its smallest unit, not 10 * 10^18.
  expect(m.kyber.mock.calls[0][0]).toMatchObject({
    token: NVDA,
    side: "buy",
    amount: 10_000_000n,
  })
  expect(m.velora.mock.calls[0][0].amount).toBe(10_000_000n)
})

it("uses Velora alone while KyberSwap is down", async () => {
  m.kyber.mockRejectedValue(robinhoodRefusals.error("unknown"))
  m.velora.mockResolvedValue(route("Velora", 0.0441, VELORA_ROUTER))
  expect((await quoteRobinhoodSwap("mainnet", wallet, quoteParams)).provider).toBe(
    "Velora"
  )
})

it("reports a router with no pool before one that would not answer", async () => {
  m.kyber.mockRejectedValue(robinhoodRefusals.error("unknown"))
  m.velora.mockRejectedValue(
    robinhoodRefusals.error("no-route", { router: "Velora" })
  )
  await expect(quoteRobinhoodSwap("mainnet", wallet, quoteParams)).rejects.toThrow(
    "Velora found no pool with enough money for this size."
  )
})

it("prefers a route that is not refused over a bigger one that is", async () => {
  const refused = route("Velora", 0.05, VELORA_ROUTER)
  refused.quote.refusal = "This swap's price impact exceeds the worst-fill allowance."
  m.velora.mockResolvedValue(refused)
  expect((await quoteRobinhoodSwap("mainnet", wallet, quoteParams)).provider).toBe(
    "KyberSwap"
  )
})

it("says who may hold Stock Tokens on a stock-token buy only", async () => {
  expect((await quoteRobinhoodSwap("mainnet", wallet, quoteParams)).note).toContain(
    "Robinhood's terms bar Stock Tokens in the US"
  )
  m.catalog.mockResolvedValue({ rows: [{ marketId: NVDA, category: "crypto" }] })
  expect(
    (await quoteRobinhoodSwap("mainnet", wallet, quoteParams)).note
  ).toBeUndefined()
})

it("approves the router the winning route came from, for exactly this swap's USDG", async () => {
  m.read
    .mockResolvedValueOnce(10_000_000n)
    .mockResolvedValueOnce(0n)
    .mockResolvedValue(10_000_000n)
  await placeRobinhoodOrder("mainnet", auth, params)
  const approval = m.prepare.mock.calls[0][0]
  expect(approval.to).toBe(USDG)
  const args = decodeFunctionData({ abi: erc20Abi, data: approval.data })
    .args as readonly [string, bigint]
  expect([args[0].toLowerCase(), args[1]]).toEqual([VELORA_ROUTER, 10_000_000n])
  expect(args[1]).not.toBe(maxUint256)
  expect(m.veloraBuild).toHaveBeenCalledWith(
    expect.objectContaining({ wallet, bps: expect.any(Number) })
  )
  expect(m.kyberBuild).not.toHaveBeenCalled()
  expect(m.prepare.mock.calls[1][0].to).toBe(VELORA_ROUTER)
  expect(m.note.mock.calls.flat().join(" ")).toContain(
    "Approval of exactly 10 confirmed"
  )
  expect(m.receipt.mock.calls[0][0]).toMatchObject({
    confirmations: 1,
    pollingInterval: 250,
    timeout: 15_000,
  })
})

it("closes out a send the node refused for lack of ETH, instead of leaving it pending", async () => {
  m.send.mockRejectedValue(
    new Error("insufficient funds for gas * price + value: FAKE_DETAIL")
  )
  await expect(placeRobinhoodOrder("mainnet", auth, params)).rejects.toThrow(
    "The wallet does not have enough ETH for network fees."
  )
  expect(m.remember).toHaveBeenCalledTimes(1)
  expect(m.finish).toHaveBeenCalledWith(
    auth.owner,
    expect.stringMatching(/^0x/),
    "failed",
    expect.stringContaining("enough ETH")
  )
  expect(m.send).toHaveBeenCalledTimes(1)
  // The Journal says it failed, after its "submitted" line.
  expect(m.note.mock.calls.at(-1)?.[2]).toContain("enough ETH")
})

it("builds but never signs with real money switched off", async () => {
  m.gate.mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
  await expect(placeRobinhoodOrder("mainnet", auth, params)).rejects.toThrow(
    "LIVE_MAINNET_OFF"
  )
  expect(m.veloraBuild).toHaveBeenCalled()
  expect(m.prepare).not.toHaveBeenCalled()
  expect(m.sign).not.toHaveBeenCalled()
})

it("names the Stock Token whose own contract refused the swap, before anything is signed", async () => {
  // Made-up Blocked(address) revert data, as Stock.sol raises it.
  m.read.mockImplementation(async ({ functionName }: { functionName: string }) =>
    functionName === "symbol" ? "NVDA" : 10_000_000n
  )
  m.estimate.mockRejectedValue(
    new EstimateGasExecutionError(
      new RpcRequestError({
        body: {},
        url: "https://node.example",
        error: {
          code: 3,
          message: "execution reverted",
          data: `0x75e91ce7${"0".repeat(24)}${"1".repeat(40)}`,
        },
      }),
      {}
    )
  )
  await expect(placeRobinhoodOrder("mainnet", auth, params)).rejects.toThrow(
    "NVDA's own contract refused the transfer: its compliance check blocked an address in it."
  )
  expect(m.sign).not.toHaveBeenCalled()
})
