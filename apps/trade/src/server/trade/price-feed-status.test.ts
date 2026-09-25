import { beforeEach, describe, expect, it, vi } from "vitest"

const feeds = vi.hoisted(
  (): Array<{ label: string; fresh: boolean | null; prices: number }> => [
    { label: "Hyperliquid", fresh: true, prices: 12 },
    { label: "Phemex", fresh: true, prices: 34 },
    { label: "KuCoin", fresh: false, prices: 0 },
    { label: "Aster", fresh: true, prices: 56 },
  ]
)

vi.mock("@/server/protocols/registry", () => ({
  listProtocols: () =>
    feeds.map((feed) => ({
      label: feed.label,
      livePrices: {
        fresh: () => {
          if (feed.label === "Aster" && feed.fresh === null) {
            throw new Error("Aster feed status failed")
          }
          return feed.fresh === true
        },
        read: () => ({
          prices: new Map(
            Array.from(
              { length: feed.prices },
              (_, index) => [`market-${index}`, index] as const
            )
          ),
        }),
      },
    })),
}))

const { priceFeedStatus } = await import("@/server/trade/price-feed-status")

describe("the worker price-feed heartbeat", () => {
  beforeEach(() => {
    feeds[0]!.fresh = true
    feeds[1]!.fresh = true
    feeds[2]!.fresh = false
    feeds[3]!.fresh = true
  })

  it("names all four feeds and gives each one its own state", () => {
    expect(priceFeedStatus()).toBe(
      "Hyperliquid: live, 12 markets · Phemex: live, 34 markets · KuCoin: asking · Aster: live, 56 markets"
    )
  })

  it("keeps the other three visible when Aster's status read fails", () => {
    feeds[3]!.fresh = null

    expect(priceFeedStatus()).toBe(
      "Hyperliquid: live, 12 markets · Phemex: live, 34 markets · KuCoin: asking · Aster: unavailable"
    )
  })
})
