import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { ChartSurface } from "@/components/trade/price-chart"
import { TradeLinesLayer } from "@/components/trade/trade-lines-layer"
import type { ChartColors } from "@/lib/trade/chart-theme"
import type { PaperOrder, PaperPosition } from "@/lib/trade/paper"

const MARKET = "hyperliquid:mainnet:BTC"
const colors: ChartColors = {
  text: "theme-text",
  grid: "theme-grid",
  border: "theme-border",
  primary: "theme-primary",
  up: "theme-up",
  down: "theme-down",
  warning: "theme-warning",
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

function position(kind: "target" | "stop"): PaperPosition {
  return {
    id: "position",
    walletId: "wallet",
    marketKey: MARKET,
    szi: 1,
    entryPx: 100,
    leverage: 1,
    maxLeverage: 50,
    tpPx: kind === "target" ? 110 : null,
    slPx: kind === "stop" ? 90 : null,
    feesPaid: 0,
    updatedAt: 1,
    live: {
      marginUsed: 100,
      liquidationPx: null,
      tpOrderId: kind === "target" ? "bracket-order" : null,
      slOrderId: kind === "stop" ? "bracket-order" : null,
    },
  }
}

function order(
  px: number,
  id = "bracket-order",
  walletId = "wallet"
): PaperOrder {
  return {
    id,
    walletId,
    marketKey: MARKET,
    side: "sell",
    px,
    sz: 1,
    leverage: 0,
    maxLeverage: 0,
    reduceOnly: true,
    tpPx: null,
    slPx: null,
    createdAt: 1,
    updatedAt: 1,
    live: true,
    trigger: true,
  }
}

function render(kind: "target" | "stop", orderId = "bracket-order"): string {
  return renderLines(position(kind), [
    order(kind === "target" ? 110 : 90, orderId),
  ])
}

function renderLines(
  held: PaperPosition,
  orders: readonly PaperOrder[]
): string {
  return renderToStaticMarkup(
    <TradeLinesLayer
      surface={surface}
      colors={colors}
      marketKey={MARKET}
      positions={[held]}
      orders={orders}
      walletName={() => "Wallet"}
      tool={null}
      onMoveOrder={() => undefined}
      onCancelOrder={() => undefined}
      onSetBrackets={() => undefined}
    />
  )
}

describe("chart bracket lines", () => {
  it("draws the entry bar in chart blue", () => {
    expect(render("target")).toContain("#2962ff")
  })

  it.each([
    ["target", "Take Profit"],
    ["stop", "Stop Loss"],
  ] as const)("draws a live %s order as one bracket bar", (kind, label) => {
    const html = render(kind)

    expect(html).toContain(label)
    expect(html).not.toContain("Sell $")
    expect(html).not.toContain("theme-neutral")
  })

  it("keeps a separate order at the same price", () => {
    const html = render("target", "another-order")

    expect(html).toContain("Take Profit")
    expect(html).toContain("Sell $110")
    expect(html).toContain("theme-neutral")
  })

  it("keeps the same exchange order ID when it belongs to another wallet", () => {
    const html = renderLines(position("target"), [
      order(110, "bracket-order", "another-wallet"),
    ])

    expect(html).toContain("Sell $110")
    expect(html).toContain("theme-neutral")
  })

  it("does not redraw a grid stop after the plain stop line is masked", () => {
    const held = position("stop")
    held.slPx = null

    const html = renderLines(held, [order(90)])

    expect(html).not.toContain("Sell $90")
    expect(html).not.toContain("theme-neutral")
  })
})
