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
  wide = true,
  lineAlertsPaused = false,
  onCreate = vi.fn<(shape: DrawingShape) => void>(),
  onMove = vi.fn<
    (id: string, shape: DrawingShape, currentPrice: number | null) => void
  >(),
  onSetAlert,
  onSetBuffer,
  extendNewLines,
  onExtendPreference,
}: {
  tool: "level" | "trendline" | null
  drawings?: Drawing[]
  selectedId?: string | null
  watchLiveBars?: (onBar: (bar: (typeof candles)[number]) => void) => () => void
  wide?: boolean
  lineAlertsPaused?: boolean
  onCreate?: (shape: DrawingShape) => void
  onMove?: (id: string, shape: DrawingShape, currentPrice: number | null) => void
  onSetAlert?: (id: string, on: boolean, currentPrice: number | null) => void
  onSetBuffer?: (id: string, buffer: number | null) => void
  extendNewLines?: boolean
  onExtendPreference?: (on: boolean) => void
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
        onSetBuffer={onSetBuffer}
        wide={wide}
        lineAlertsPaused={lineAlertsPaused}
        extendNewLines={extendNewLines}
        onExtendPreference={onExtendPreference}
      />
    )
  })
  const svg = host.querySelector("svg")!
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
    rectangle(0, 0, 200, 200)
  )
  return { svg, onCreate, onMove }
}

/**
 * Types into a controlled input the way a person does. Setting `value`
 * straight leaves React's own tracker thinking nothing changed, so the
 * change never reaches the component.
 */
function typeInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
  setter?.call(field, value)
  field.dispatchEvent(new Event("input", { bubbles: true }))
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
      extendRight: true,
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
      extendRight: true,
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
    // The two stack under the line's right-hand end, the cog above the x,
    // rather than sitting side by side across its middle.
    expect(chips()).toEqual([
      [129, 102],
      [129, 122],
    ])
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
    // A level runs the whole width, so its end is the right edge of the plot.
    expect(chips()).toEqual([
      [188, 122],
      [188, 142],
    ])

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

  it("saves the extend switch as a move of the same line, and remembers the flip", async () => {
    const onMove = vi.fn()
    const onExtendPreference = vi.fn()
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
      onMove,
      onExtendPreference,
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
    expect(onExtendPreference).toHaveBeenCalledWith(true)
  })

  it("draws a plain trendline once the switch was last left off", async () => {
    const onCreate = vi.fn()
    const { svg } = await draw({
      tool: "trendline",
      onCreate,
      extendNewLines: false,
    })
    const sheet = svg.querySelector("rect")!
    preparePointerTarget(sheet)
    await act(async () => {
      sheet.dispatchEvent(pointer("pointerdown", 103, 104))
    })
    await act(async () => {
      sheet.dispatchEvent(pointer("pointerup", 148, 94))
    })
    expect(onCreate).toHaveBeenCalledWith({
      kind: "trendline",
      from: { time: 1_000, price: 101 },
      to: { time: 1_500, price: 111 },
    })
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty("extendRight")
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

  it("stays open when the press moves the keyboard onto the cog", async () => {
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
    })
    await act(async () => {
      cog()!.dispatchEvent(pointer("pointerdown", 0, 0))
    })
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()

    // What a real browser does next, as the press's own doing. The window
    // used to read it as somebody working elsewhere and shut itself.
    await act(async () => {
      cog()!.focus()
      cog()!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    })
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()
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
    expect(document.body.textContent).toContain("Fires once when the price crosses up through the line")
  })

  it("says when a fired alert went off and at what price", async () => {
    const fired: Drawing = {
      ...line,
      alert: {
        direction: "above",
        armedAt: 1,
        firedAt: Date.now() - 3 * 60 * 60 * 1_000,
        firedPrice: 61_200,
      },
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
    expect(document.body.textContent).toContain("Fired 3 hours ago at $61,200")
  })
})

/** Where each round chip sits, in the order they are drawn. */
function chips(selector = '[role="button"] > circle') {
  return Array.from(host.querySelectorAll(selector)).map((circle) => [
    Number(circle.getAttribute("cx")),
    Number(circle.getAttribute("cy")),
  ])
}

