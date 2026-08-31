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
      smartOrders={smartOrders}
      recentOrderTypes={recentOrderTypes}
      onPick={() => {}}
      onPickSmart={() => {}}
      onPickTakeProfit={target ? () => {} : null}
      onPickStopLoss={stop ? () => {} : null}
      onClose={() => {}}
    />
  )
}

describe("the chart order menu's position exits", () => {
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
    expect(html.match(/border-t/g)).toHaveLength(1)
  })
})

describe("the chart order menu's recent orders", () => {
  it("lists the latest placed kind first above the limit rows", () => {
    const html = draw({
      recentOrderTypes: ["grid", "buy", "dca"],
      smartOrders: true,
    })
    const recentAt = html.indexOf("Recent")
    const gridAt = html.indexOf("Grid", recentAt)
    const buyAt = html.indexOf("Buy limit", recentAt)
    const dcaAt = html.indexOf("DCA ladder", recentAt)
    const ordinaryBuyAt = html.indexOf("Buy limit", buyAt + 1)

    expect(recentAt).toBeGreaterThan(-1)
    expect(gridAt).toBeLessThan(buyAt)
    expect(buyAt).toBeLessThan(dcaAt)
    expect(dcaAt).toBeLessThan(ordinaryBuyAt)
  })

  it("leaves saved smart kinds out when the wallet cannot place them", () => {
    const html = draw({ recentOrderTypes: ["grid", "sell"] })
    const recent = html.slice(html.indexOf("Recent"))

    expect(recent).toContain("Sell limit")
    expect(recent).not.toContain("Grid")
  })

  it("does not show an empty Recent section on a first visit", () => {
    expect(draw()).not.toContain("Recent")
  })
})
