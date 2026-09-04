// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MarketCatalog, MarketRow } from "@/lib/protocols/contracts"

/**
 * Prices on a venue with no socket, refreshed by asking.
 *
 * Solana is the venue: Jupiter publishes no websocket, and a Solana coin's
 * price is the best path across several pools rather than one pool's
 * numbers. `rules/trading-rules.md` forbids asking on a timer as the LIVE
 * path, so this drives the screen and never the engine. These tests pin the
 * three things that keep it honest and cheap: it asks only about the busiest
 * markets, a hidden tab asks nothing, and a failed turn changes nothing.
 */

// No socket for this venue, which is the whole premise.
vi.mock("@/lib/protocols/live-registry", () => ({
  getLiveAdapter: () => undefined,
}))

const asked = vi.hoisted(() => ({ calls: [] as string[][], answer: vi.fn() }))

vi.mock("@/lib/api/trade/markets", () => ({
  refreshMarketPrices: (
    _protocol: string,
    _network: string,
    marketIds: readonly string[]
  ) => {
    asked.calls.push([...marketIds])
    return asked.answer(marketIds)
  },
}))

const { startLiveMarketData, useLiveFigures } = await import(
  "@/lib/trade/live-market"
)

function row(marketId: string, price: number, volume: number): MarketRow {
  return {
    key: `solana:mainnet:${marketId}`,
    marketId,
    symbol: marketId,
    quoteAsset: "USDC",
    subExchange: null,
    category: "crypto",
    sizeDecimals: 6,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price,
    change24h: 0.05,
    volume24hUsd: volume,
    fundingHourly: null,
    openInterestUsd: null,
  }
}

function catalogOf(
  rows: MarketRow[],
  priceRefresh: MarketCatalog["priceRefresh"]
): MarketCatalog {
  return {
    protocol: "solana",
    protocolLabel: "Solana",
    network: "mainnet",
    networkLabel: "Mainnet",
    picker: {
      categories: "catalog",
      hip3: false,
      funding: false,
      openInterest: false,
      search: true,
    },
    priceRefresh,
    rows,
  }
}

const REFRESH = { everyMs: 10_000, mostMarkets: 2 }

/**
 * One turn of the clock, plus a moment for the repaint.
 *
 * The store batches its notifications into an animation frame, which is
 * scheduled only once the answer lands — so advancing exactly one interval
 * runs the ask and stops before the screen is told.
 */
async function oneTurn(turns = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REFRESH.everyMs * turns)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50)
  })
}

let host: HTMLDivElement
let root: Root

function Figures({ marketKey }: { marketKey: string }) {
  const live = useLiveFigures(marketKey)
  return <output>{live ? `${live.price}/${live.change24h}` : "none"}</output>
}

const shown = () => host.querySelector("output")?.textContent

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  asked.calls.length = 0
  asked.answer.mockReset()
  asked.answer.mockResolvedValue({ prices: [] })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe("refreshing prices where there is no socket", () => {
  it("asks on the venue's own clock and moves the price on screen", async () => {
    asked.answer.mockResolvedValue({ prices: [["TICKS", 120]] })
    const stop = startLiveMarketData(
      [catalogOf([row("TICKS", 100, 9_000)], REFRESH)],
      () => {}
    )
    await act(async () =>
      root.render(<Figures marketKey="solana:mainnet:TICKS" />)
    )
    // The list's own prices arrived with the page, so nothing is asked yet.
    expect(asked.calls).toHaveLength(0)
    expect(shown()).toBe("none")

    await oneTurn()
    expect(asked.calls).toEqual([["TICKS"]])
    // The price moved; the day's move came from the list and was not blanked.
    expect(shown()).toBe("120/0.05")
    stop()
  })

  it("asks only about the busiest markets, and never more than the cap", async () => {
    const stop = startLiveMarketData(
      [
        catalogOf(
          [
            row("QUIET", 1, 10),
            row("BUSY", 2, 900_000),
            row("MIDDLING", 3, 5_000),
          ],
          REFRESH
        ),
      ],
      () => {}
    )
    await oneTurn()
    // Two markets is the cap here, so the quietest is left out.
    expect(asked.calls[0]).toEqual(["BUSY", "MIDDLING"])
    stop()
  })

  it("asks nothing at all while the tab is hidden", async () => {
    const hidden = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    const stop = startLiveMarketData(
      [catalogOf([row("SOL", 100, 9_000)], REFRESH)],
      () => {}
    )
    await oneTurn(3)
    expect(asked.calls).toHaveLength(0)

    // Looked at again, it picks straight back up.
    hidden.mockReturnValue("visible")
    await oneTurn()
    expect(asked.calls).toHaveLength(1)
    hidden.mockRestore()
    stop()
  })

  it("leaves the screen alone when a refresh fails, and asks again", async () => {
    asked.answer.mockRejectedValueOnce(new Error("EXCHANGE_BUSY"))
    asked.answer.mockResolvedValue({ prices: [["RETRIES", 130]] })
    const stop = startLiveMarketData(
      [catalogOf([row("RETRIES", 100, 9_000)], REFRESH)],
      () => {}
    )
    await act(async () =>
      root.render(<Figures marketKey="solana:mainnet:RETRIES" />)
    )
    await oneTurn()
    // The failed turn published nothing rather than a blank or a zero.
    expect(shown()).toBe("none")

    await oneTurn()
    expect(shown()).toBe("130/0.05")
    stop()
  })

  it("asks nothing for a venue that never said it could be asked", async () => {
    const stop = startLiveMarketData(
      [catalogOf([row("SILENT", 100, 9_000)], undefined)],
      () => {}
    )
    await oneTurn(6)
    expect(asked.calls).toHaveLength(0)
    stop()
  })

  it("stops asking once the page lets go", async () => {
    const stop = startLiveMarketData(
      [catalogOf([row("STOPS", 100, 9_000)], REFRESH)],
      () => {}
    )
    await oneTurn()
    expect(asked.calls).toHaveLength(1)
    stop()
    await oneTurn(5)
    expect(asked.calls).toHaveLength(1)
  })
})