/** The one line every way-in test opens. */
function lineBody() {
  return Array.from(host.querySelectorAll("line")).find(
    (candidate) => candidate.getAttribute("tabindex") === "0"
  )!
}

describe("the ways into a line's window without a mouse", () => {
  const line: Drawing = {
    id: "line-1",
    shape: {
      kind: "trendline",
      from: { time: 1_000, price: 100 },
      to: { time: 1_400, price: 120 },
    },
    alert: null,
  }

  it("opens the window with Enter on the line the Tab key is on, and Escape puts the keyboard back on it", async () => {
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
    })
    const body = lineBody()
    body.focus()

    await act(async () => {
      body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    expect(document.getElementById("line-alert-line-1")).toBeNull()
    expect(document.activeElement).toBe(body)
  })

  it("opens the same window with Space", async () => {
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
    })
    await act(async () => {
      lineBody().dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true })
      )
    })
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()
  })

  it("leaves Enter alone on a chart whose lines are not watched", async () => {
    await draw({ tool: null, drawings: [line], selectedId: line.id })
    await act(async () => {
      lineBody().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(document.getElementById("line-alert-line-1")).toBeNull()
  })

  it("opens the window on a half-second touch on the line, and never starts the chart's own hold", async () => {
    vi.useFakeTimers()
    const onMove = vi.fn()
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
      onMove,
    })
    const body = lineBody()
    preparePointerTarget(body)
    // The chart's own half-second hold listens further up the page. The
    // press must not reach it, or one finger opens two things.
    const reachedChart = vi.fn()
    document.addEventListener("pointerdown", reachedChart)

    await act(async () => {
      body.dispatchEvent(pointer("pointerdown", 120, 90, { pointerType: "touch" }))
    })
    expect(reachedChart).not.toHaveBeenCalled()
    expect(document.getElementById("line-alert-line-1")).toBeNull()

    await act(async () => vi.advanceTimersByTime(500))
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()

    // The press that opened the window is not also a move of the line.
    await act(async () => {
      body.dispatchEvent(pointer("pointerup", 120, 90, { pointerType: "touch" }))
    })
    expect(onMove).not.toHaveBeenCalled()
    document.removeEventListener("pointerdown", reachedChart)
  })

  it("a moving finger drags the line instead of opening the window", async () => {
    vi.useFakeTimers()
    const onMove = vi.fn()
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
      onMove,
    })
    const body = lineBody()
    preparePointerTarget(body)

    await act(async () => {
      body.dispatchEvent(pointer("pointerdown", 120, 90, { pointerType: "touch" }))
    })
    await act(async () => {
      body.dispatchEvent(pointer("pointermove", 150, 90, { pointerType: "touch" }))
    })
    await act(async () => vi.advanceTimersByTime(500))
    expect(document.getElementById("line-alert-line-1")).toBeNull()

    await act(async () => {
      body.dispatchEvent(pointer("pointerup", 150, 90, { pointerType: "touch" }))
    })
    expect(onMove).toHaveBeenCalledOnce()
  })

  it("opens in the bottom sheet below the 1280-pixel layout", async () => {
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
      wide: false,
    })
    await act(async () => {
      lineBody().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })
    expect(document.querySelector("[data-line-alert-sheet]")).not.toBeNull()
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull()
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()
  })
})

