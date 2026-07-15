import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ChartOrderMenu } from "@/components/trading/chart-order-menu"

describe("chart order menu", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("shows the supplied protected limit actions at the clicked price", () => {
    vi.stubGlobal("window", {
      innerWidth: 1_440,
      innerHeight: 900,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const markup = renderToStaticMarkup(
      <ChartOrderMenu
        menu={{ price: 1_744.2, px: "1744.2", x: 100, y: 100 }}
        market="ETH"
        oneClickActions={
          <>
            <button type="button">Buy limit - WS:10% SL:2% TP:5%</button>
            <button type="button">Sell limit - WS:10% SL:2% TP:5%</button>
          </>
        }
        onAddAlert={vi.fn()}
        onResetView={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain("ETH @ 1,744.2")
    expect(markup).toContain("Buy limit - WS:10% SL:2% TP:5%")
    expect(markup).toContain("Sell limit - WS:10% SL:2% TP:5%")
    expect(markup).toContain("Add alert")
    expect(markup).not.toContain("1-Click Long")
    expect(markup).not.toContain("1-Click Short")
    expect(markup).toContain("w-max")
    expect(markup).not.toContain("w-72")
  })
})
