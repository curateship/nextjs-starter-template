// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { LiveFigures, MarketCatalog } from "@/lib/protocols/contracts"

const feed = vi.hoisted(() => ({
  figures: (_updates: ReadonlyMap<string, LiveFigures>) => {},
  catchUp: () => {},
  stops: vi.fn(),
}))
vi.mock("@/lib/protocols/live-registry", () => ({
  getLiveAdapter: () => ({
    watchFigures: (_network: string, listener: typeof feed.figures) => {
      feed.figures = listener
      return feed.stops
    },
    watchCatchUp: (_network: string, listener: () => void) => {
      feed.catchUp = listener
      return feed.stops
    },
  }),
}))
vi.mock("@/lib/api/trade/markets", () => ({ refreshMarketPrices: vi.fn() }))

import {
  clearLiveCatalog,
  liveVenueStatus,
  marketHistory,
  retainMarketHistory,
  startLiveMarketData,
  useLiveFiguresMap,
} from "./live-market"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe("explorer live figures", () => {
  it("uses one live snapshot, expires stale figures and clears windows on recovery", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16)
    )
    vi.stubGlobal("cancelAnimationFrame", clearTimeout)
    vi.setSystemTime(1_000_000)
    const key = "aster:mainnet:BTCUSDT"
    const catalog: MarketCatalog = {
      protocol: "aster",
      protocolLabel: "Aster",
      network: "mainnet",
      networkLabel: "Mainnet",
      picker: {
        categories: "crypto-only",
        hip3: false,
        funding: true,
        openInterest: false,
      },
      rows: [
        {
          key,
          marketId: "BTCUSDT",
          symbol: "BTC",
          quoteAsset: "USDT",
          subExchange: null,
          category: "crypto",
          sizeDecimals: null,
          priceTick: null,
          minOrderValueUsd: null,
          maxLeverage: null,
          isolatedOnly: false,
          iconUrl: null,
          price: 90,
          change24h: null,
          volume24hUsd: 1000,
          fundingHourly: null,
          openInterestUsd: null,
        },
      ],
    }
    clearLiveCatalog(catalog)
    const release = retainMarketHistory(),
      stop = startLiveMarketData([catalog], () => {})
    let snapshot: ReadonlyMap<string, LiveFigures> = new Map()
    function Probe() {
      snapshot = useLiveFiguresMap([key])
      return null
    }
    const host = document.createElement("div"),
      root = createRoot(host)
    await act(async () => root.render(<Probe />))
    expect(liveVenueStatus(catalog, Date.now())).toBe("connecting")
    for (let second = 0; second <= 5; second++) {
      await act(async () => {
        vi.setSystemTime(1_000_000 + second * 1000)
        feed.figures(
          new Map([
            [
              "BTCUSDT",
              {
                price: 100 + second,
                change24h: 0.1,
                volume24hUsd: 1000 + second * 100,
                fundingHourly: null,
                openInterestUsd: null,
              },
            ],
          ])
        )
        vi.advanceTimersByTime(20)
      })
    }
    expect(snapshot.get(key)?.price).toBe(105)
    expect(snapshot.get(key)?.volume24hUsd).toBe(1500)
    expect(marketHistory.window(key, Date.now(), 5)?.traded).toBe(500)
    expect(liveVenueStatus(catalog, Date.now())).toBe("live")
    await act(async () => vi.advanceTimersByTime(31_000))
    expect(snapshot.has(key)).toBe(false)
    expect(liveVenueStatus(catalog, Date.now())).toBe("stale")
    await act(async () => {
      feed.catchUp()
      vi.advanceTimersByTime(20)
    })
    expect(marketHistory.window(key, Date.now(), 5)).toBeNull()
    expect(liveVenueStatus(catalog, Date.now(), false)).toBe("paused")
    await act(async () => root.unmount())
    stop()
    release()
    clearLiveCatalog(catalog)
    expect(feed.stops).toHaveBeenCalledTimes(2)
  })
})
