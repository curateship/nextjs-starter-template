import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChartOrderMenu } from "@/components/trade/chart-order-menu"

function draw({
  target = false,
  stop = false,
  recentOrderTypes = [],
  smartOrders = false,
}: {
  target?: boolean
  stop?: boolean
  recentOrderTypes?: Array<"buy" | "sell" | "dca" | "grid">
  smartOrders?: boolean
} = {}): string {
  return renderToStaticMarkup(
    <ChartOrderMenu
      menu={{ price: 100, x: 20, y: 20 }}
      orders
      smartOrders={smartOrders}
      recentOrderTypes={recentOrderTypes}
      onPick={() => {}}
      onPickSmart={() => {}}
      onPickTakeProfit={target ? () => {} : null}
      onPickStopLoss={stop ? () => {} : null}
      onPickAlert={() => {}}
      onClose={() => {}}
    />
  )
}

describe("the chart order menu's position exits", () => {
  it("keeps the alert row when no wallet can place an order", () => {
    const html = renderToStaticMarkup(
      <ChartOrderMenu
        menu={{ price: 3_600, x: 20, y: 20 }}
        orders={false}
        smartOrders={false}
        recentOrderTypes={["buy", "grid"]}
        onPick={() => {}}
        onPickSmart={() => {}}
        onPickTakeProfit={null}
        onPickStopLoss={null}
        onPickAlert={() => {}}
        onClose={() => {}}
      />
    )

    expect(html).toContain("Alert at $3,600")
    expect(html).not.toContain("Long")
    expect(html).not.toContain("Smart order")
  })

  it("offers stop loss when the clicked level can set one", () => {
    const html = draw({ stop: true })

    expect(html).toContain("Stop loss")
    expect(html).not.toContain("Take profit")
  })

  it("offers take profit when the clicked level can set one", () => {
    const html = draw({ target: true })

    expect(html).toContain("Take profit")
    expect(html).not.toContain("Stop loss")
  })

  it("keeps both position exits in one group when both apply", () => {
    const html = draw({ target: true, stop: true })

    expect(html).toContain("Take profit")
    expect(html).toContain("Stop loss")
    // One divider closes the exit group; the other keeps alerts separate from
    // actions that place or change an order.
    expect(html.match(/border-t/g)).toHaveLength(2)
  })
})

describe("the chart order menu's Manual and Smart fold-out rows", () => {
  it("shows the two rows only when the wallet can place smart orders", () => {
    const html = draw({ smartOrders: true })
    expect(html).toContain("Manual order")
    expect(html).toContain("Smart order")
    expect(html.match(/aria-expanded=/g)).toHaveLength(2)
    expect(draw()).not.toContain("Manual order")
    expect(draw()).toContain(">Long<")
  })

  it("starts with both rows closed", () => {
    const html = draw({ smartOrders: true })
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2)
    expect(html).not.toContain(">Long<")
    expect(html).not.toContain(">Short<")
    expect(html).not.toContain("DCA ladder")
    expect(html).not.toContain(">Grid<")
  })

  it("keeps both closed whatever was placed last", () => {
    const html = draw({ recentOrderTypes: ["grid", "buy"], smartOrders: true })
    const afterRecent = html.slice(html.indexOf("Manual order"))
    expect(afterRecent).not.toContain("DCA ladder")
    expect(afterRecent).not.toContain(">Long<")
  })
})

describe("the chart order menu's recent orders", () => {
  it("lists the latest placed kind first, above the fold-out rows", () => {
    const html = draw({
      recentOrderTypes: ["grid", "buy", "dca"],
      smartOrders: true,
    })
    const recentAt = html.indexOf("Recent")
    const gridAt = html.indexOf("Grid", recentAt)
    const buyAt = html.indexOf("Long", recentAt)
    const dcaAt = html.indexOf("DCA ladder", recentAt)
    const switchAt = html.indexOf("Manual order")

    expect(recentAt).toBeGreaterThan(-1)
    expect(gridAt).toBeLessThan(buyAt)
    expect(buyAt).toBeLessThan(dcaAt)
    expect(dcaAt).toBeLessThan(switchAt)
  })

  it("leaves saved smart kinds out when the wallet cannot place them", () => {
    const html = draw({ recentOrderTypes: ["grid", "sell"] })
    const recent = html.slice(html.indexOf("Recent"))

    expect(recent).toContain("Short")
    expect(recent).not.toContain("Grid")
  })

  it("does not show an empty Recent section on a first visit", () => {
    expect(draw()).not.toContain("Recent")
  })
})

describe("the chart order menu's plain orders", () => {
  it("calls watched orders Long and Short without limit wording", () => {
    const html = draw()

    expect(html).toContain(">Long<")
    expect(html).toContain(">Short<")
    expect(html).not.toContain("Buy limit")
    expect(html).not.toContain("Sell limit")
  })

  it("leaves the Market choice inside the Long and Short window", () => {
    const html = draw()

    expect(html).not.toContain("Market long")
    expect(html).not.toContain("Market short")
  })
})
