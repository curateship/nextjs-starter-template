// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FloatingOrderWindow } from "@/components/trade/floating-order-window"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1_000,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function renderWindow({
  openedAt = { x: 20, y: 20 },
  minimumHeight,
  chartPreviewControls = false,
  onClose = () => undefined,
}: {
  openedAt?: { x: number; y: number }
  minimumHeight?: number
  chartPreviewControls?: boolean
  onClose?: () => void
} = {}) {
  await act(async () => {
    root.render(
      <FloatingOrderWindow
        label="Order window"
        wide
        openedAt={openedAt}
        width={304}
        height={560}
        minimumHeight={minimumHeight}
        title="DCA ladder"
        wallet="Practice"
        free={1_234}
        chartPreviewControls={chartPreviewControls}
        onClose={onClose}
      >
        <div>Order fields</div>
      </FloatingOrderWindow>
    )
  })

  return document.querySelector<HTMLElement>('[role="dialog"]')
}

describe("the floating order window", () => {
  it("keeps its opening point on screen and says the wallet line consistently", async () => {
    const panel = await renderWindow({ openedAt: { x: 990, y: 790 } })

    expect(panel?.style.left).toBe("688px")
    expect(panel?.style.top).toBe("232px")
    expect(panel?.textContent).toContain("Practice· $1,234.00 free")
  })

  it("keeps every edge on screen while dragging a compact order window", async () => {
    const panel = await renderWindow()
    const grabBar = panel?.querySelector<HTMLElement>(".cursor-grab")

    await act(async () => {
      grabBar?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 30,
          clientY: 30,
        })
      )
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 2_000,
          clientY: 2_000,
        })
      )
    })

    expect(panel?.style.left).toBe("688px")
    expect(panel?.style.top).toBe("232px")

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: -200,
          clientY: -200,
        })
      )
    })

    expect(panel?.style.left).toBe("8px")
    expect(panel?.style.top).toBe("8px")
  })

  it("lets a long form shrink but never below its stated minimum height", async () => {
    const panel = await renderWindow({ minimumHeight: 260 })
    const grabBar = panel?.querySelector<HTMLElement>(".cursor-grab")

    await act(async () => {
      grabBar?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 30,
          clientY: 30,
        })
      )
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 30,
          clientY: 2_000,
        })
      )
    })

    expect(panel?.style.top).toBe("532px")
    expect(panel?.style.maxHeight).toBe("260px")
  })

  it("closes on Escape and a press outside", async () => {
    const onClose = vi.fn()
    const panel = await renderWindow({ onClose })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      panel?.previousElementSibling?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true })
      )
    })

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("lets a marked chart handle through without weakening other outside presses", async () => {
    const onClose = vi.fn()
    const panel = await renderWindow({
      openedAt: { x: 500, y: 20 },
      chartPreviewControls: true,
      onClose,
    })
    const handle = document.createElement("button")
    handle.dataset.orderFrameControl = "true"
    document.body.appendChild(handle)

    // Preview windows leave the price tags clear on the right of the click.
    expect(panel?.style.left).toBe("188px")

    await act(async () => {
      handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()

    const menu = document.createElement("button")
    menu.dataset.orderFrameControl = "true"
    document.body.appendChild(menu)
    await act(async () => {
      menu.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
      )
    })
    expect(onClose).toHaveBeenCalledOnce()
    handle.remove()
    menu.remove()
  })
})
