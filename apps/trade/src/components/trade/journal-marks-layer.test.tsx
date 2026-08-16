import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { JournalMarksLayer } from "@/components/trade/journal-marks-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"

const MARKET = "hyperliquid:mainnet:BTC"

const surface: ChartSurface = {
  width: 800,
  height: 400,
  axisWidth: 60,
  xOf: (time) => time / 10,
  xOfContainingBar: (time) => Math.floor(time / 1_000) * 100,
  timeAt: (x) => x * 10,
  barAt: (time) => time / 1_000,
  yOf: (price) => 400 - price,
  priceAt: (y) => 400 - y,
}

function trade(id: string, openedAt: number, stopPx: number | null): LiveTrade {
  const closedAt = openedAt + 1_000
  return {
    id,
    walletId: "wallet-1",
    marketKey: MARKET,
    live: true,
    direction: "long",
    openedAt,
    closedAt,
    heldMs: closedAt - openedAt,
    entryPx: 100,
    exitPx: 110,
    sz: 1,
    amountUsd: 100,
    pnl: 10,
    returnPct: 10,
    ending: stopPx === null ? "closed" : "stop",
    stopPx,
    fills: [
      {
        fillId: `${id}-entry`,
        orderId: `${id}-entry-order`,
        walletId: "wallet-1",
        marketKey: MARKET,
        side: "buy",
        px: 100,
        sz: 1,
        at: openedAt,
        closedPnl: 0,
        fee: 0,
        dir: "Open Long",
        liquidation: false,
      },
      {
        fillId: `${id}-exit`,
        orderId: `${id}-exit-order`,
        walletId: "wallet-1",
        marketKey: MARKET,
        side: "sell",
        px: 110,
        sz: 1,
        at: closedAt,
        closedPnl: 10,
        fee: 0,
        dir: "Close Long",
        liquidation: false,
      },
    ],
  }
}

function arrowCount(html: string): number {
  return html.match(/data-slot="trade-fill-mark"/g)?.length ?? 0
}

describe("finished trade arrows", () => {
  it("draws finished and still-open fills before a Journal row is selected", () => {
    const trades = [trade("first", 1_000, null), trade("second", 3_000, 95)]
    const openFill: LiveFill = {
      ...trades[0].fills[0],
      fillId: "recent-entry",
      orderId: "recent-entry-order",
      at: 5_500,
      px: 120,
    }
    const html = renderToStaticMarkup(
      <JournalMarksLayer
        surface={surface}
        trades={trades}
        fills={[openFill]}
        focusedTrade={null}
      />
    )

    expect(arrowCount(html)).toBe(5)
    expect(html).toContain('data-trade-id="first"')
    expect(html).toContain('data-trade-id="second"')
    // The 5.5-second fill belongs to the candle opened at 5 seconds, whose
    // centre is x=500 on this surface. It must not drift halfway to x=600.
    expect(html).toContain('points="500,')
    expect(html).not.toContain("Stop")
  })

  it("adds the selected trade detail without duplicating its arrows", () => {
    const trades = [trade("first", 1_000, null), trade("second", 3_000, 95)]
    const html = renderToStaticMarkup(
      <JournalMarksLayer
        surface={surface}
        trades={trades}
        fills={[]}
        focusedTrade={trades[1]}
      />
    )

    expect(arrowCount(html)).toBe(4)
    expect(html).toContain("Stop")
  })
})
