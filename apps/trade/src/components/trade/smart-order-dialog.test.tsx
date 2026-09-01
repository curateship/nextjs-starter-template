// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/trade/ladder-base-cache", () => ({
  ladderBase: vi.fn(async () => ({ basePx: 100 })),
}))

vi.mock("@/lib/api/trade/smart-orders", () => ({
  loadSmartDcaParams: vi.fn(async () => ({ params: null })),
  loadSmartGridParams: vi.fn(async () => ({ params: null })),
}))

import {
  SmartOrderDialog,
  type DcaPreview,
} from "@/components/trade/smart-order-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketRow } from "@/lib/protocols/contracts"
import { defaultDcaParams, resizedDcaDeviations } from "@/lib/trade/dca"
import { rememberDcaPrefs } from "@/lib/trade/smart-prefs-cache"

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
  price: 120,
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
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1200,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 900,
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe("the DCA ladder window", () => {
  it("keeps every rung's share of a resized compounded drop", () => {
    const resized = resizedDcaDeviations([5, 8, 11], 100, 77.786, 60)
    expect(resized).not.toBeNull()

    let price = 100
    for (const deviation of resized ?? []) price *= 1 - deviation / 100
    expect(price).toBeCloseTo(60, 9)
    expect((resized ?? [])[0]).toBeLessThan((resized ?? [])[1])
    expect((resized ?? [])[1]).toBeLessThan((resized ?? [])[2])
  })

  it("uses single-field position rows, hides off-card chevrons, and places at a moved preview", async () => {
    let preview: DcaPreview | null = null
    const onPlace = vi.fn(async () => false)
    await act(async () => {
      root.render(
        <TooltipProvider>
          <SmartOrderDialog
            state={{ px: 105, x: 20, y: 20 }}
            market={market}
            equity={10_000}
            free={10_000}
            interval="15m"
            busy={false}
            onPreview={(next) => {
              preview = next
            }}
            onPlace={onPlace}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
      await Promise.resolve()
    })

    // The window follows the grid window's rules: its own ×, no wallet name,
    // and the entries are called longs — Tyler's word for them.
    expect(
      host.querySelector('button[aria-label="Close the window"]')
    ).not.toBeNull()
    expect(host.textContent).toMatch(/Place \d+ longs/)
    expect(host.textContent).not.toMatch(/Place \d+ buys/)

    expect(host.textContent).not.toContain("Hangs from")
    expect(host.querySelector('[aria-label="Show Stop loss"]')).toBeNull()

    const takeProfit = host.querySelector<HTMLButtonElement>("#smart-tp-on")
    await act(async () => takeProfit?.click())
    expect(host.querySelector('[aria-label="Show Take profit"]')).toBeNull()

    const position =
      host.querySelector("#smart-pot")?.parentElement?.parentElement
        ?.parentElement
    expect(position?.className).toContain("grid gap-4")
    expect(position?.className).not.toContain("grid-cols")

    expect(preview).not.toBeNull()
    await act(async () => (preview as DcaPreview | null)?.onMove(115))
    expect((preview as DcaPreview | null)?.anchorPx).toBe(115)

    const place = host.querySelector<HTMLButtonElement>("button.w-full")
    expect(place?.textContent).toContain("Place")
    await act(async () => place?.click())
    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        clickPx: 115,
        params: expect.objectContaining({ anchor: "click" }),
      })
    )
  })

  it("places a watched ladder without reserving its rungs from today's free cash", async () => {
    let preview: DcaPreview | null = null
    const onPlace = vi.fn(async () => true)
    await act(async () => {
      root.render(
        <TooltipProvider>
          <SmartOrderDialog
            state={{ px: 105, x: 20, y: 20 }}
            market={market}
            equity={10_000}
            free={1}
            interval="15m"
            busy={false}
            onPreview={(next) => {
              preview = next
            }}
            onPlace={onPlace}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
      await Promise.resolve()
    })

    expect(preview).not.toBeNull()
    const place = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.startsWith("Place")
    )
    expect(place?.disabled).toBe(false)

    await act(async () => place?.click())
    expect(host.textContent).not.toContain("nothing would fit")
    expect(onPlace).toHaveBeenCalledOnce()
  })

  it("puts each take-profit field on its own full-width row", async () => {
    rememberDcaPrefs({
      ...defaultDcaParams(),
      takeProfit: { mode: "exitLadder", pct: 2, exitGapPct: 0 },
    })

    await act(async () => {
      root.render(
        <TooltipProvider>
          <SmartOrderDialog
            state={{ px: 105, x: 20, y: 20 }}
            market={market}
            equity={10_000}
            free={10_000}
            interval="15m"
            busy={false}
            onPreview={() => undefined}
            onPlace={async () => false}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
      await Promise.resolve()
    })

    const exitMode = host.querySelector<HTMLElement>("#smart-tp-mode")
    const exitGap = host.querySelector<HTMLElement>("#smart-exit-gap")
    const exitLabel = host.querySelector<HTMLLabelElement>(
      'label[for="smart-tp-mode"]'
    )
    const exitGapLabel = host.querySelector<HTMLLabelElement>(
      'label[for="smart-exit-gap"]'
    )
    const fieldRows = exitMode?.parentElement?.parentElement

    expect(exitMode).not.toBeNull()
    expect(exitGap).not.toBeNull()
    expect(exitLabel?.className).toBe(exitGapLabel?.className)
    expect(fieldRows).toBe(exitGap?.parentElement?.parentElement?.parentElement)
    expect(fieldRows?.className).toBe("grid gap-4")
    expect(exitMode?.parentElement?.className).toBe("grid gap-2")
    expect(exitGap?.parentElement?.parentElement?.className).toBe("grid gap-2")
  })

  it("keeps flow-only rules out of a hand-placed ladder", async () => {
    rememberDcaPrefs({
      ...defaultDcaParams(),
      compound: false,
      rungEntry: "market",
      entryLimit: { coins: 1, withinHours: 1 },
    })
    const onPlace = vi.fn(async () => false)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <SmartOrderDialog
            state={{ px: 105, x: 20, y: 20 }}
            market={market}
            equity={10_000}
            free={10_000}
            interval="15m"
            busy={false}
            onPreview={() => undefined}
            onPlace={onPlace}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
      await Promise.resolve()
    })

    const place = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.startsWith("Place")
    )
    await act(async () => place?.click())

    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          cascade: null,
          compound: true,
          entryLimit: null,
          rungEntry: "limit",
        }),
      })
    )
  })
})