describe("the marks a line's alert leaves on the chart", () => {
  const armed: Drawing = {
    id: "line-1",
    shape: {
      kind: "trendline",
      from: { time: 1_000, price: 100 },
      to: { time: 1_400, price: 120 },
    },
    alert: { direction: "above", armedAt: 1, firedAt: null },
  }

  it("stacks the bell, the cog and the x in one column under the line's end", async () => {
    await draw({
      tool: null,
      drawings: [armed],
      selectedId: armed.id,
      onSetAlert: vi.fn(),
    })
    // The line ends at (140, 80). The bell is nearest it, then the cog, then
    // the x, twenty pixels apart down one column.
    expect(chips("[data-line-bell] > circle")).toEqual([[129, 102]])
    expect(chips()).toEqual([
      [129, 122],
      [129, 142],
    ])
    // Every chip is the same size, the bell's included.
    const radii = Array.from(host.querySelectorAll("circle"))
      .filter((circle) => circle.getAttribute("r") === "9")
      .map((circle) => circle.getAttribute("r"))
    expect(radii).toEqual(["9", "9", "9"])
  })

  it("keeps the cog and the x where they were when the bell arrives", async () => {
    const plain: Drawing = { ...armed, alert: null }
    await draw({
      tool: null,
      drawings: [plain],
      selectedId: plain.id,
      onSetAlert: vi.fn(),
    })
    // Slot one belongs to the bell whether or not there is one, so switching
    // an alert on never slides the buttons out from under the pointer.
    expect(chips()).toEqual([
      [129, 102],
      [129, 122],
    ])
  })

  it("stacks upwards when the line lies too near the bottom of the plot", async () => {
    const low: Drawing = {
      id: "line-low",
      shape: { kind: "level", price: 5 },
      alert: null,
    }
    await draw({
      tool: null,
      drawings: [low],
      selectedId: low.id,
      onSetAlert: vi.fn(),
    })
    // The level sits at y 195, so a column running down would fall off.
    expect(chips()).toEqual([
      [188, 173],
      [188, 153],
    ])
  })

  it("draws a bell on every armed line, picked out or not, and none on a plain one", async () => {
    const plain: Drawing = { ...armed, id: "line-2", alert: null }
    await draw({ tool: null, drawings: [armed, plain], selectedId: null })
    expect(host.querySelectorAll("[data-line-bell]")).toHaveLength(1)
    const bell = host.querySelector("[data-line-bell]")!
    expect(bell.getAttribute("aria-hidden")).toBe("true")
  })

  it("draws no bell once the alert has fired, and a dot where it fired instead", async () => {
    const fired: Drawing = {
      ...armed,
      alert: {
        direction: "above",
        armedAt: 1,
        firedAt: 1_200,
        firedPrice: 110,
      },
    }
    await draw({ tool: null, drawings: [fired], selectedId: null })
    expect(host.querySelector("[data-line-bell]")).toBeNull()
    const dot = host.querySelector<SVGCircleElement>("[data-line-fired]")!
    // Time 1,200 is x 120, and $110 is y 90.
    expect([dot.getAttribute("cx"), dot.getAttribute("cy")]).toEqual(["120", "90"])
    expect(dot.style.pointerEvents).toBe("none")
  })

  it("leaves no dot for a fire from before the fire point was kept", async () => {
    const older: Drawing = {
      ...armed,
      alert: { direction: "above", armedAt: 1, firedAt: 1_200 },
    }
    await draw({ tool: null, drawings: [older], selectedId: null })
    expect(host.querySelector("[data-line-fired]")).toBeNull()
  })
})

