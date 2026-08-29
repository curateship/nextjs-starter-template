// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { ChartSurface } from "@/components/trade/price-chart"
import { TradeLinesLayer } from "@/components/trade/trade-lines-layer"
import type { ChartColors } from "@/lib/trade/chart-theme"
import type { TradeOrder, TradePosition } from "@/lib/trade/paper"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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

function position(kind: "target" | "stop"): TradePosition {
  return {
    id: "position",
    walletId: "wallet",
    marketKey: MARKET,
    szi: 1,
    entryPx: 100,
    leverage: 1,
    maxLeverage: 50,
    targets:
      kind === "target"
        ? [{ px: 110, sz: null, orderId: "bracket-order" }]
        : [],
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
): TradeOrder {
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
  held: TradePosition,
  orders: readonly TradeOrder[]
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
  it("gives a movable line a finger-sized touch target", () => {
    const html = render("target")

    expect(html).toContain("stroke-width:44px")
    expect(html).toContain("touch-action:none")
  })

  it("hands the live position row to the stop remove action", async () => {
    const held = position("stop")
    const calls: Array<{
      position: TradePosition
      brackets: {
        targets: Array<{ px: number; sz: number | null }>
        slPx: number | null
      }
    }> = []
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          positions={[held]}
          orders={[]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onSetBrackets={(position, brackets) =>
            calls.push({ position, brackets })
          }
        />
      )
    })
    const remove = host.querySelector<SVGGElement>(
      '[aria-label^="Remove stop loss"]'
    )
    expect(remove).not.toBeNull()
    await act(async () => {
      remove?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })

    expect(calls).toEqual([
      { position: held, brackets: { targets: [], slPx: null } },
    ])
    await act(async () => root.unmount())
  })

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

  it("names a spare protection leg for what it is, not as a plain sell", () => {
    // A position can end up carrying two stops or two targets, and the extra
    // one used to draw as "Sell $110" in the neutral grey of an ordinary
    // waiting order. It is not one: it fires by itself and sells the position.
    const html = render("target", "another-order")

    expect(html).toContain("Take Profit")
    expect(html).toContain("Extra Target $110")
    expect(html).not.toContain("Sell $110")
    expect(html).not.toContain("theme-neutral")
  })

  it("reads a spare leg on a short the other way round", () => {
    // On a short the exit is a buy, so the profit is BELOW where it got in and
    // the loss is above. Getting this backwards would paint a stop green and
    // call it a target, on a line that sells real money by itself.
    const held = position("stop")
    held.szi = -1
    held.slPx = 130

    const below = renderLines(held, [order(80, "another-order")])
    expect(below).toContain("Extra Target $80")
    expect(below).toContain("theme-up")

    const above = renderLines(held, [order(150, "another-order")])
    expect(above).toContain("Extra Stop $150")
    expect(above).toContain("theme-down")
  })

  /** Every label pill on the chart, as boxes, from the drawn SVG. */
  function pillBoxes(html: string) {
    const host = document.createElement("div")
    host.innerHTML = html
    return [...host.querySelectorAll("rect")]
      .filter((rect) => rect.getAttribute("fill") === "var(--card)")
      .map((rect) => ({
        left: Number(rect.getAttribute("x")),
        top: Number(rect.getAttribute("y")),
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
      }))
  }

  it("moves a pill off the pill it landed on instead of covering it", () => {
    // Two lines at one price put both pills in the same place, and the second
    // one drawn covered the first: on 24 Aug 2026 a stop read "Stop Lo", the
    // rest of its words and its × hidden under a sell order's pill.
    const held = position("stop")
    held.slPx = 60
    const boxes = pillBoxes(renderLines(held, [order(60, "another-order")]))
    expect(boxes).toHaveLength(3)

    for (const [at, box] of boxes.entries()) {
      for (const other of boxes.slice(at + 1)) {
        const sameBand =
          box.top < other.top + other.height && other.top < box.top + box.height
        const sameColumn =
          box.left < other.left + other.width &&
          other.left < box.left + box.width
        expect(sameBand && sameColumn).toBe(false)
      }
    }
  })

  it("slides a pill left of another layer's chip instead of covering it", () => {
    // A grid level's money chip and a position's Entry pill share a height
    // whenever the grid just bought — the grid IS the position then. The chip
    // cannot move (it belongs to another layer), so the pill must.
    const held = position("stop")
    held.slPx = null
    const chipWidth = 60
    const html = renderToStaticMarkup(
      <TradeLinesLayer
        surface={surface}
        colors={colors}
        marketKey={MARKET}
        positions={[held]}
        orders={[]}
        walletName={() => "Wallet"}
        tool={null}
        onMoveOrder={() => undefined}
        onCancelOrder={() => undefined}
        onSetBrackets={() => undefined}
        // A chip hugging the right edge at the entry's own height.
        obstacles={[
          {
            top: surface.yOf(held.entryPx)! - 11,
            bottom: surface.yOf(held.entryPx)! + 11,
            width: chipWidth,
          },
        ]}
      />
    )
    const boxes = pillBoxes(html)
    const entry = boxes.find(
      (box) => Math.abs(box.top + box.height / 2 - surface.yOf(100)!) < 2
    )
    expect(entry).toBeDefined()
    // The whole pill sits clear, left of where the chip begins.
    expect(entry!.left + entry!.width).toBeLessThanOrEqual(
      surface.width - chipWidth
    )
  })

  it("prints one price badge when two lines sit on the same price", () => {
    const held = position("stop")
    held.slPx = 60
    const host = document.createElement("div")
    host.innerHTML = renderLines(held, [order(60, "another-order")])
    // The badges are the solid blocks over the axis, which starts at the
    // plot's width plus the gap. Three lines, two prices between them, so two
    // badges: printing "60" twice says one fact twice.
    const badges = [...host.querySelectorAll("rect")].filter(
      (rect) => Number(rect.getAttribute("x")) === surface.width + 4
    )
    expect(badges).toHaveLength(2)
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
