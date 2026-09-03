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
  onMove = vi.fn<
    (id: string, shape: DrawingShape, currentPrice: number | null) => void
  >(),
  onSetAlert,
}: {
  tool: "level" | "trendline" | null
  drawings?: Drawing[]
  selectedId?: string | null
  watchLiveBars?: (onBar: (bar: (typeof candles)[number]) => void) => () => void
  onCreate?: (shape: DrawingShape) => void
  onMove?: (id: string, shape: DrawingShape, currentPrice: number | null) => void
  onSetAlert?: (id: string, on: boolean, currentPrice: number | null) => void
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
        onSetAlert={onSetAlert}
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
      alert: null,
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
    expect(onMove).toHaveBeenCalledWith(
      "line-1",
      {
        kind: "trendline",
        from: { time: 1_500, price: 80 },
        to: { time: 1_200, price: 90 },
      },
      // The last closed candle's price goes with the move.
      105
    )
  })
})

describe("the alert a trendline carries", () => {
  const line: Drawing = {
    id: "line-1",
    shape: {
      kind: "trendline",
      from: { time: 1_000, price: 100 },
      to: { time: 1_400, price: 120 },
    },
    alert: null,
  }

  function cog() {
    return host.querySelector<SVGGElement>('[aria-label="Alert on trendline from $100 to $120"]')
  }

  it("shows a cog beside the x only on a watched chart's trendline", async () => {
    await draw({ tool: null, drawings: [line], selectedId: line.id })
    expect(cog()).toBeNull()
    expect(
      host.querySelector('[aria-label="Delete trendline from $100 to $120"]')
    ).not.toBeNull()

    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
    })
    expect(cog()).not.toBeNull()
    // The x sits left of the cog, a button's width apart, never on top of it.
    const circles = Array.from(host.querySelectorAll('[role="button"] > circle'))
    const [xAt, cogAt] = circles.map((circle) => Number(circle.getAttribute("cx")))
    expect(cogAt - xAt).toBe(22)

  })

  it("gives a level the same cog and window, with no extend switch", async () => {
    const level: Drawing = {
      id: "level-1",
      shape: { kind: "level", price: 100 },
      alert: null,
    }
    const onSetAlert = vi.fn()
    await draw({
      tool: null,
      drawings: [level],
      selectedId: level.id,
      onSetAlert,
    })
    const levelCog = host.querySelector<SVGGElement>('[aria-label="Alert on level at $100"]')
    expect(levelCog).not.toBeNull()
    // Over the middle of the chart, where the x already sits for a level.
    const circles = Array.from(host.querySelectorAll('[role="button"] > circle'))
    expect(circles.map((circle) => Number(circle.getAttribute("cx")))).toEqual([89, 111])

    await act(async () => {
      levelCog!.dispatchEvent(pointer("pointerdown", 0, 0))
    })
    expect(document.body.textContent).toContain("The level is at $100 right now.")
    expect(document.getElementById("line-extend-level-1")).toBeNull()
    await act(async () => {
      document.getElementById("line-alert-level-1")!.click()
    })
    expect(onSetAlert).toHaveBeenCalledWith("level-1", true, 105)
  })

  it("draws a dashed extension to the right edge on the same slope, out of the pointer's reach", async () => {
    const extended: Drawing = {
      ...line,
      shape: {
        kind: "trendline",
        from: { time: 1_000, price: 100 },
        to: { time: 1_400, price: 120 },
        extendRight: true,
      },
    }
    await draw({ tool: null, drawings: [line], selectedId: null })
    expect(host.querySelector("[data-line-extension]")).toBeNull()

    await draw({ tool: null, drawings: [extended], selectedId: null })
    const extension = host.querySelector<SVGLineElement>("[data-line-extension]")!
    expect(extension).not.toBeNull()
    // From the later end (time 1,400, $120) to the right edge (time 2,000,
    // where the slope of $20 per 400 puts the line at $150).
    expect(
      ["x1", "y1", "x2", "y2"].map((name) => Number(extension.getAttribute(name)))
    ).toEqual([140, 80, 200, 50])
    expect(extension.getAttribute("stroke-dasharray")).toBe("4 4")
    expect(extension.style.pointerEvents).toBe("none")
    expect(extension.getAttribute("aria-hidden")).toBe("true")
  })

  it("saves the extend switch as a move of the same line", async () => {
    const onMove = vi.fn()
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
      onMove,
    })
    await act(async () => {
      cog()!.dispatchEvent(pointer("pointerdown", 0, 0))
    })
    const extend = document.getElementById("line-extend-line-1")!
    expect(extend.getAttribute("aria-checked")).toBe("false")
    await act(async () => {
      extend.click()
    })
    expect(onMove).toHaveBeenCalledWith(
      "line-1",
      {
        kind: "trendline",
        from: { time: 1_000, price: 100 },
        to: { time: 1_400, price: 120 },
        extendRight: true,
      },
      105
    )
  })

  it("opens the alert window from the cog and switches the alert on from the live price", async () => {
    const onSetAlert = vi.fn()
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert,
    })
    await act(async () => {
      cog()!.dispatchEvent(pointer("pointerdown", 0, 0))
    })

    const toggle = document.getElementById("line-alert-line-1")
    expect(toggle).not.toBeNull()
    expect(toggle?.getAttribute("aria-checked")).toBe("false")
    expect(document.body.textContent).toContain("The line is at $")

    await act(async () => {
      toggle!.click()
    })
    // On, from the last closed candle's price of $105.
    expect(onSetAlert).toHaveBeenCalledWith("line-1", true, 105)
  })

  it("opens the same window on a double-click of the line, and reads an armed alert", async () => {
    const armed: Drawing = {
      ...line,
      alert: { direction: "above", armedAt: 1, firedAt: null },
    }
    await draw({
      tool: null,
      drawings: [armed],
      selectedId: armed.id,
      onSetAlert: vi.fn(),
    })
    const body = Array.from(host.querySelectorAll("line")).find(
      (candidate) => candidate.getAttribute("tabindex") === "0"
    )!
    await act(async () => {
      body.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })

    const toggle = document.getElementById("line-alert-line-1")
    expect(toggle?.getAttribute("aria-checked")).toBe("true")
    expect(document.body.textContent).toContain("Rings once when the price crosses up through the line")
  })

  it("says when a fired alert went off", async () => {
    const fired: Drawing = {
      ...line,
      alert: { direction: "above", armedAt: 1, firedAt: Date.UTC(2026, 8, 3, 12) },
    }
    await draw({
      tool: null,
      drawings: [fired],
      selectedId: fired.id,
      onSetAlert: vi.fn(),
    })
    await act(async () => {
      cog()!.dispatchEvent(pointer("pointerdown", 0, 0))
    })
    const toggle = document.getElementById("line-alert-line-1")
    expect(toggle?.getAttribute("aria-checked")).toBe("false")
    expect(document.body.textContent).toContain("Fired ")
  })
})
