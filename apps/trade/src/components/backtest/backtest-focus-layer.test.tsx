import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BacktestFocusLayer } from "@/components/backtest/backtest-focus-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { BacktestTrade } from "@/lib/trade/backtest/result"

const surface: ChartSurface = {
  width: 800,
  height: 400,
  axisWidth: 60,
  xOf: (time) => time,
  xOfContainingBar: (time) => time,
  timeAt: (x) => x,
  barAt: (time) => time,
  yOf: (price) => price,
  priceAt: (y) => y,
}

const trades: BacktestTrade[] = [
  {
    n: 1,
    direction: "long",
    entryAt: 10,
    entryPx: 100,
    exitAt: 30,
    exitPx: 110,
    sz: 1,
    amountUsd: 100,
    pnl: 10,
    returnPct: 10,
    exitReason: "order",
  },
  {
    n: 2,
    direction: "long",
    entryAt: 20,
    entryPx: 105,
    exitAt: 30,
    exitPx: 110,
    sz: 1,
    amountUsd: 105,
    pnl: 5,
    returnPct: 5,
    exitReason: "order",
  },
]

function renderedLines(focus: readonly BacktestTrade[]): string {
  return renderToStaticMarkup(
    <BacktestFocusLayer surface={surface} trades={trades} focus={focus} />
  )
}

describe("the backtest trade lines", () => {
  it("isolates the one closed position selected in the Trades table", () => {
    const html = renderedLines([trades[1]])

    expect(html.match(/<line/g)?.length ?? 0).toBe(1)
    expect(html).toContain('x1="20"')
    expect(html).not.toContain('x1="10"')
  })

  it("shows every closed position when none is selected", () => {
    expect(renderedLines([]).match(/<line/g)?.length ?? 0).toBe(2)
  })
})
