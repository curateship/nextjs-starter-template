// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PaintLayer } from "@/components/trade/paint/paint-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { Drawing, DrawingShape } from "@/lib/trade/drawings"

const candles = [
  { openTime: 1_000, open: 90, high: 101, low: 80, close: 95, volume: 1 },
  { openTime: 1_500, open: 100, high: 111, low: 80, close: 105, volume: 1 },
]

const surface: ChartSurface = {
  width: 200,
  height: 200,
  axisWidth: 0,
  xOf: (time) => time / 10,
  xOfContainingBar: (time) => time / 10,
  timeAt: (x) => x * 10,
  barAt: (time) => time / 500,
  yOf: (price) => 200 - price,
  priceAt: (y) => 200 - y,
}

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

function pointer(
  type: string,
  clientX: number,
  clientY: number,
  options: { altKey?: boolean; pointerType?: string } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
    altKey: options.altKey,
  })
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
    isPrimary: { value: true },
  })
  return event
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  vi.useRealTimers()
  await act(async () => root.unmount())
  host.remove()
})

async function draw({
  tool,
  drawings = [],
  selectedId = null,
  watchLiveBars,
  onCreate = vi.fn<(shape: DrawingShape) => void>(),
  onMove = vi.fn<(id: string, shape: DrawingShape) => void>(),
}: {
  tool: "level" | "trendline" | null
  drawings?: Drawing[]
  selectedId?: string | null
  watchLiveBars?: (onBar: (bar: (typeof candles)[number]) => void) => () => void
  onCreate?: (shape: DrawingShape) => void
  onMove?: (id: string, shape: DrawingShape) => void
}) {
  await act(async () => {
    root.render(
      <PaintLayer
        surface={surface}
        candles={candles}
        watchLiveBars={watchLiveBars}
        drawings={drawings}
        tool={tool}
        selectedId={selectedId}
        onSelect={() => undefined}
        onCreate={onCreate}
        onMove={onMove}
        onDelete={() => undefined}
      />
    )
  })
  const svg = host.querySelector("svg")!
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
    rectangle(0, 0, 200, 200)
  )
  return { svg, onCreate, onMove }
}

function preparePointerTarget(element: Element) {
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  })
}

