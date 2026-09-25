// @vitest-environment jsdom
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  CandleBar,
  LiveFigures,
  MarketCatalog,
  MarketRow,
} from "@/lib/protocols/contracts"
const feed = vi.hoisted(() => ({
  figures: (_updates: ReadonlyMap<string, LiveFigures>) => {},
  candle: (_bar: CandleBar) => {},
  recover: () => {},
  stop: vi.fn(),
  catalog: vi.fn(),
  history: vi.fn(),
}))
vi.mock("@/lib/api/trade/market-scanner", () => ({
  loadScannerCatalogs: feed.catalog,
}))
vi.mock("@/lib/api/trade/candles", () => ({ loadCandles: feed.history }))
vi.mock("@/lib/api/trade/markets", () => ({ refreshMarketPrices: vi.fn() }))
vi.mock("@/lib/protocols/live-registry", () => ({
  getLiveAdapter: () => ({
    watchFigures: (_network: string, listener: typeof feed.figures) => {
      feed.figures = listener
      return feed.stop
    },
    watchCandle: (
      _network: string,
      _market: string,
      _interval: string,
      listener: typeof feed.candle
    ) => {
      feed.candle = listener
      return feed.stop
    },
    watchCatchUp: (_network: string, listener: () => void) => {
      feed.recover = listener
      return feed.stop
    },
  }),
}))
import { useMarketScanner, type ScannerSnapshot } from "./use-market-scanner"
import { defaultScannerSettings } from "./market-scanner"
import { clearLiveCatalog } from "./live-market"
const market = {
  key: "aster:mainnet:BTCUSDT",
  marketId: "BTCUSDT",
  symbol: "BTC",
  volume24hUsd: 14_400_000,
} as MarketRow
const catalog = {
  protocol: "aster",
  network: "mainnet",
  rows: [market],
} as MarketCatalog
let root: Root, host: HTMLDivElement, snapshot: ScannerSnapshot
const settings = {
  ...defaultScannerSettings(),
  exchanges: ["aster" as const],
  volumeMultiple: 3,
  mode: "volume" as const,
}
// Keep settings identity stable across internal subscription updates.
const enabledSettings = settings,
  disabledSettings = { ...settings, enabled: false }
function StableProbe({ enabled = true }: { enabled?: boolean }) {
  const next = useMarketScanner(
    enabled ? enabledSettings : disabledSettings,
    [],
    "test-account"
  ).snapshot
  useEffect(() => {
    snapshot = next
  }, [next])
  return null
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(1_800_000)
  feed.catalog.mockResolvedValue([{ protocol: "aster", catalog, error: null }])
  feed.history.mockResolvedValue({ candles: [] })
  host = document.createElement("div")
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  clearLiveCatalog(catalog)
  vi.useRealTimers()
})
async function tick(volume: number, price = 100) {
  await act(async () => {
    feed.figures(
      new Map([
        [
          market.marketId,
          {
            price,
            volume24hUsd: volume,
            change24h: 0,
            fundingHourly: null,
            openInterestUsd: null,
          },
        ],
      ])
    )
    await vi.advanceTimersByTimeAsync(1000)
  })
}
it("finds volume without Discovery, keeps detections through gaps and disabling, and releases watches", async () => {
  await act(async () => root.render(<StableProbe />))
  for (let second = 0; second <= 61; second++)
    await tick(14_400_000 + second * 1000)
  expect(snapshot.rows).toHaveLength(1)
  const appeared = snapshot.rows[0].since
  await tick(14_462_000)
  expect(snapshot.rows[0].since).toBe(appeared)
  expect(snapshot.rows[0].market.key).toBe(market.key)
  await act(async () => vi.advanceTimersByTimeAsync(31_000))
  expect(snapshot.rows).toHaveLength(1)
  for (let second = 0; second <= 61; second++)
    await tick(14_500_000 + second * 1000)
  expect(snapshot.rows).toHaveLength(1)
  expect(snapshot.rows[0].since).toBe(appeared)
  await act(async () => root.render(<StableProbe enabled={false} />))
  expect(snapshot.rows).toHaveLength(1)
  expect(feed.stop).toHaveBeenCalled()
  const calls = feed.history.mock.calls.length
  await act(async () => vi.advanceTimersByTimeAsync(60_000))
  expect(feed.history).toHaveBeenCalledTimes(calls)
})
it("clears matches and refreshes history after recovery", async () => {
  await act(async () => root.render(<StableProbe />))
  for (let second = 0; second <= 61; second++)
    await tick(14_400_000 + second * 1000)
  const before = feed.history.mock.calls.length
  await act(async () => {
    feed.recover()
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(feed.history.mock.calls.length).toBeGreaterThan(before)
})

const priceSettings = {
  ...defaultScannerSettings(),
  mode: "price" as const,
  exchanges: ["aster" as const],
}
let deleteResult: (key: string) => void
function PriceProbe({ accountId = "price-account" }: { accountId?: string }) {
  const result = useMarketScanner(priceSettings, [], accountId)
  useEffect(() => {
    snapshot = result.snapshot
    deleteResult = result.dismiss
  }, [result])
  return null
}
it("captures a 5% minute rise outside candle coverage, persists it, and suppresses a deleted ongoing match", async () => {
  await act(async () => root.render(<PriceProbe />))
  for (let second = 0; second < 61; second++) await tick(14_400_000, 100)
  expect(snapshot.rows).toHaveLength(0)
  await tick(14_400_000, 105)
  expect(snapshot.rows).toHaveLength(1)
  expect(snapshot.rows[0].change).toBeCloseTo(0.05)
  const detected = snapshot.rows[0].since
  expect(feed.history).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  root = createRoot(host)
  await act(async () => root.render(<PriceProbe />))
  expect(snapshot.rows[0].since).toBe(detected)
  await act(async () => deleteResult(market.key))
  expect(snapshot.rows).toHaveLength(0)
  for (let second = 0; second < 61; second++)
    await tick(14_400_000, 100 + second)
  expect(snapshot.rows).toHaveLength(0)
  // A real nonmatch, not a disconnect, makes a later rise a new event.
  for (let second = 0; second < 62; second++) await tick(14_400_000, 100)
  await tick(14_400_000, 106)
  expect(snapshot.rows).toHaveLength(1)
  expect(snapshot.rows[0].change).toBeCloseTo(0.06)
  await act(async () =>
    root.render(<PriceProbe key="other" accountId="other-account" />)
  )
  expect(snapshot.rows).toHaveLength(0)
})
