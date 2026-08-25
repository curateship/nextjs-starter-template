// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/smart-orders", () => ({
  loadSmartGridParams: vi.fn(),
}))

// The isomorphic cookie read inside this hook throws under the test runner,
// which has neither a server request nor a real browser cookie jar.
vi.mock("@/lib/layout/wide-screen", () => ({
  useWideScreen: () => true,
}))

import { GridOrderDialog } from "@/components/trade/grid-order-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadSmartGridParams } from "@/lib/api/smart-orders"
import type { MarketRow } from "@/lib/protocols/contracts"
import { defaultGridParams, type GridParams } from "@/lib/trade/grid"

const market: MarketRow = {
  key: "hyperliquid:mainnet:BTC",
  marketId: "BTC",
  symbol: "BTC",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: null,
  minOrderValueUsd: null,
  maxLeverage: 50,
  isolatedOnly: false,
  iconUrl: null,
  price: 100,
  change24h: 0,
  volume24hUsd: 1_000_000,
  fundingHourly: 0,
  openInterestUsd: 1_000_000,
}

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
  vi.clearAllMocks()
})

describe("the grid window's saved settings", () => {
  const renderDialog = async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <GridOrderDialog
            state={{ px: 80, x: 20, y: 20 }}
            market={market}
            wallet="Practice"
            equity={1_000}
            free={1_000}
            takerFeeRate={0.00045}
            busy={false}
            onPreview={() => undefined}
            onPlace={async () => false}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
    })
  }

  it("starts with every field typable, and merges the saved settings when they land", async () => {
    let finishRead: (value: { params: GridParams | null }) => void = () =>
      undefined
    const read = new Promise<{ params: GridParams | null }>((resolve) => {
      finishRead = resolve
    })
    vi.mocked(loadSmartGridParams).mockReturnValue(read)

    await renderDialog()

    // Nothing waits for the server: the range choice works at once.
    const rangeChoice = host.querySelector<HTMLButtonElement>("#grid-anchor")
    expect(rangeChoice?.disabled).toBe(false)

    await act(async () => {
      finishRead({ params: { ...defaultGridParams(), levels: 17 } })
      await read
    })

    // Untouched, so the remembered settings replace the defaults.
    const levels = host.querySelector<HTMLInputElement>("#grid-levels")
    expect(levels?.value).toBe("17")
  })

  it("never overwrites a field somebody has already typed into", async () => {
    let finishRead: (value: { params: GridParams | null }) => void = () =>
      undefined
    const read = new Promise<{ params: GridParams | null }>((resolve) => {
      finishRead = resolve
    })
    vi.mocked(loadSmartGridParams).mockReturnValue(read)

    await renderDialog()

    // A hand gets there before the saved settings do.
    const levels = host.querySelector<HTMLInputElement>("#grid-levels")
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      set?.call(levels, "9")
      levels?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(levels?.value).toBe("9")

    await act(async () => {
      finishRead({ params: { ...defaultGridParams(), levels: 17 } })
      await read
    })

    // The late-arriving save loses: the typed value stays.
    expect(levels?.value).toBe("9")
  })

  it("warns before a new grid follows price down", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()

    expect(host.textContent).not.toContain("This keeps buying as price falls")
    await act(async () => {
      host.querySelector<HTMLButtonElement>("#grid-follow-down")?.click()
    })

    expect(host.textContent).toContain("This keeps buying as price falls")
    expect(host.textContent).toContain("Your stop stays where it was set")
  })
})
