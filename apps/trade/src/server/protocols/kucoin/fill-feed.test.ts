import { expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  load: vi.fn(),
  onMatch: null as
    | ((match: {
        type: "match"
        tradeId: string
        orderId: string
        symbol: string
        ts: number
      }) => void)
    | null,
}))

vi.mock("@/server/protocols/kucoin/orders", () => ({
  fetchKucoinPushedFill: (...args: unknown[]) => mocked.load(...args),
}))

vi.mock("@/server/protocols/kucoin/private-feed", () => ({
  kucoinFillsNeedRecovery: () => false,
  watchKucoinOrderMatches: (
    _network: unknown,
    _keyId: unknown,
    _listenerId: unknown,
    _credential: unknown,
    onMatch: typeof mocked.onMatch
  ) => {
    mocked.onMatch = onMatch
  },
}))

const { watchKucoinFills } = await import("@/server/protocols/kucoin/fill-feed")

it("reads one complete fill for a pushed KuCoin match", async () => {
  const fill = {
    fillId: "trade-1",
    orderId: "order-1",
    marketId: "XBTUSDTM",
    side: "buy" as const,
    px: 69_000,
    sz: 0.01,
    at: 2_000,
    closedPnl: 0,
    fee: 0.4,
    dir: "Buy",
    liquidation: false,
  }
  mocked.load.mockResolvedValue(fill)
  const onFill = vi.fn()
  const credential = () => "credential"
  watchKucoinFills("mainnet", "key", "wallet", credential, onFill)
  const match = {
    type: "match" as const,
    tradeId: "trade-1",
    orderId: "order-1",
    symbol: "XBTUSDTM",
    ts: 2_000,
  }

  mocked.onMatch?.(match)
  mocked.onMatch?.(match)

  await vi.waitFor(() => expect(onFill).toHaveBeenCalledWith(fill))
  expect(mocked.load).toHaveBeenCalledOnce()
  expect(mocked.load).toHaveBeenCalledWith("mainnet", match, credential)
})