describe("the chart paint layer", () => {
  it("snaps both trendline ends to candle highs and shows the active tip", async () => {
    const onCreate = vi.fn()
    const { svg } = await draw({ tool: "trendline", onCreate })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)

    await act(async () => {
      sheet.dispatchEvent(pointer("pointerdown", 103, 104))
    })
    await act(async () => {
      sheet.dispatchEvent(pointer("pointermove", 148, 94))
    })

    const dot = svg.querySelector<SVGCircleElement>("[data-wick-snap]")
    expect(dot?.getAttribute("cx")).toBe("150")
    expect(dot?.getAttribute("cy")).toBe("89")

    await act(async () => {
      sheet.dispatchEvent(pointer("pointerup", 148, 94))
    })
    expect(onCreate).toHaveBeenCalledWith({
      kind: "trendline",
      from: { time: 1_000, price: 101 },
      to: { time: 1_500, price: 111 },
    })
    expect(svg.querySelector("[data-wick-snap]")).toBeNull()
  })

  it("draws exactly under the pointer while Alt is held", async () => {
    const onCreate = vi.fn()
    const { svg } = await draw({ tool: "level", onCreate })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }))
    })
    await act(async () => {
      sheet.dispatchEvent(pointer("pointermove", 103, 104))
    })
    expect(svg.querySelector("[data-wick-snap]")).toBeNull()

    await act(async () => {
      sheet.dispatchEvent(pointer("pointerup", 103, 104))
    })
    expect(onCreate).toHaveBeenCalledWith({ kind: "level", price: 96 })
  })

  it("snaps a level to a candle wick", async () => {
    const onCreate = vi.fn()
    const { svg } = await draw({ tool: "level", onCreate })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)

    await act(async () => {
      sheet.dispatchEvent(pointer("pointermove", 103, 104))
      sheet.dispatchEvent(pointer("pointerup", 103, 104))
    })
    expect(onCreate).toHaveBeenCalledWith({ kind: "level", price: 101 })
  })

  it("snaps to the working candle's latest wick", async () => {
    const onCreate = vi.fn()
    const { svg } = await draw({
      tool: "level",
      onCreate,
      watchLiveBars: (onBar) => {
        onBar({ ...candles[1], high: 115 })
        return () => undefined
      },
    })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)

    await act(async () => {
      sheet.dispatchEvent(pointer("pointermove", 150, 88))
      sheet.dispatchEvent(pointer("pointerup", 150, 88))
    })
    expect(onCreate).toHaveBeenCalledWith({ kind: "level", price: 115 })
  })

  it("ignores an older live bar that the chart would reject", async () => {
    const onCreate = vi.fn()
    const { svg } = await draw({
      tool: "level",
      onCreate,
      watchLiveBars: (onBar) => {
        onBar({ ...candles[0], high: 110 })
        return () => undefined
      },
    })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)

    await act(async () => {
      sheet.dispatchEvent(pointer("pointermove", 105, 94))
      sheet.dispatchEvent(pointer("pointerup", 105, 94))
    })
    expect(onCreate).toHaveBeenCalledWith({ kind: "level", price: 101 })
  })

  it("uses a half-second touch hold to skip snapping for the whole trendline", async () => {
    vi.useFakeTimers()
    const onCreate = vi.fn()
    const { svg } = await draw({ tool: "trendline", onCreate })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)

    await act(async () => {
      sheet.dispatchEvent(
        pointer("pointermove", 103, 104, { pointerType: "touch" })
      )
      sheet.dispatchEvent(
        pointer("pointerdown", 103, 104, { pointerType: "touch" })
      )
    })
    expect(svg.querySelector("[data-wick-snap]")).not.toBeNull()

    await act(async () => vi.advanceTimersByTime(500))
    expect(svg.querySelector("[data-wick-snap]")).toBeNull()

    await act(async () => {
      sheet.dispatchEvent(
        pointer("pointerup", 103, 104, { pointerType: "touch" })
      )
    })
    await act(async () => {
      sheet.dispatchEvent(
        pointer("pointermove", 148, 94, { pointerType: "touch" })
      )
      sheet.dispatchEvent(
        pointer("pointerdown", 148, 94, { pointerType: "touch" })
      )
    })
    expect(onCreate).toHaveBeenCalledWith({
      kind: "trendline",
      from: { time: 1_030, price: 96 },
      to: { time: 1_480, price: 106 },
    })
  })

  it("snaps a dragged trendline end to a wick tip", async () => {
    const onMove = vi.fn()
    const drawing: Drawing = {
      id: "line-1",
      shape: {
        kind: "trendline",
        from: { time: 1_000, price: 101 },
        to: { time: 1_200, price: 90 },
      },
    }
    const { svg } = await draw({
      tool: null,
      drawings: [drawing],
      selectedId: drawing.id,
      onMove,
    })
    const handle = Array.from(svg.querySelectorAll("circle")).find(
      (circle) => circle.style.cursor === "grab"
    )!
    preparePointerTarget(handle)

    await act(async () => {
      handle.dispatchEvent(pointer("pointerdown", 100, 99))
    })
    await act(async () => {
      handle.dispatchEvent(pointer("pointermove", 147, 116))
    })
    expect(svg.querySelector("[data-wick-snap]")).not.toBeNull()

    await act(async () => {
      handle.dispatchEvent(pointer("pointerup", 147, 116))
    })
    expect(onMove).toHaveBeenCalledWith("line-1", {
      kind: "trendline",
      from: { time: 1_500, price: 80 },
      to: { time: 1_200, price: 90 },
    })
  })
})
