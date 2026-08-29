// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useDashboardMarkets,
  type DashboardMarkets,
} from "@/components/trade/use-dashboard-markets"
import type { NetworkId } from "@/lib/protocols/contracts"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"

vi.mock("@/lib/api/trade/markets", () => ({
  loadMarkets: vi.fn(),
  getMarketsErrorMessage: () => "failed",
}))

function catalogOf(symbol: string) {
  return {
    protocol: "hyperliquid",
    rows: [{ key: `hyperliquid:mainnet:${symbol}` }],
    hiddenByVolumeRows: [],
  } as unknown as FilteredMarketCatalog
}

const landed = (symbol: string): DashboardMarkets => ({
  catalogs: [catalogOf(symbol)],
  error: null,
  pending: false,
})

const PENDING: DashboardMarkets = { catalogs: [], error: null, pending: true }

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function List({
  fromLoader,
  network,
}: {
  fromLoader: DashboardMarkets
  network: NetworkId
}) {
  const { markets } = useDashboardMarkets(fromLoader, "hyperliquid", network)
  return (
    <output>
      {markets.pending
        ? "loading"
        : markets.catalogs
            .flatMap((catalog) => catalog.rows.map((row) => row.key))
            .join(",") || "empty"}
    </output>
  )
}

const shown = () => host.querySelector("output")?.textContent

describe("useDashboardMarkets", () => {
  it("keeps the shown list while a fresh answer for the same network streams", async () => {
    await act(async () =>
      root.render(<List fromLoader={landed("BTC")} network="mainnet" />)
    )
    expect(shown()).toBe("hyperliquid:mainnet:BTC")

    // Revisiting after the route cache expired: the loader answers again and
    // its exchange half is pending. The list on screen stays up.
    await act(async () =>
      root.render(<List fromLoader={PENDING} network="mainnet" />)
    )
    expect(shown()).toBe("hyperliquid:mainnet:BTC")

    await act(async () =>
      root.render(<List fromLoader={landed("ETH")} network="mainnet" />)
    )
    expect(shown()).toBe("hyperliquid:mainnet:ETH")
  })

  it("drops the shown list the moment the network changes", async () => {
    await act(async () =>
      root.render(<List fromLoader={landed("BTC")} network="mainnet" />)
    )
    // Another network's markets are a different list; holding the old one up
    // while the new one loads would show the wrong exchange floor.
    await act(async () =>
      root.render(<List fromLoader={PENDING} network="testnet" />)
    )
    expect(shown()).toBe("loading")
  })

  it("shows loading on a fresh open with nothing to keep", async () => {
    await act(async () =>
      root.render(<List fromLoader={PENDING} network="mainnet" />)
    )
    expect(shown()).toBe("loading")
  })
})
