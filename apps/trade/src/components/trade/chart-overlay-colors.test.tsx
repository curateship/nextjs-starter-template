import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { GridLayer } from "@/components/trade/grid-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import { SmartLadderLayer } from "@/components/trade/smart-ladder-layer"
import type { ChartColors } from "@/lib/trade/chart-theme"

const colors: ChartColors = {
  text: "theme-text",
  grid: "theme-grid",
  border: "theme-border",
  primary: "theme-primary",
  up: "theme-up",
  down: "theme-down",
  warning: "theme-warning",
  alert: "theme-purple",
  neutral: "theme-neutral",
  badgeText: "theme-badge-text",
  upSoft: "theme-up-soft",
  downSoft: "theme-down-soft",
}

const surface: ChartSurface = {
  width: 480,
  height: 240,
  axisWidth: 60,
  xOf: () => 0,
  xOfContainingBar: () => 0,
  timeAt: () => 0,
  barAt: () => 0,
  yOf: (price) => 200 - price,
  priceAt: (y) => 200 - y,
}

describe("theme colours on chart overlays", () => {
  it("uses the candle colour for a ladder rung", () => {
    const html = renderToStaticMarkup(
      <SmartLadderLayer
        surface={surface}
        colors={colors}
        marketKey="market"
        ladders={[]}
        preview={{
          anchorPx: 110,
          rungs: [{ px: 100, dollars: 250 }],
          onMove: () => undefined,
          onResize: () => undefined,
        }}
        tool={null}
        walletName={() => "Wallet"}
      />
    )

    expect(html).toContain("theme-up")
  })

  it("uses the theme for every grid preview meaning", () => {
    const html = renderToStaticMarkup(
      <GridLayer
        surface={surface}
        colors={colors}
        marketKey="market"
        currentPx={100}
        grids={[]}
        preview={{
          direction: "long",
          levelCount: 5,
          lines: [
            { px: 130, kind: "upper" },
            { px: 120, kind: "level" },
            { px: 110, kind: "takeProfit" },
            { px: 100, kind: "stopLoss" },
            { px: 90, kind: "lower" },
          ],
        }}
        tool={null}
        walletName={() => "Wallet"}
        onCancelLevel={() => undefined}
        onCancelGrid={() => undefined}
        onReverseGrid={() => undefined}
        reverseDisabledReason={() => null}
        onOpenSettings={() => undefined}
        onMoveRange={async () => true}
        onMoveExit={async () => true}
      />
    )

    expect(html).toContain("theme-primary")
    expect(html).toContain("theme-up")
    expect(html).toContain("theme-down")
    expect(html).toContain("UPPER PRICE · RUNG 1 SELLS")
    expect(html).toContain("LOWER PRICE · RUNG 5 BUYS")
  })

  it("explains both ends of a selling grid's range", () => {
    const html = renderToStaticMarkup(
      <GridLayer
        surface={surface}
        colors={colors}
        marketKey="market"
        currentPx={100}
        grids={[]}
        preview={{
          direction: "short",
          levelCount: 5,
          lines: [
            { px: 130, kind: "upper" },
            { px: 90, kind: "lower" },
          ],
        }}
        tool={null}
        walletName={() => "Wallet"}
        onCancelLevel={() => undefined}
        onCancelGrid={() => undefined}
        onReverseGrid={() => undefined}
        reverseDisabledReason={() => null}
        onOpenSettings={() => undefined}
        onMoveRange={async () => true}
        onMoveExit={async () => true}
      />
    )

    expect(html).toContain("UPPER PRICE · RUNG 5 SELLS")
    expect(html).toContain("LOWER PRICE · RUNG 1 BUYS BACK")
  })
})
