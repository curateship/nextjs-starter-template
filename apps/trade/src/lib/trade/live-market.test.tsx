// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  CandleBar,
  LiveFigures,
  MarketCatalog,
} from "@/lib/protocols/contracts"

const feed = vi.hoisted(() => ({
  figures: null as
    | ((updates: ReadonlyMap<string, LiveFigures>) => void)
    | null,
  candle: null as ((bar: CandleBar) => void) | null,
}))

vi.mock("@/lib/protocols/live-registry", () => ({
  getLiveAdapter: () => ({
    watchFigures: (
      _network: string,
      listener: (updates: ReadonlyMap<string, LiveFigures>) => void
    ) => {
      feed.figures = listener
      return () => {}
    },
    watchCatchUp: () => () => {},
    watchCandle: (
      _network: string,
      _marketId: string,
      _interval: string,
      listener: (bar: CandleBar) => void
    ) => {
      feed.candle = listener
      return () => {}
    },
  }),
}))

const { startLiveMarketData, useLiveMarks, watchLiveCandle } =
  await import("@/lib/trade/live-market")

const catalog: MarketCatalog = {
  protocol: "hyperliquid",
  protocolLabel: "Hyperliquid",
  network: "mainnet",
  networkLabel: "Mainnet",
  picker: {
    categories: "full",
    hip3: true,
    funding: true,
    openInterest: true,
  },
  rows: [],
}

function figures(price: number): LiveFigures {
  return {
    price,
    change24h: null,
    volume24hUsd: 0,
    fundingHourly: null,
    openInterestUsd: null,
  }
}

let frames: FrameRequestCallback[]
let host: HTMLDivElement
let root: Root
let visibility: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  feed.figures = null
  feed.candle = null
  frames = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
  visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible")
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("live market batches", () => {
  it("wakes a subscriber once for 450 prices and keeps the newest price", async () => {
    const keys = Array.from(
      { length: 450 },
      (_, index) => `hyperliquid:mainnet:COIN${index}`
    )
    let renders = 0
    let latest: ReadonlyMap<string, number> = new Map()
    function Probe() {
      renders += 1
      latest = useLiveMarks(keys)
      return null
    }

    await act(async () => root.render(<Probe />))
    const before = renders
    const stop = startLiveMarketData([catalog], () => {})
    const first = new Map(
      keys.map((key, index) => [key.split(":").at(-1)!, figures(index)])
    )

    await act(async () => {
      feed.figures?.(first)
      feed.figures?.(new Map([["COIN0", figures(999)]]))
    })

    expect(renders).toBe(before)
    expect(frames).toHaveLength(1)
    await act(async () => frames.shift()?.(performance.now()))

    expect(renders).toBe(before + 1)
    expect(latest.size).toBe(450)
    expect(latest.get(keys[0]!)).toBe(999)
    stop()
  })

  it("gives a subscriber added mid-frame the batch already in memory", async () => {
    startLiveMarketData([catalog], () => {})
    feed.figures?.(new Map([["MID", figures(42)]]))

    function Probe() {
      const marks = useLiveMarks(["hyperliquid:mainnet:MID"])
      return <span>{marks.get("hyperliquid:mainnet:MID")}</span>
    }
    await act(async () => root.render(<Probe />))

    expect(host.textContent).toBe("42")
    await act(async () => frames.shift()?.(performance.now()))
  })

  it("flushes a waiting batch when the tab becomes hidden", async () => {
    let latest: number | undefined
    function Probe() {
      latest = useLiveMarks(["hyperliquid:mainnet:HIDDEN"]).get(
        "hyperliquid:mainnet:HIDDEN"
      )
      return null
    }
    await act(async () => root.render(<Probe />))
    startLiveMarketData([catalog], () => {})
    feed.figures?.(new Map([["HIDDEN", figures(77)]]))
    expect(latest).toBeUndefined()

    visibility.mockReturnValue("hidden")
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))

    expect(latest).toBe(77)
  })

  it("keeps the chart candle callback immediate", () => {
    const bars: CandleBar[] = []
    watchLiveCandle(
      "hyperliquid:mainnet:BTC",
      "1m",
      (bar) => bars.push(bar)
    )
    const bar = {
      openTime: 1,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
    }

    feed.candle?.(bar)

    expect(bars).toEqual([bar])
    expect(frames).toHaveLength(0)
  })
})
