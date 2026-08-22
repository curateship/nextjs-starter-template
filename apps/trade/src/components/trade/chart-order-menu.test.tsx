import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChartOrderMenu } from "@/components/trade/chart-order-menu"

function draw({ target = false, stop = false } = {}): string {
  return renderToStaticMarkup(
    <ChartOrderMenu
      menu={{ price: 100, x: 20, y: 20 }}
      smartOrders={false}
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
