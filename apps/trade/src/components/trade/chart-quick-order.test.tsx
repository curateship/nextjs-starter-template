// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartQuickOrder } from "@/components/trade/chart-quick-order"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketRow } from "@/lib/protocols/contracts"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import type { TradePosition } from "@/lib/trade/paper"

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

const prefs: QuickOrderPrefs = {
  sizeUnit: "usd",
  size: "100",
  leverage: 1,
  bracketOn: false,
  stopOn: false,
  targetOn: false,
  stopUnit: "pct",
  stopPrice: "",
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

/** A long already open, for the window that adds to one. */
const heldLong: TradePosition = {
  id: "hyperliquid:mainnet:BTC",
  walletId: "w1",
  marketKey: market.key,
  szi: 5,
  entryPx: 95,
  leverage: 2,
  maxLeverage: 20,
  targets: [],
  tpPx: null,
  tpSz: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 0,
}

async function draw({
  side = "buy",
  initialPrefs = prefs,
  addingTo = null,
}: {
  side?: "buy" | "sell"
  initialPrefs?: typeof prefs
  addingTo?: TradePosition | null
}) {
  const onPlace = vi.fn()
  const onRemember = vi.fn()
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
          addingTo={addingTo}
          free={10_000}
          equity={10_000}
          prefs={initialPrefs}
          onPlace={onPlace}
          onRemember={onRemember}
          onClose={() => {}}
        />
      </TooltipProvider>
    )
  )
  return { onPlace, onRemember }
}

async function type(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`no ${selector}`)
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function place() {
  await act(async () => {
    host.querySelector<HTMLButtonElement>("button.w-full")?.click()
  })
}

describe("the chart's Long, Short and Market window", () => {
  it("keeps a Long at the clicked level even when it starts above the market", async () => {
    const { onPlace } = await draw({})

    expect(host.textContent).toContain("Long")
    expect(host.textContent).not.toContain("Fills straight away")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "buy",
        px: 110,
        sz: 100 / 110,
        market: false,
      })
    )
  })

  it("adds to a position at today's price and starts working at once", async () => {
    // The window opens wherever the chart was — 110 here — while the market is
    // at 100. Pinning the order to 110 is what made adding wait for a price
    // the market had already left, sometimes for minutes.
    const { onPlace } = await draw({ addingTo: heldLong })

    // The size box opens empty when adding: how much MORE to buy has nothing
    // to do with what the last order was for.
    await type("#quick-size", "100")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "buy",
        px: 100,
        startNow: true,
        // Still not a market order: the post-only chase does the work.
        market: false,
      })
    )
  })

  it("leaves an ordinary Long waiting at the level it was clicked at", async () => {
    const { onPlace } = await draw({})

    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ px: 110, startNow: false })
    )
  })

  it("keeps a Short below market waiting while Market is clear", async () => {
    const { onPlace } = await draw({ side: "sell" })

    expect(
      host
        .querySelector<HTMLElement>("#quick-market")
        ?.getAttribute("data-state")
    ).toBe("unchecked")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", px: 90, market: false })
    )
  })

  it("market-shorts now when Market is checked inside the Short window", async () => {
    const { onPlace } = await draw({ side: "sell" })

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#quick-market")?.click()
    })
    expect(host.textContent).toContain("Market short BTC")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", px: 100, market: true })
    )
  })

  it("places a stop loss by itself and accepts a trailing percent sign", async () => {
    const { onPlace, onRemember } = await draw({})

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#quick-stop-on")?.click()
    })
    await type("#quick-stop", "2%")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ slPx: 107.8, tpPx: null })
    )
    expect(onRemember).toHaveBeenCalledWith(
      expect.objectContaining({
        bracketOn: false,
        stopOn: true,
        targetOn: false,
        stopPct: "2%",
      })
    )
  })

  it("places a take profit without inventing a stop loss", async () => {
    const { onPlace } = await draw({})

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#quick-target-on")?.click()
    })
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ slPx: null, tpPx: 115.5 })
    )
  })

  it("uses the old combined switch as both protection lines", async () => {
    const { onPlace } = await draw({
      initialPrefs: { ...prefs, bracketOn: true },
    })

    expect(
      host
        .querySelector<HTMLElement>("#quick-stop-on")
        ?.getAttribute("data-state")
    ).toBe("checked")
    expect(
      host
        .querySelector<HTMLElement>("#quick-target-on")
        ?.getAttribute("data-state")
    ).toBe("checked")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ slPx: 107.8, tpPx: 115.5 })
    )
  })

  it("requires a stop loss for Risk size without requiring a take profit", async () => {
    const { onPlace } = await draw({
      initialPrefs: { ...prefs, sizeUnit: "risk", size: "1" },
    })

    expect(
      host.querySelector<HTMLButtonElement>("#quick-stop-on")?.disabled
    ).toBe(true)
    expect(
      host
        .querySelector<HTMLElement>("#quick-target-on")
        ?.getAttribute("data-state")
    ).toBe("unchecked")
    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ slPx: 107.8, tpPx: null })
    )
  })

  it("uses an absolute stop price when that form was remembered", async () => {
    const { onPlace } = await draw({
      initialPrefs: {
        ...prefs,
        stopOn: true,
        stopUnit: "price",
        stopPrice: "108",
      },
    })

    await place()

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ slPx: 108, tpPx: null })
    )
  })

  it("names the stop loss when an absolute price is on the wrong side", async () => {
    const { onPlace } = await draw({
      initialPrefs: {
        ...prefs,
        stopOn: true,
        stopUnit: "price",
        stopPrice: "115",
      },
    })

    await place()

    expect(onPlace).not.toHaveBeenCalled()
    expect(host.textContent).toContain("Stop loss price")
    expect(
      host
        .querySelector<HTMLInputElement>("#quick-stop")
        ?.getAttribute("aria-invalid")
    ).toBe("true")
  })
})
