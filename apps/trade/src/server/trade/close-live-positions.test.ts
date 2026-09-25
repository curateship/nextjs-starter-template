import { describe, expect, it, vi } from "vitest"

import { closeLivePositions } from "@/server/trade/close-live-positions"

describe("one confirmed Close all action", () => {
  it("carries twenty positions through one server action", async () => {
    const positions = Array.from({ length: 20 }, (_, index) => ({
      walletId: "wallet-1",
      marketKey: `hyperliquid:mainnet:COIN${index}`,
    }))
    const close = vi.fn(async () => undefined)

    const answer = await closeLivePositions("user-1", positions, close)

    expect(answer).toEqual({ closed: 20, refused: [] })
    expect(close).toHaveBeenCalledTimes(20)
  })

  it("closes a repeated position once and keeps the other refusals", async () => {
    const repeated = {
      walletId: "wallet-1",
      marketKey: "hyperliquid:mainnet:BTC",
    }
    const close = vi.fn(async (_userId: string, position: typeof repeated) => {
      if (position.marketKey.endsWith("ETH")) {
        throw new Error("The exchange refused ETH.")
      }
    })

    const answer = await closeLivePositions(
      "user-1",
      [
        repeated,
        repeated,
        { ...repeated, marketKey: "hyperliquid:mainnet:ETH" },
      ],
      close
    )

    expect(close).toHaveBeenCalledTimes(2)
    expect(answer).toEqual({
      closed: 1,
      refused: ["The exchange refused ETH."],
    })
  })
})
