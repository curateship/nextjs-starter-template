// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  type ClientPoint,
  useLongPress,
} from "@/components/trade/use-long-press"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function pointer(type: string, at: ClientPoint, pointerType = "touch"): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
    clientX: { value: at.clientX },
    clientY: { value: at.clientY },
  })
  return event
}

async function draw(onLongPress: (point: ClientPoint) => void) {
  const host = document.createElement("div")
  const root = createRoot(host)
  function Subject() {
    const press = useLongPress(onLongPress)
    return <div data-chart {...press} />
  }
  await act(async () => root.render(<Subject />))
  return { chart: host.firstElementChild as HTMLElement, root }
}

afterEach(() => vi.useRealTimers())

describe("a long press on the chart", () => {
  it("opens at the finger after half a second", async () => {
    vi.useFakeTimers()
    const opened: ClientPoint[] = []
    const { chart, root } = await draw((point) => opened.push(point))

    chart.dispatchEvent(pointer("pointerdown", { clientX: 40, clientY: 70 }))
    await act(async () => vi.advanceTimersByTime(500))

    expect(opened).toEqual([{ clientX: 40, clientY: 70 }])
    await act(async () => root.unmount())
  })

  it("leaves a moving finger to pan the chart", async () => {
    vi.useFakeTimers()
    const opened: ClientPoint[] = []
    const { chart, root } = await draw((point) => opened.push(point))

    chart.dispatchEvent(pointer("pointerdown", { clientX: 40, clientY: 70 }))
    window.dispatchEvent(pointer("pointermove", { clientX: 49, clientY: 70 }))
    await act(async () => vi.advanceTimersByTime(500))

    expect(opened).toEqual([])
    await act(async () => root.unmount())
  })

  it("ignores a mouse press", async () => {
    vi.useFakeTimers()
    const opened: ClientPoint[] = []
    const { chart, root } = await draw((point) => opened.push(point))

    chart.dispatchEvent(
      pointer("pointerdown", { clientX: 40, clientY: 70 }, "mouse")
    )
    await act(async () => vi.advanceTimersByTime(500))

    expect(opened).toEqual([])
    await act(async () => root.unmount())
  })
})
