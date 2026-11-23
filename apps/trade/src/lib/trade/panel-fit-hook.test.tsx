// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePanelFit } from "@/lib/trade/panel-fit"

let host: HTMLDivElement
let root: Root
let control: ReturnType<typeof usePanelFit>
let save: ReturnType<
  typeof vi.fn<(layout: Layout, meta: { isUserInteraction: boolean }) => void>
>

function Harness({ panel }: { panel: PanelImperativeHandle }) {
  const panelRef = React.useRef(panel)
  const value = usePanelFit(panelRef, save)
  React.useLayoutEffect(() => {
    control = value
  }, [value])
  return null
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  save = vi.fn()
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe("the bottom panel fit control", () => {
  it("remembers opening a collapsed panel as the person's tab press", async () => {
    const opened = { workspace: 72, activity: 28 }
    const panel = {
      isCollapsed: () => true,
      expand: () => {
        control.onLayoutChanged(opened, { isUserInteraction: false })
      },
    } as PanelImperativeHandle

    await act(async () => root.render(<Harness panel={panel} />))
    act(() => control.grow(200))

    expect(save).toHaveBeenCalledWith(opened, { isUserInteraction: true })
  })
})
