// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { RetentionChart } from "@/components/video-retention/retention-chart"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Recharts sizes itself from the page, and jsdom lays nothing out, so every
// box watched reports the width and height of a wide Export window.
globalThis.ResizeObserver = class {
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 600, height: 224 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    )
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

describe("RetentionChart", () => {
  it("numbers the scenes, draws the line and the band, and names both", () => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root!.render(
        <RetentionChart
          lengthSeconds={30}
          points={[
            { ratio: 0, watch: 0.9, relative: 0.6 },
            { ratio: 0.4, watch: 0.4, relative: 0.3 },
            { ratio: 1, watch: 0.2, relative: 0.5 },
          ]}
          scenes={[
            { startMs: 0, endMs: 4000, name: "Hook" },
            { startMs: 4000, endMs: 12_000, name: "Kitchen" },
            { startMs: 12_000, endMs: 30_000, name: "Still frame" },
          ]}
        />
      )
    )
    const svg = host.querySelector("svg.recharts-surface")
    expect(svg).not.toBeNull()
    // The scene numbers and the "typical" mark are the chart's own labels.
    const labels = [...host.querySelectorAll("text.fill-muted-foreground")].map(
      (text) => text.textContent
    )
    expect(labels).toEqual(["1", "2", "3", "typical"])
    expect(host.querySelector(".recharts-line-curve")).not.toBeNull()
    expect(host.querySelector(".recharts-area-area")).not.toBeNull()
    expect(host.textContent).toContain("typical")
    expect(host.textContent).toContain("Still watching, out of 100")
    expect(host.textContent).toContain(
      "Better than this many videos this long, out of 100"
    )
    // The chart takes its row's width; nothing in it is a fixed pixel width.
    const frame = host.querySelector('[data-slot="chart"]') as HTMLElement
    expect(frame.className).toContain("w-full")
    expect(frame.getAttribute("style") ?? "").not.toMatch(/width:\s*\d/)
  })
})