describe("a line with a description", () => {
  const named: Drawing = {
    id: "line-1",
    shape: {
      kind: "trendline",
      from: { time: 1_000, price: 100 },
      to: { time: 1_400, price: 120 },
      name: "4h base",
    },
    alert: null,
  }

  it("draws the name at the line's start and tells a screen reader the same", async () => {
    await draw({ tool: null, drawings: [named], selectedId: null })
    const label = host.querySelector<SVGTextElement>(
      "[data-line-description]"
    )!
    expect(label.textContent).toBe("4h base")
    expect(label.getAttribute("aria-hidden")).toBe("true")
    expect(label.style.pointerEvents).toBe("none")
    // Hung off the left-hand end, at x 100, y 100, and turned to the line's
    // own slope: it rises $20 over 400ms, which is 20 pixels up over 40 across.
    expect(label.getAttribute("transform")).toBe("translate(100 100) rotate(-26.57)")
    expect([label.getAttribute("x"), label.getAttribute("y")]).toEqual(["6", "-5"])
    expect(lineBody().getAttribute("aria-label")).toBe(
      "4h base, trendline from $100 to $120"
    )
    // The buttons name the line the same way, with the typed capitals kept.
    await draw({
      tool: null,
      drawings: [{ ...named, shape: { ...named.shape, name: "This Is A Test" } }],
      selectedId: named.id,
      onSetAlert: vi.fn(),
    })
    expect(
      host.querySelector('[aria-label^="Delete "]')?.getAttribute("aria-label")
    ).toBe("Delete This Is A Test, trendline from $100 to $120")
  })

  it("reads a name left to right on a line drawn backwards, and from the plot's edge", async () => {
    const backwards: Drawing = {
      id: "line-1",
      shape: {
        kind: "trendline",
        // Drawn right to left: the later point is the one on the left.
        from: { time: 1_400, price: 120 },
        to: { time: 1_000, price: 100 },
        name: "4h base",
      },
      alert: null,
    }
    await draw({ tool: null, drawings: [backwards], selectedId: null })
    // Still hung off the left-hand end, leaning the same way, so the words
    // never come out upside down.
    expect(
      host.querySelector("[data-line-description]")?.getAttribute("transform")
    ).toBe("translate(100 100) rotate(-26.57)")

    const offScreen: Drawing = {
      id: "line-2",
      shape: {
        kind: "trendline",
        from: { time: -0, price: 60 },
        to: { time: 1_000, price: 100 },
        name: "weekly low",
      },
      alert: null,
    }
    await draw({ tool: null, drawings: [offScreen], selectedId: null })
    // A level runs the whole width, so its name lies flat at the left edge.
    await draw({
      tool: null,
      drawings: [
        { id: "l", shape: { kind: "level", price: 100, name: "flat" }, alert: null },
      ],
      selectedId: null,
    })
    expect(
      host.querySelector("[data-line-description]")?.getAttribute("transform")
    ).toBe("translate(0 100) rotate(0)")
  })

  it("saves a description of at least 20 words as a move of the same line", async () => {
    const onMove = vi.fn()
    const plain: Drawing = {
      ...named,
      shape: {
        kind: "trendline",
        from: { time: 1_000, price: 100 },
        to: { time: 1_400, price: 120 },
      },
    }
    await draw({
      tool: null,
      drawings: [plain],
      selectedId: plain.id,
      onSetAlert: vi.fn(),
      onMove,
    })
    await act(async () => {
      lineBody().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })
    const field = document.getElementById(
      "line-description-line-1"
    ) as HTMLTextAreaElement
    const description =
      "As long as price stays under this trendline, wait for a clean break before considering an entry into the market again"
    expect(field.tagName).toBe("TEXTAREA")
    expect(description.trim().split(/\s+/)).toHaveLength(21)
    expect(description.length).toBeLessThanOrEqual(field.maxLength)
    await act(async () => typeInto(field, `  ${description}  `))
    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(onMove).toHaveBeenCalledWith(
      "line-1",
      {
        kind: "trendline",
        from: { time: 1_000, price: 100 },
        to: { time: 1_400, price: 120 },
        name: description,
      },
      105
    )
  })

  it("takes a description away when emptied and saves nothing when unchanged", async () => {
    const onMove = vi.fn()
    await draw({
      tool: null,
      drawings: [named],
      selectedId: named.id,
      onSetAlert: vi.fn(),
      onMove,
    })
    await act(async () => {
      lineBody().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })
    const field = document.getElementById(
      "line-description-line-1"
    ) as HTMLTextAreaElement
    expect(field.value).toBe("4h base")
    expect(field.maxLength).toBe(240)

    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(onMove).not.toHaveBeenCalled()

    await act(async () => typeInto(field, ""))
    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(onMove).toHaveBeenCalledWith(
      "line-1",
      {
        kind: "trendline",
        from: { time: 1_000, price: 100 },
        to: { time: 1_400, price: 120 },
      },
      105
    )
  })
})

