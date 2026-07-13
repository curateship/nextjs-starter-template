import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ChartOrderMenu } from "@/components/trading/chart-order-menu"

describe("chart order menu", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("shows one-click actions above manual limit orders", () => {
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
            <button type="button">1-Click Long</button>
            <button type="button">1-Click Short</button>
          </>
        }
        onAction={vi.fn()}
        onResetView={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain("1-Click Long")
    expect(markup).toContain("1-Click Short")
    expect(markup.indexOf("1-Click Long")).toBeLessThan(
      markup.indexOf("Buy limit")
    )
    expect(markup.indexOf("1-Click Short")).toBeLessThan(
      markup.indexOf("Sell limit")
    )
  })
})
