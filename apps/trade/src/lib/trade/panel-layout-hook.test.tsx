// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { GroupImperativeHandle, Layout } from "react-resizable-panels"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useRememberedPanelLayoutInPlace } from "@/lib/trade/panel-layout"

const panels = ["markets", "chart", "smart-orders"] as const
const first = { markets: 20, chart: 58, "smart-orders": 22 }
const named = { markets: 10, chart: 80, "smart-orders": 10 }

let host: HTMLDivElement
let root: Root
let control: ReturnType<typeof useRememberedPanelLayoutInPlace>
let mounts: number
let saved: ReturnType<typeof vi.fn<(layout: Layout) => void>>

function Harness({
  layout,
  onReady,
}: {
  layout: Layout
  onReady: (value: typeof control) => void
}) {
  const value = useRememberedPanelLayoutInPlace(panels, layout, saved)
  React.useLayoutEffect(() => onReady(value), [onReady, value])
  React.useEffect(() => {
    mounts += 1
  }, [])
  return null
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  mounts = 0
  saved = vi.fn()
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe("the in-place trade panel layout", () => {
  it("applies opening, named and temporary layouts to one mounted group", async () => {
    let current: Layout = { markets: 15, chart: 70, "smart-orders": 15 }
    const handle: GroupImperativeHandle = {
      getLayout: () => current,
      setLayout: (layout) => {
        // The real group can adjust a requested layout to its constraints. Its
        // callback fires while setLayout is running, which must still count as
        // this programmatic change rather than a divider drag to save.
        current = { ...layout }
        control.onLayoutChanged(current, { isUserInteraction: false })
        return current
      },
    }

    const onReady = (value: typeof control) => {
      control = value
    }
    await act(async () =>
      root.render(<Harness layout={first} onReady={onReady} />)
    )
    act(() => {
      control.groupRef(handle)
      control.onLayoutChanged(current, { isUserInteraction: false })
    })
    expect(current).toEqual(first)
    expect(saved).not.toHaveBeenCalled()

    act(() => {
      control.setLayout({ markets: 0, chart: 100, "smart-orders": 0 })
    })
    expect(saved).not.toHaveBeenCalled()

    await act(async () =>
      root.render(<Harness layout={named} onReady={onReady} />)
    )
    expect(current).toEqual(named)
    expect(mounts).toBe(1)
    expect(saved).not.toHaveBeenCalled()

    act(() => {
      control.onLayoutChanged(
        { markets: 25, chart: 50, "smart-orders": 25 },
        { isUserInteraction: true }
      )
    })
    expect(saved).toHaveBeenCalledWith({
      markets: 25,
      chart: 50,
      "smart-orders": 25,
    })

    act(() => {
      control.rememberLayout({ markets: 30, chart: 40, "smart-orders": 30 })
    })
    expect(saved).toHaveBeenLastCalledWith({
      markets: 30,
      chart: 40,
      "smart-orders": 30,
    })
  })
})
