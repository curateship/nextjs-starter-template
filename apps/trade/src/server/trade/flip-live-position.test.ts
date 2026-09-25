import { beforeEach, describe, expect, it, vi } from "vitest"
import { flipLivePosition } from "./flip-live-position"
import { closeLivePosition, liveHeldPosition, liveWallet, placeLiveOrder, setLiveBrackets } from "./live-orders"
import { listActiveSmartOrders } from "./smart-orders"
import type { WalletPosition } from "@/lib/protocols/contracts"

vi.mock("./db", () => ({ withWalletPlanWrite: async (_user: string, _wallet: string, work: () => Promise<unknown>) => work() }))
vi.mock("./live-orders", () => ({ closeLivePosition: vi.fn(), liveHeldPosition: vi.fn(), liveWallet: vi.fn(), placeLiveOrder: vi.fn(), setLiveBrackets: vi.fn() }))
vi.mock("./smart-orders", () => ({ listActiveSmartOrders: vi.fn() }))

const input = { walletId: "wallet", marketKey: "hyperliquid:mainnet:BTC", expectedSzi: 2 }
const held: WalletPosition = {
  marketId: "BTC", szi: 2, entryPx: 100, leverage: 3, marginUsed: 67,
  liquidationPx: null, targets: [], tpPx: null, tpSz: null, slPx: null,
  tpOrderId: null, slOrderId: null, protectionOrderIds: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(liveWallet).mockResolvedValue({ status: "active" } as Awaited<ReturnType<typeof liveWallet>>)
  vi.mocked(liveHeldPosition).mockResolvedValueOnce(held).mockResolvedValue(null)
  vi.mocked(listActiveSmartOrders).mockResolvedValue([])
  vi.mocked(closeLivePosition).mockImplementation(async (_user, _input, progress) => {
    await progress?.beforeSubmit(2)
    await progress?.afterSubmit(2, 2)
  })
  vi.mocked(placeLiveOrder).mockResolvedValue({ status: "filled", filledSz: 2, avgPx: 100, orderId: "entry", protection: null, protectionNote: null })
})

describe("flipping a live position", () => {
  it.each([2, -2])("closes %s coins before opening the same size the other way", async (szi) => {
    vi.mocked(liveHeldPosition).mockReset().mockResolvedValueOnce({ ...held, szi }).mockResolvedValue(null)
    expect(await flipLivePosition("user", { ...input, expectedSzi: szi })).toEqual({ complete: true })
    expect(closeLivePosition).toHaveBeenCalledWith("user", { ...input, expectedSzi: szi }, expect.objectContaining({ expectedSide: szi > 0 ? "sell" : "buy" }))
    expect(placeLiveOrder).toHaveBeenCalledWith("user", expect.objectContaining({ side: szi > 0 ? "sell" : "buy", sz: 2, leverage: 3, marketOnly: true, byHand: true, reduceOnly: false, tpPx: null, slPx: null }))
    expect(vi.mocked(closeLivePosition).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(placeLiveOrder).mock.invocationCallOrder[0])
  })

  it("removes old protection before the close", async () => {
    vi.mocked(liveHeldPosition).mockReset().mockResolvedValueOnce({ ...held, slPx: 90, protectionOrderIds: ["stop"] }).mockResolvedValue(null)
    await flipLivePosition("user", input)
    expect(setLiveBrackets).toHaveBeenCalledWith("user", expect.objectContaining({ targets: [], slPx: null }))
    expect(vi.mocked(setLiveBrackets).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(closeLivePosition).mock.invocationCallOrder[0])
  })

  it.each([0, 1, NaN])("does not open after an unconfirmed or partial close of %s", async (filledSz) => {
    vi.mocked(closeLivePosition).mockImplementation(async (_user, _input, progress) => { await progress?.afterSubmit(filledSz, 2) })
    await expect(flipLivePosition("user", input)).rejects.toThrow("LIVE_FLIP_CLOSE_UNCONFIRMED")
    expect(placeLiveOrder).not.toHaveBeenCalled()
  })

  it("does not reopen after a close request fails", async () => {
    vi.mocked(closeLivePosition).mockRejectedValue(new Error("timeout"))
    await expect(flipLivePosition("user", input)).rejects.toThrow("LIVE_FLIP_CLOSE_UNCONFIRMED")
    expect(placeLiveOrder).not.toHaveBeenCalled()
  })

  it("does not send an entry while the exchange still shows a position", async () => {
    vi.mocked(liveHeldPosition).mockReset().mockResolvedValue(held)
    await expect(flipLivePosition("user", input)).rejects.toThrow("LIVE_FLIP_ENTRY_UNCONFIRMED")
    expect(placeLiveOrder).not.toHaveBeenCalled()
  })

  it("does not retry an entry whose result is unknown", async () => {
    vi.mocked(placeLiveOrder).mockRejectedValue(new Error("timeout"))
    await expect(flipLivePosition("user", input)).rejects.toThrow("LIVE_FLIP_ENTRY_UNCONFIRMED")
    expect(placeLiveOrder).toHaveBeenCalledTimes(1)
  })

  it("reports a partial opposite entry without claiming a complete flip", async () => {
    vi.mocked(placeLiveOrder).mockResolvedValue({ status: "filled", filledSz: 1, avgPx: 100, orderId: "entry", protection: null, protectionNote: null })
    expect(await flipLivePosition("user", input)).toEqual({ complete: false })
  })

  it.each([null, { ...held, szi: -2 }, { ...held, owned: { entryKnown: true, priced: true } }])("refuses missing, changed and spot positions before closing", async (position) => {
    vi.mocked(liveHeldPosition).mockReset().mockResolvedValue(position)
    await expect(flipLivePosition("user", input)).rejects.toThrow()
    expect(closeLivePosition).not.toHaveBeenCalled()
    expect(placeLiveOrder).not.toHaveBeenCalled()
  })

  it("refuses active smart orders before changing protection or closing", async () => {
    vi.mocked(listActiveSmartOrders).mockResolvedValue([{ marketKey: input.marketKey } as Awaited<ReturnType<typeof listActiveSmartOrders>>[number]])
    await expect(flipLivePosition("user", input)).rejects.toThrow("LIVE_FLIP_SMART_ORDER")
    expect(setLiveBrackets).not.toHaveBeenCalled()
    expect(closeLivePosition).not.toHaveBeenCalled()
  })

  it("does not close an inactive wallet to attempt a forbidden entry", async () => {
    vi.mocked(liveWallet).mockResolvedValue({ status: "inactive" } as Awaited<ReturnType<typeof liveWallet>>)
    await expect(flipLivePosition("user", input)).rejects.toThrow("WALLET_INACTIVE")
    expect(closeLivePosition).not.toHaveBeenCalled()
  })

  it("stops if protection cannot be removed", async () => {
    vi.mocked(liveHeldPosition).mockReset().mockResolvedValue({ ...held, slPx: 90 })
    vi.mocked(setLiveBrackets).mockRejectedValue(new Error("cancel refused"))
    await expect(flipLivePosition("user", input)).rejects.toThrow("cancel refused")
    expect(closeLivePosition).not.toHaveBeenCalled()
  })
})
