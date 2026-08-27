// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/smart-orders", () => ({
  loadSmartGridParams: vi.fn(),
}))

vi.mock("@/lib/layout/wide-screen", () => ({
  useWideScreen: () => true,
}))

import {
  GridOrderDialog,
  type GridPreviewLine,
} from "@/components/trade/grid-order-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadSmartGridParams } from "@/lib/api/smart-orders"
import type { MarketRow } from "@/lib/protocols/contracts"
import { defaultGridParams, type GridParams } from "@/lib/trade/grid"

Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

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
  const renderDialog = async (
    onPlace: React.ComponentProps<
      typeof GridOrderDialog
    >["onPlace"] = async () => false,
    onPreview: React.ComponentProps<typeof GridOrderDialog>["onPreview"] = () =>
      undefined
  ) => {
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
            onPreview={onPreview}
            onPlace={onPlace}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
    })
  }

  const openAdvanced = async () => {
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Show Advanced settings"]'
    )
    await act(async () => button?.click())
  }

  it("starts with every field typable, and merges the saved settings when they land", async () => {
    let finishRead: (value: { params: GridParams | null }) => void = () =>
      undefined
    const read = new Promise<{ params: GridParams | null }>((resolve) => {
      finishRead = resolve
    })
    vi.mocked(loadSmartGridParams).mockReturnValue(read)

    await renderDialog()

    const rangeChoice = host.querySelector<HTMLButtonElement>("#grid-anchor")
    expect(rangeChoice?.disabled).toBe(false)

    await act(async () => {
      finishRead({ params: { ...defaultGridParams(), levels: 17 } })
      await read
    })

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

    expect(levels?.value).toBe("9")
  })

  it("does not repeat the Follow down tooltip under its checkbox", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()
    await openAdvanced()

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#grid-follow-down")?.click()
    })

    expect(host.textContent).not.toContain("This keeps buying as price falls")
  })

  it("explains both level-spacing choices with concrete prices", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()
    await openAdvanced()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="About Levels spread"]'
        )
        ?.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("$100, $90 and $80")
    expect(document.body.textContent).toContain("$100, $90 and $81")
  })

  it("keeps follow settings inside Advanced without a folded summary", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()
    await openAdvanced()

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#grid-follow")?.click()
      host.querySelector<HTMLButtonElement>("#grid-follow-down")?.click()
    })

    expect(host.textContent).not.toContain("Follows up + down")
    expect(host.textContent).not.toContain("Follows up")
    expect(host.textContent).not.toContain("Follows down")
  })

  it("keeps End Grid on when the grid follows price up", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    const onPlace = vi.fn(async () => false)
    await renderDialog(onPlace)
    await openAdvanced()

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#grid-follow")?.click()
    })

    expect(host.textContent).toContain("End Grid")
    expect(
      host
        .querySelector<HTMLButtonElement>("#grid-tp-on")
        ?.getAttribute("aria-checked")
    ).toBe("true")

    const place = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Place")
    )
    await act(async () => place?.click())

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          follow: true,
          takeProfitPct: expect.any(Number),
        }),
      })
    )
  })

  it("draws End Grid above today's price when the clicked range is below it", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({
      params: { ...defaultGridParams(), anchor: "click", takeProfitPct: 5 },
    })
    const onPreview = vi.fn(
      (_lines: readonly GridPreviewLine[] | null) => undefined
    )

    await renderDialog(async () => false, onPreview)
    await act(async () => Promise.resolve())

    const previews = onPreview.mock.calls
      .map(([lines]) => lines)
      .filter((lines) => lines !== null)
    const endGrid = previews.at(-1)?.find((line) => line.kind === "takeProfit")

    expect(host.textContent).toContain("Above the higher price %")
    expect(endGrid?.px).toBeCloseTo(105, 9)
  })

  it("keeps the repeated price details out of the window", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()

    expect(host.textContent).not.toContain("Price now")
    expect(host.textContent).not.toContain("Top buy, where you clicked")
    expect(host.textContent).not.toContain("Step between levels")
  })

  it("puts the account share in Range and has no split dropdown", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()

    const rangeCard = host
      .querySelector("#grid-pot")
      ?.parentElement?.closest<HTMLDivElement>("div.rounded-lg")
    expect(rangeCard?.textContent).toContain("Range")
    expect(rangeCard?.textContent).toContain("Share of account %")
    expect(host.textContent).not.toContain("Money")
    expect(host.textContent).not.toContain("Split between levels")
    expect(host.textContent).not.toContain("Double at every level down")
    expect(host.querySelector("#grid-sizing")).toBeNull()
  })

  it("places evenly even when saved settings still say double", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({
      params: { ...defaultGridParams(), sizing: "double" },
    })
    const onPlace = vi.fn(async () => false)
    await renderDialog(onPlace)
    await act(async () => Promise.resolve())

    const place = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Place")
    )
    await act(async () => place?.click())

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ sizing: "even" }),
      })
    )
  })

  it("keeps stop loss on even when old saved settings had it off", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({
      params: { ...defaultGridParams(), stopLoss: null },
    })
    const onPlace = vi.fn(async () => false)
    await renderDialog(onPlace)
    await act(async () => Promise.resolve())

    expect(host.textContent).toContain("Stop loss")
    expect(host.querySelector("#grid-sl-pct")).not.toBeNull()
    expect(host.querySelector("#grid-sl-on")).toBeNull()

    const place = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Place")
    )
    await act(async () => place?.click())

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          stopLoss: expect.objectContaining({ underPct: expect.any(Number) }),
        }),
      })
    )
  })

  it("removes the settings chevron when End Grid is off", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({ params: null })
    await renderDialog()

    await act(async () => {
      host.querySelector<HTMLButtonElement>("#grid-tp-on")?.click()
    })

    expect(
      host.querySelector(
        'button[aria-label="Show End Grid"], button[aria-label="Hide End Grid"]'
      )
    ).toBeNull()
    const endCard = host
      .querySelector("#grid-tp-on")
      ?.parentElement?.closest<HTMLDivElement>("div.rounded-lg")
    expect(endCard?.querySelectorAll("button")).toHaveLength(1)
  })

  it("keeps stop loss on when old saved settings had it off", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({
      params: { ...defaultGridParams(), stopLoss: null },
    })
    const onPlace = vi.fn(async () => false)
    await renderDialog(onPlace)
    await act(async () => Promise.resolve())

    expect(host.textContent).toContain("Stop loss")
    expect(host.querySelector("#grid-sl-pct")).not.toBeNull()
    expect(host.querySelector("#grid-sl-on")).toBeNull()

    const place = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Place")
    )
    await act(async () => place?.click())

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          stopLoss: expect.objectContaining({ underPct: expect.any(Number) }),
        }),
      })
    )
  })
})
