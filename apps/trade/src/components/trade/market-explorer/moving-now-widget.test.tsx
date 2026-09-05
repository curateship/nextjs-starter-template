// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ExplorerOpening } from "@/lib/api/trade/market-explorer"
import { defaultExplorerPrefs } from "@/lib/trade/market-explorer"

const mocks = vi.hoisted(() => ({ load: vi.fn(), window: vi.fn() }))
vi.mock("@/lib/api/trade/market-explorer", () => ({
  loadMarketExplorer: mocks.load,
  saveMarketExplorer: vi.fn(),
}))
vi.mock("@/lib/trade/live-market", () => ({
  clearLiveCatalog: vi.fn(),
  retainMarketHistory: () => () => {},
  startLiveMarketData: () => () => {},
  useLiveFiguresMap: () => new Map(),
  marketHistory: { window: mocks.window },
}))
import { MovingNowWidget } from "./moving-now-widget"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement
function opening(): ExplorerOpening {
  return {
    prefs: defaultExplorerPrefs(),
    availableVenues: [{ protocol: "aster", protocolLabel: "Aster" }],
    venues: [
      {
        protocol: "aster",
        protocolLabel: "Aster",
        answer: Promise.resolve({
          protocol: "aster",
          protocolLabel: "Aster",
          hidden: 0,
          orders: true,
          message: null,
          catalog: {
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
            rows: Array.from({ length: 20 }, (_, index) => ({
              key: `aster:mainnet:COIN${index}`,
              marketId: `COIN${index}`,
              symbol: `COIN${index}`,
              quoteAsset: "USDT",
              subExchange: null,
              category: "crypto",
              sizeDecimals: null,
              priceTick: null,
              minOrderValueUsd: null,
              maxLeverage: null,
              isolatedOnly: false,
              iconUrl: null,
              price: index + 1,
              change24h: null,
              volume24hUsd: 1000,
              fundingHourly: null,
              openInterestUsd: null,
            })),
          },
        }),
      },
    ],
  }
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  mocks.load.mockReset().mockResolvedValue(opening())
  mocks.window.mockReset().mockImplementation((key: string) => ({
    traded: Number(key.split("COIN")[1]) * 1000,
    move: 1,
    fraction: 0.01,
  }))
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it("shows the ten busiest completed minute windows with chart links in a scroll area", async () => {
  await act(async () => root.render(<MovingNowWidget className="max-h-72" />))
  expect(host.querySelectorAll("li")).toHaveLength(10)
  expect(host.querySelector("ol a")?.textContent).toBe("COIN19 · Aster")
  expect(host.querySelector("ol a")?.getAttribute("href")).toBe(
    "/admin/aster?market=aster%3Amainnet%3ACOIN19"
  )
  expect(
    host.querySelector('[data-slot="scroll-area-viewport"] ol')
  ).not.toBeNull()
})
it("retries a failed load and explains why the first minute is empty", async () => {
  mocks.load.mockRejectedValueOnce(new Error("unavailable"))
  mocks.window.mockReturnValue(null)
  await act(async () => root.render(<MovingNowWidget />))
  expect(host.textContent).toContain("Markets could not load")
  await act(async () => host.querySelector("button")!.click())
  expect(mocks.load).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain("Waiting for one uninterrupted minute")
  expect(host.querySelectorAll("li")).toHaveLength(0)
})
