import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SwapQuote, WalletPosition } from "@/lib/protocols/contracts"
import { previewDustSweep, sweepDustCoin } from "./dust-sweep"
import { closeLivePosition, liveWallet } from "./live-orders"
import { realMoneySwitch } from "./workers"

const portfolio = vi.fn()
const quote = vi.fn()

vi.mock("./live-orders", () => ({ closeLivePosition: vi.fn(), liveWallet: vi.fn() }))
vi.mock("./workers", () => ({ realMoneySwitch: vi.fn() }))
vi.mock("@/server/protocols/registry", () => ({
  getProtocol: () => ({}),
  ordersOf: () => ({ portfolio, quote }),
}))
vi.mock("@/server/protocols/solana/account", () => ({ SOL_MINT: "SOL" }))
vi.mock("@/server/protocols/bnb/account", () => ({ BNB_USDC: "0xusdc" }))

const SOL_WALLET = {
  id: "w1",
  kind: "live",
  protocol: "solana",
  network: "mainnet",
  address: "addr",
} as Awaited<ReturnType<typeof liveWallet>>

const held = (marketId: string, szi: number, price: number): WalletPosition => ({
  marketId, szi, entryPx: price, leverage: 1, marginUsed: 0, liquidationPx: null,
  targets: [], tpPx: null, tpSz: null, slPx: null, tpOrderId: null, slOrderId: null,
  protectionOrderIds: [], owned: { entryKnown: false, priced: true },
})

const quoted = (usd: number, networkFeeUsd: number): SwapQuote => ({
  sz: 1, usd, price: usd, priceImpact: 0, route: "Jupiter", refusal: null, networkFeeUsd,
})

const describeError = (error: unknown) => (error as Error).message

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(liveWallet).mockResolvedValue(SOL_WALLET)
  vi.mocked(realMoneySwitch).mockResolvedValue({ masterAllowed: true, enabled: true })
  portfolio.mockResolvedValue({
    positions: [
      held("SOL", 0.5, 150), // the fee coin, never a leftover
      held("BONK", 100_000, 0.000031), // $3.10
      held("DUST", 1, 0.3), // $0.30
      held("BIG", 10, 3), // $30, over the limit
    ],
    orders: [],
  })
  quote.mockImplementation(async (_network: string, _address: string, params: { marketId: string }) =>
    params.marketId === "BONK" ? quoted(3.09, 0.01) : quoted(0.28, 0.2)
  )
})

describe("the leftover preview", () => {
  it("quotes each leftover, keeps SOL, and skips the coin whose fee is over half", async () => {
    const preview = await previewDustSweep("user", "w1", 25, describeError)
    expect(preview.dollarCoin).toBe("USDC")
    expect(preview.realMoneyOn).toBe(true)
    expect(preview.rows.map((row) => [row.marketKey, row.verdict])).toEqual([
      ["solana:mainnet:DUST", "skip"],
      ["solana:mainnet:BONK", "sweep"],
    ])
    // Sold the way a close sells: the whole holding, no price floor.
    expect(quote).toHaveBeenCalledWith("mainnet", "addr", expect.objectContaining({
      marketId: "BONK", side: "sell", sz: 100_000, px: Number.MIN_VALUE,
    }))
  })

  it("says real money is off when either switch is off", async () => {
    vi.mocked(realMoneySwitch).mockResolvedValue({ masterAllowed: true, enabled: false })
    expect((await previewDustSweep("user", "w1", 25, describeError)).realMoneyOn).toBe(false)
  })

  it("turns a quote that throws into a skipped row instead of failing the preview", async () => {
    quote.mockRejectedValueOnce(new Error("Jupiter is busy."))
    const preview = await previewDustSweep("user", "w1", 25, describeError)
    expect(preview.rows[0]).toMatchObject({ verdict: "skip", reason: "Jupiter is busy." })
    expect(preview.rows[1]).toMatchObject({ verdict: "sweep" })
  })
})

describe("sweeping one coin", () => {
  it("never sells a coin whose fee is more than half its worth", async () => {
    const result = await sweepDustCoin(
      "user",
      { walletId: "w1", marketKey: "solana:mainnet:DUST", limitUsd: 25 },
      describeError
    )
    expect(result.status).toBe("skipped")
    expect(closeLivePosition).not.toHaveBeenCalled()
  })

  it("never sells a coin that is no longer under the limit", async () => {
    const result = await sweepDustCoin(
      "user",
      { walletId: "w1", marketKey: "solana:mainnet:BIG", limitUsd: 25 },
      describeError
    )
    expect(result.status).toBe("skipped")
    expect(closeLivePosition).not.toHaveBeenCalled()
  })

  it("sells through the close path and reports what came back", async () => {
    vi.mocked(closeLivePosition).mockResolvedValue({ avgPx: 0.0000309, filledSz: 100_000 })
    const result = await sweepDustCoin(
      "user",
      { walletId: "w1", marketKey: "solana:mainnet:BONK", limitUsd: 25 },
      describeError
    )
    expect(closeLivePosition).toHaveBeenCalledWith("user", {
      walletId: "w1",
      marketKey: "solana:mainnet:BONK",
    })
    expect(result).toEqual({ status: "swept", backUsd: expect.closeTo(3.09, 9) })
  })

  it("lets the close path's refusal through, so the switches it checks still hold", async () => {
    vi.mocked(closeLivePosition).mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
    await expect(
      sweepDustCoin(
        "user",
        { walletId: "w1", marketKey: "solana:mainnet:BONK", limitUsd: 25 },
        describeError
      )
    ).rejects.toThrow("LIVE_MAINNET_OFF")
  })

  it("refuses a wallet that is not a real Solana or BNB Chain wallet", async () => {
    vi.mocked(liveWallet).mockResolvedValue({ ...SOL_WALLET, protocol: "hyperliquid" })
    await expect(
      previewDustSweep("user", "w1", 25, describeError)
    ).rejects.toThrow("DUST_SWEEP_UNSUPPORTED")
  })
})
