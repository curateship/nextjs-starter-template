// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { ChartPriceAction } from "@/components/trade/chart-price-action"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ChartSurface } from "@/components/trade/price-chart"

it("follows the cursor height beside the axis, opens there, and leaves with the cursor", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  host.dataset.slot = "chart-ready"
  document.body.append(host)
  const root = createRoot(host)
  const onOpen = vi.fn()
  const surface = {
    width: 400,
    height: 300,
    axisWidth: 60,
    priceAt: (y: number) => 300 - y,
  } as ChartSurface
  try {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <ChartPriceAction surface={surface} onOpen={onOpen} />
        </TooltipProvider>
      )
    )
    const move = async (y: number) =>
      act(async () => {
        host.dispatchEvent(
          new MouseEvent("pointermove", {
            bubbles: true,
            clientX: 50,
            clientY: y,
          })
        )
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
    await move(100)
    const button = host.querySelector<HTMLButtonElement>("button")!
    expect(button.style.top).toBe("100px")
    expect(button.style.left).toBe("376px")
    await move(150)
    expect(button.style.top).toBe("150px")
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      new DOMRect(376, 138, 24, 24)
    )
    await act(async () => button.click())
    expect(onOpen).toHaveBeenCalledWith({ clientX: 376, clientY: 150 })
    const bar = document.createElement("div")
    bar.setAttribute("data-chart-order-bar", "")
    host.append(bar)
    const bounds = vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(
      new DOMRect(250, 138, 146, 24)
    )
    await move(150)
    expect(host.querySelector("button")).toBeNull()
    // The shortcut's edge must clear the bar and its four-pixel buffer.
    await move(177)
    expect(host.querySelector("button")).toBeNull()
    await move(179)
    expect(host.querySelector("button")).not.toBeNull()
    await move(150)
    expect(host.querySelector("button")).toBeNull()
    // A bar moved left by the chart's label layout does not block the shortcut.
    bounds.mockReturnValue(new DOMRect(200, 138, 100, 24))
    await move(150)
    expect(host.querySelector("button")).not.toBeNull()
    bar.remove()
    await move(0)
    expect(host.querySelector("button")).toBeNull()
    await move(100)
    await act(async () => host.dispatchEvent(new MouseEvent("pointerleave")))
    expect(host.querySelector("button")).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
