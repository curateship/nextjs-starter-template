// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartToolsMenu } from "@/components/trade/chart-tools-menu"
import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
import type { ChartIndicators } from "@/components/trade/use-indicators"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as { hasPointerCapture?: unknown })
    .hasPointerCapture
  delete (HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture
  delete (HTMLElement.prototype as { releasePointerCapture?: unknown })
    .releasePointerCapture
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe("the chart tools menu", () => {
  it("puts the three labeled chart choices behind the vertical-dot button", async () => {
    const indicators: ChartIndicators = {
      settings: defaultIndicatorSettings(),
      toggle: vi.fn(),
      setParam: vi.fn(),
      reset: vi.fn(),
      setOpen: vi.fn(),
      setCardOpen: vi.fn(),
      replace: vi.fn(),
    }
    const chartOptions: ChartOptionsControl = {
      options: DEFAULT_CHART_OPTIONS,
      setOption: vi.fn(),
      setZone: vi.fn(),
      setOrderArrowTrades: vi.fn(),
      replace: vi.fn(),
    }

    await act(async () => {
      root.render(
        <TooltipProvider>
          <ChartToolsMenu
            indicators={indicators}
            indicatorContext={{ zone: "UTC", interval: "4h" }}
            chartOptions={chartOptions}
            layouts={{
              rows: [],
              activeId: null,
              onCreate: vi.fn(),
              onApply: vi.fn(),
              onDelete: vi.fn(),
            }}
          />
        </TooltipProvider>
      )
    })

    await act(async () => button("Chart menu").click())
    const menuContent = document.body.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(menuContent).not.toBeNull()
    expect(button("Indicators, 0").textContent).toContain("Indicators0")
    expect(button("View options").textContent).toContain("View options")
    expect(button("Saved layouts").textContent).toContain("Saved layouts")

    await act(async () => button("Indicators, 0").click())
    expect(document.body.textContent).toContain("0 of 3 on")

    await act(async () => button("View options").click())
    expect(document.body.textContent).toContain("Chart type")

    await act(async () => button("Saved layouts").click())
    expect(document.body.textContent).toContain("No saved layouts yet.")
  })
})

function button(name: string) {
  const found = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`
  )
  if (!found) throw new Error(`Missing ${name}`)
  return found
}
