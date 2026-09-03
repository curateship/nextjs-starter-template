// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PaintToolbar } from "@/components/trade/paint/paint-toolbar"
import { TooltipProvider } from "@/components/ui/tooltip"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

function rectangle(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => undefined,
  }
}

function pointer(type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
  })
  Object.defineProperty(event, "pointerId", { value: 1 })
  return event
}

beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function draw({
  savedPosition,
  onPositionChange,
}: {
  savedPosition?: { x: number; y: number } | null
  onPositionChange?: (position: { x: number; y: number } | null) => void
} = {}) {
  const render = (remembered = savedPosition) => (
    <TooltipProvider>
      <PaintToolbar
        tool={null}
        onPickTool={() => undefined}
        drawingCount={0}
        drawingsVisible
        rightInset={56}
        savedPosition={remembered}
        onPositionChange={onPositionChange}
        onClearAll={() => undefined}
      />
    </TooltipProvider>
  )
  await act(async () => {
    root.render(render(undefined))
  })
  const toolbar = host.querySelector<HTMLElement>("[data-chart-paint]")!
  const handle = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Move drawing tools"]'
  )!
  Object.defineProperty(toolbar, "offsetParent", { value: host })
  Object.assign(handle, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  })
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
    rectangle(0, 0, 300, 200)
  )
  const toolbarRect = vi
    .spyOn(toolbar, "getBoundingClientRect")
    .mockReturnValue(rectangle(156, 8, 80, 28))
  if (savedPosition !== undefined) {
    await act(async () => root.render(render({ ...savedPosition! })))
  }
  return { toolbar, handle, toolbarRect }
}

describe("the chart drawing toolbar", () => {
  it("starts horizontally with its move handle on the right", async () => {
    const { toolbar, handle } = await draw()

    expect(toolbar.dataset.position).toBe("top-right")
    expect(toolbar.style.right).toBe("64px")
    expect(toolbar.className).toContain("flex-row")
    expect(toolbar.className).not.toContain("flex-col")
    expect(toolbar.className).not.toContain("shadow")
    expect(toolbar.className).toContain("bg-card/45")
    expect(toolbar.className).toContain("backdrop-blur-md")
    expect(toolbar.className).toContain("backdrop-saturate-150")
    expect(handle.querySelector(".lucide-grip-vertical")).not.toBeNull()
    expect(handle.closest("[data-chart-paint]")).toBe(toolbar)
    expect(handle).toBe(toolbar.lastElementChild)
    expect(handle.closest('[data-slot="tooltip-trigger"]')).toBeNull()
  })

  it("moves inside the chart and snaps back to the top right", async () => {
    const onPositionChange = vi.fn()
    const { toolbar, handle, toolbarRect } = await draw({ onPositionChange })

    await act(async () => {
      handle.dispatchEvent(pointer("pointerdown", 220, 22))
      handle.dispatchEvent(pointer("pointermove", 100, 100))
      handle.dispatchEvent(pointer("pointerup", 100, 100))
    })
    expect(toolbar.dataset.position).toBe("free")
    expect(toolbar.style.left).toBe("36px")
    expect(toolbar.style.top).toBe("86px")
    expect(onPositionChange).toHaveBeenLastCalledWith({
      x: 28 / 148,
      y: 78 / 156,
    })

    toolbarRect.mockReturnValue(rectangle(36, 86, 80, 28))
    await act(async () => {
      handle.dispatchEvent(pointer("pointerdown", 100, 100))
      handle.dispatchEvent(pointer("pointermove", 220, 22))
    })
    const snapTarget = host.querySelector<HTMLElement>(
      "[data-chart-paint-snap-target]"
    )
    expect(snapTarget?.dataset.ready).toBe("true")
    expect(snapTarget?.style.top).toBe("8px")
    expect(snapTarget?.style.right).toBe("64px")
    expect(snapTarget?.style.width).toBe("80px")
    expect(snapTarget?.style.height).toBe("28px")
    expect(toolbar.className).toContain("ring-2")

    await act(async () => {
      handle.dispatchEvent(pointer("pointerup", 220, 22))
    })
    expect(toolbar.dataset.position).toBe("top-right")
    expect(toolbar.style.left).toBe("")
    expect(toolbar.style.right).toBe("64px")
    expect(onPositionChange).toHaveBeenLastCalledWith(null)
    expect(host.querySelector("[data-chart-paint-snap-target]")).toBeNull()
  })

  it("restores a saved place against the current chart size", async () => {
    const { toolbar } = await draw({ savedPosition: { x: 0.25, y: 0.5 } })

    expect(toolbar.dataset.position).toBe("free")
    expect(toolbar.style.left).toBe("calc(25% - 10px)")
    expect(toolbar.style.top).toBe("calc(50% + 0px)")
    expect(toolbar.style.transform).toBe("translate(-25%, -50%)")
  })

  it("returns to the saved place when a drag is cancelled", async () => {
    const onPositionChange = vi.fn()
    const { toolbar, handle } = await draw({ onPositionChange })

    await act(async () => {
      handle.dispatchEvent(pointer("pointerdown", 220, 22))
      handle.dispatchEvent(pointer("pointermove", 100, 100))
    })
    expect(toolbar.dataset.position).toBe("free")

    await act(async () => {
      handle.dispatchEvent(pointer("pointercancel", 100, 100))
    })
    expect(toolbar.dataset.position).toBe("top-right")
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it("lets the keyboard move the toolbar and Home return it", async () => {
    const onPositionChange = vi.fn()
    const { toolbar, handle } = await draw({ onPositionChange })

    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
      )
    })
    expect(toolbar.dataset.position).toBe("free")
    expect(toolbar.style.left).toBe("148px")
    expect(onPositionChange).toHaveBeenLastCalledWith({
      x: 140 / 148,
      y: 0,
    })

    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      )
    })
    expect(toolbar.dataset.position).toBe("top-right")
    expect(onPositionChange).toHaveBeenLastCalledWith(null)
  })
})
