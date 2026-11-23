import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { IndicatorLayer } from "@/components/trade/indicator-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { IndicatorPaint } from "@/lib/trade/indicators/contract"

describe("the indicator drawing layer", () => {
  it("converts only the visible stretch of a long line into chart positions", () => {
    let xCalls = 0
    const surface: ChartSurface = {
      width: 100,
      height: 100,
      axisWidth: 0,
      xOf: (time) => {
        xCalls += 1
        return time - 5_000
      },
      xOfContainingBar: () => 0,
      timeAt: (x) => 5_000 + x,
      barAt: (time) => time,
      yOf: (price) => price,
      priceAt: (y) => y,
    }
    const paint: IndicatorPaint = {
      lines: [
        {
          id: "long-line",
          color: "#123456",
          points: Array.from({ length: 10_000 }, (_, time) => ({
            time,
            price: 50,
          })),
        },
      ],
      dashes: [],
      marks: [],
      boxes: [],
    }

    const html = renderToStaticMarkup(
      <IndicatorLayer surface={surface} paint={paint} />
    )

    expect(html).toContain('stroke="#123456"')
    expect(xCalls).toBeLessThan(200)
  })
})
