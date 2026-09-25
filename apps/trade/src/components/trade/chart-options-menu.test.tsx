// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  DEFAULT_CHART_OPTIONS,
  type ChartOptions,
} from "@/lib/trade/chart-options"

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
  vi.restoreAllMocks()
})

describe("the chart type choice", () => {
  it("offers candles, line and Heikin-Ashi and applies the choice at once", async () => {
    const replace = vi.fn()

    function Menu() {
      const [options, setOptions] = React.useState(DEFAULT_CHART_OPTIONS)
      const control = {
        options,
        replace: (next: ChartOptions) => {
          replace(next)
          setOptions(next)
        },
      } as ChartOptionsControl
      return (
        <TooltipProvider>
          <ChartOptionsMenu control={control} />
        </TooltipProvider>
      )
    }

    await act(async () => root.render(<Menu />))
    await act(async () => {
      const trigger = host.querySelector<HTMLElement>(
        'button[aria-label="View options"]'
      )
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const type = document.body.querySelector<HTMLElement>("#chart-option-type")
    expect(type?.getAttribute("role")).toBe("combobox")
    await act(async () => {
      type?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
      type?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    const choices = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role=option]")
    )
    expect(choices.map((choice) => choice.textContent?.trim())).toEqual([
      "Candles",
      "Line",
      "Heikin-Ashi",
    ])

    await act(async () => choices[1]?.click())
    expect(replace).toHaveBeenLastCalledWith({
      ...DEFAULT_CHART_OPTIONS,
      chartType: "line",
    })
    expect(type?.textContent).toContain("Line")
  })
})
