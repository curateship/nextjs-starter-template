// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartQuickOrder } from "@/components/trade/chart-quick-order"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketRow } from "@/lib/protocols/contracts"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const market = {
  key: "hyperliquid:mainnet:BTC",
  marketId: "BTC",
  symbol: "BTC",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: 0.1,
  minOrderValueUsd: 5,
  maxLeverage: 20,
  isolatedOnly: false,
  iconUrl: null,
  price: 100,
  change24h: 0,
  volume24hUsd: 1_000_000,
  fundingHourly: null,
  openInterestUsd: null,
} satisfies MarketRow

const prefs = {
  sizeUnit: "usd" as const,
  size: "100",
  leverage: 1,
  bracketOn: false,
  stopPct: "2",
  targetPct: "5",
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function draw({ side = "buy" }: { side?: "buy" | "sell" }) {
  const onPlace = vi.fn()
  await act(async () =>
    root.render(
      <TooltipProvider>
        <ChartQuickOrder
          quick={{
            side,
            px: side === "sell" ? 90 : 110,
            x: 100,
            y: 100,
          }}
          market={market}
          wallet="Practice"
          addingTo={null}
          free={10_000}
          equity={10_000}
          prefs={prefs}
          onPlace={onPlace}
          onRemember={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>
    )
  )
  return onPlace
}

describe("the chart's Long, Short and Market window", () => {
  it("keeps a Long at the clicked level even when it starts above the market", async () => {
    const onPlace = await draw({})

    expect(host.textContent).toContain("Long")
    expect(host.textContent).not.toContain("Fills straight away")
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button.w-full")?.click()
    })

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "buy",
        px: 110,
        sz: 100 / 110,
        market: false,
      })
    )
  })

  it("keeps a Short below market waiting while Market is clear", async () => {
    const onPlace = await draw({ side: "sell" })

    expect(
      host
        .querySelector<HTMLElement>("#quick-market")
        ?.getAttribute("data-state")
    ).toBe("unchecked")
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button.w-full")?.click()
    })

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", px: 90, market: false })
    )
  })

  it("market-shorts now when Market is checked inside the Short window", async () => {
    const onPlace = await draw({ side: "sell" })

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#quick-market")?.click()
    })
    expect(host.textContent).toContain("Market short BTC")
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button.w-full")?.click()
    })

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", px: 100, market: true })
    )
  })
})
