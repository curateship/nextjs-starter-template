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
