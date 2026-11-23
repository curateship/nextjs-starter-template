// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type {
  ExplorerOpening,
  ExplorerVenue,
} from "@/lib/api/trade/market-explorer"
import type { ProtocolId } from "@/lib/protocols/contracts"
import { defaultExplorerPrefs } from "@/lib/trade/market-explorer"

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
}))
vi.mock("@/lib/api/trade/market-explorer", () => ({
  loadMarketExplorer: mocks.load,
  saveMarketExplorer: vi.fn(),
}))
vi.mock("@/lib/trade/live-market", () => ({
  clearLiveCatalog: mocks.clear,
  retainMarketHistory: () => () => {},
  startLiveMarketData: mocks.start,
}))
import { useExplorerLive, useExplorerVenues } from "./use-explorer"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it("releases deselected feeds, excludes them from refreshes and fetches newly enabled venues", async () => {
  vi.useFakeTimers()
  vi.spyOn(document, "hidden", "get").mockReturnValue(false)
  mocks.start.mockReturnValue(mocks.stop)
  const aster: ExplorerVenue = {
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
      rows: [],
    },
  }
  const opening: ExplorerOpening = {
    prefs: defaultExplorerPrefs(),
    availableVenues: [
      { protocol: "aster", protocolLabel: "Aster" },
      { protocol: "phemex", protocolLabel: "Phemex" },
    ],
    venues: [
      {
        protocol: "aster",
        protocolLabel: "Aster",
        answer: Promise.resolve(aster),
      },
    ],
  }
  mocks.load.mockImplementation(async (protocol: ProtocolId) => ({
    ...opening,
    venues: [
      {
        protocol,
        answer: Promise.resolve({
          ...aster,
          protocol,
          catalog: { ...aster.catalog!, protocol },
        }),
      },
    ],
  }))
  let current: ReturnType<typeof useExplorerVenues>
  function Probe({ selected }: { selected: ProtocolId[] }) {
    current = useExplorerVenues(opening, selected)
    useExplorerLive(current.venues, current.retry)
    return (
      <span>{current.venues.map((venue) => venue.protocol).join(",")}</span>
    )
  }
  const host = document.createElement("div"),
    root = createRoot(host)
  try {
    await act(async () => root.render(<Probe selected={["aster"]} />))
    await act(async () => current.accept(aster))
    expect(host.textContent).toBe("aster")
    await act(async () => root.render(<Probe selected={[]} />))
    expect(host.textContent).toBe("")
    expect(mocks.stop).toHaveBeenCalled()
    expect(mocks.clear).toHaveBeenCalledWith(aster.catalog)
    mocks.load.mockClear()
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(mocks.load).not.toHaveBeenCalled()
    await act(async () => root.render(<Probe selected={["phemex"]} />))
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("phemex")
    expect(host.textContent).toBe("phemex")
    mocks.load.mockClear()
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("phemex")
  } finally {
    await act(async () => root.unmount())
  }
})