describe("the break buffer on a line's alert", () => {
  const level: Drawing = {
    id: "line-1",
    shape: { kind: "level", price: 100 },
    alert: { direction: "above", armedAt: 1, firedAt: null },
  }

  /** What the window says beside the box. */
  function readout() {
    return document.getElementById("line-buffer-line-1-fires")?.textContent
  }

  async function openOn(drawing: Drawing, onSetBuffer = vi.fn()) {
    await draw({
      tool: null,
      drawings: [drawing],
      selectedId: drawing.id,
      onSetAlert: vi.fn(),
      onSetBuffer,
    })
    await act(async () => {
      lineBody().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })
    return {
      field: document.getElementById("line-buffer-line-1") as HTMLInputElement,
      onSetBuffer,
    }
  }

  it("is offered on an armed line only, and says nothing until a number is typed", async () => {
    const { field } = await openOn(level)
    expect(field).not.toBeNull()
    expect(field.value).toBe("")
    // Exactly one of each. This field and the description field below it were
    // once keyed the same way when both were empty, and React drew one twice.
    expect(document.querySelectorAll("#line-buffer-line-1")).toHaveLength(1)
    expect(document.querySelectorAll("#line-description-line-1")).toHaveLength(
      1
    )
    // Nothing to say beside an empty box.
    expect(readout()).toBe("")
  })

  it("is not offered while the alert is off, or once it has fired", async () => {
    await openOn({ ...level, alert: null })
    expect(document.getElementById("line-buffer-line-1")).toBeNull()

    await openOn({
      ...level,
      alert: { direction: "above", armedAt: 1, firedAt: 2 },
    })
    expect(document.getElementById("line-buffer-line-1")).toBeNull()
  })

  it("says the percentage and the side as it is typed, before it is saved", async () => {
    const { field, onSetBuffer } = await openOn(level)
    await act(async () => typeInto(field, "50"))
    expect(document.body.textContent).toContain("50% above the level")
    expect(onSetBuffer).not.toHaveBeenCalled()

    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(onSetBuffer).toHaveBeenCalledWith("line-1", 50)
  })

  it("says the percentage and the side, never a price", async () => {
    const { field } = await openOn({
      ...level,
      shape: { kind: "level", price: 20 },
    })
    await act(async () => typeInto(field, "10"))
    // The price it works out to is nobody's business here. Tyler: "i dont
    // need to read the price".
    expect(document.body.textContent).toContain("10% above the level")
    expect(document.body.textContent).not.toContain("$22")
  })

  it("takes the buffer off the other side when the alert waits for a fall", async () => {
    const { field } = await openOn({
      ...level,
      alert: { direction: "below", armedAt: 1, firedAt: null },
    })
    await act(async () => typeInto(field, "50"))
    expect(document.body.textContent).toContain("50% below the level")
  })

  it("shows the saved buffer, and clears it when the box is emptied", async () => {
    const { field, onSetBuffer } = await openOn({
      ...level,
      alert: { direction: "above", armedAt: 1, firedAt: null, buffer: 50 },
    })
    expect(field.value).toBe("50")
    expect(document.body.textContent).toContain("50% above the level")

    await act(async () => typeInto(field, ""))
    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(onSetBuffer).toHaveBeenCalledWith("line-1", null)
  })

  it("marks a number it cannot read and saves nothing", async () => {
    const { field, onSetBuffer } = await openOn(level)
    await act(async () => typeInto(field, "abc"))
    expect(field.getAttribute("aria-invalid")).toBe("true")
    expect(readout()).toBe("")

    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(onSetBuffer).not.toHaveBeenCalled()
  })

  it("saves nothing when the number was not changed", async () => {
    const { field, onSetBuffer } = await openOn({
      ...level,
      alert: { direction: "above", armedAt: 1, firedAt: null, buffer: 50 },
    })
    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(onSetBuffer).not.toHaveBeenCalled()
  })
})

describe("the master switch in Settings", () => {
  const line: Drawing = {
    id: "line-1",
    shape: { kind: "level", price: 100 },
    alert: null,
  }

  it("says the alerts are paused, over the line's own switch", async () => {
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
      lineAlertsPaused: true,
    })
    await act(async () => {
      lineBody().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })
    expect(document.body.textContent).toContain("Paused in Settings")
    // The line's own switch still works; pausing is not switching off.
    expect(document.getElementById("line-alert-line-1")).not.toBeNull()
  })

  it("says nothing about Settings while the alerts are watched", async () => {
    await draw({
      tool: null,
      drawings: [line],
      selectedId: line.id,
      onSetAlert: vi.fn(),
    })
    await act(async () => {
      lineBody().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    })
    expect(document.body.textContent).not.toContain("Paused in Settings")
  })
})
