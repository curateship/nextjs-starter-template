import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChartPositionOverlay } from "@/components/chart/chart-position-overlay"
import type { ChartPosition } from "@/lib/trading/chart-positions"

const position: ChartPosition = {
  id: "position-1",
  side: "long",
  startTime: 1_700_000_000,
  endTime: 1_700_020_000,
  entry: 100,
  target: 120,
  stop: 90,
}

const pixels = [
  {
    id: "position-1",
    side: "long" as const,
    left: 100,
    right: 400,
    entryY: 200,
    stopY: 260,
    targetY: 80,
  },
]

describe("position drawing overlay", () => {
  it("writes only the percentages and the risk/reward on the chart", () => {
    const markup = renderToStaticMarkup(
      <ChartPositionOverlay
        positions={[position]}
        pixels={pixels}
        selectedId="position-1"
      />
    )

    expect(markup).toContain("+20.00%")
    expect(markup).toContain("-10.00%")
    expect(markup).toContain("Risk/reward 2.00")
    // No prices, sizes, money amounts, or direction words.
    expect(markup).not.toContain("Target")
    expect(markup).not.toContain("Stop")
    expect(markup).not.toContain("Long")
    expect(markup).not.toContain("Qty")
    expect(markup).not.toContain("$")
  })

  it("hides every readout once the drawing is clicked away from", () => {
    const markup = renderToStaticMarkup(
      <ChartPositionOverlay
        positions={[position]}
        pixels={pixels}
        selectedId={null}
      />
    )

    expect(markup).not.toContain("%")
    expect(markup).not.toContain("Risk/reward")
    // The zones themselves stay on the chart.
    expect(markup).toContain("rgba(8, 153, 129, 0.16)")
    expect(markup).toContain("rgba(242, 54, 69, 0.16)")
  })

  it("shows four drag handles only while the drawing is selected", () => {
    const selected = renderToStaticMarkup(
      <ChartPositionOverlay
        positions={[position]}
        pixels={pixels}
        selectedId="position-1"
      />
    )
    const unselected = renderToStaticMarkup(
      <ChartPositionOverlay
        positions={[position]}
        pixels={pixels}
        selectedId={null}
      />
    )

    expect(selected.match(/rounded-full border-2/g)).toHaveLength(4)
    expect(unselected).not.toContain("rounded-full border-2")
  })

  it("never takes the pointer away from the chart underneath", () => {
    const markup = renderToStaticMarkup(
      <ChartPositionOverlay
        positions={[position]}
        pixels={pixels}
        selectedId={null}
      />
    )

    expect(markup).toContain("pointer-events-none")
  })
})
