// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { JournalMarksLayer } from "@/components/trade/journal-marks-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const surface: ChartSurface = {
  width: 800,
  height: 400,
  axisWidth: 60,
  xOf: (time) => time / 10,
  xOfContainingBar: (time) => time / 10,
  timeAt: (x) => x * 10,
  barAt: (time) => time / 1_000,
  yOf: (price) => 400 - price,
  priceAt: (y) => 400 - y,
}

const trade: LiveTrade = {
  id: "trade-1",
  walletId: "wallet-1",
  marketKey: "hyperliquid:mainnet:BTC",
  live: true,
  direction: "long",
  openedAt: 1_000,
  closedAt: 2_000,
  heldMs: 1_000,
  entryPx: 100,
  exitPx: 110,
  sz: 1,
  amountUsd: 100,
  pnl: 10,
  returnPct: 10,
  ending: "closed",
  stopPx: null,
  fills: [
    {
      fillId: "entry",
      orderId: "entry-order",
      walletId: "wallet-1",
      marketKey: "hyperliquid:mainnet:BTC",
      side: "buy",
      px: 100,
      sz: 1,
      at: 1_000,
      closedPnl: 0,
      fee: 0,
      dir: "Open Long",
      liquidation: false,
    },
    {
      fillId: "exit",
      orderId: "exit-order",
      walletId: "wallet-1",
      marketKey: "hyperliquid:mainnet:BTC",
      side: "sell",
      px: 110,
      sz: 1,
      at: 2_000,
      closedPnl: 10,
      fee: 0,
      dir: "Close Long",
      liquidation: false,
    },
  ],
}

describe("a chart arrow's right-click", () => {
  it("blocks the chart order menu and opens the arrow menu at the pointer", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onOpenArrowMenu = vi.fn()

    await act(async () => {
      root.render(
        <JournalMarksLayer
          surface={surface}
          trades={[trade]}
          fills={[]}
          focusedTrade={null}
          showArrows={true}
          tradeLimit={null}
          onOpenArrowMenu={onOpenArrowMenu}
        />
      )
    })

    const arrow = host.querySelector<SVGPolygonElement>(
      '[data-slot="trade-fill-mark"]'
    )
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 160,
    })
    await act(async () => arrow?.dispatchEvent(event))

    expect(event.defaultPrevented).toBe(true)
    expect(onOpenArrowMenu).toHaveBeenCalledWith(trade, { x: 120, y: 160 })

    await act(async () => root.unmount())
    host.remove()
  })

  it("offers removal for old fills when no matching position exists", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onOpenArrowMenu = vi.fn()

    await act(async () => {
      root.render(
        <JournalMarksLayer
          surface={surface}
          trades={[]}
          fills={[trade.fills[0]]}
          focusedTrade={null}
          showArrows={true}
          tradeLimit={null}
          onOpenArrowMenu={onOpenArrowMenu}
        />
      )
    })

    const arrow = host.querySelector<SVGPolygonElement>(
      '[data-slot="trade-fill-mark"]'
    )
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 160,
    })
    await act(async () => arrow?.dispatchEvent(event))

    expect(event.defaultPrevented).toBe(true)
    expect(onOpenArrowMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: trade.walletId,
        marketKey: trade.marketKey,
        fills: [trade.fills[0]],
      }),
      { x: 120, y: 160 }
    )

    await act(async () => root.unmount())
    host.remove()
  })

  it("does not offer history removal for a position that still exists", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onOpenArrowMenu = vi.fn()

    await act(async () => {
      root.render(
        <JournalMarksLayer
          surface={surface}
          trades={[]}
          fills={[trade.fills[0]]}
          focusedTrade={null}
          positions={[
            {
              walletId: trade.walletId,
              marketKey: trade.marketKey,
              szi: 1,
            },
          ]}
          showArrows={true}
          tradeLimit={null}
          onOpenArrowMenu={onOpenArrowMenu}
        />
      )
    })

    const arrow = host.querySelector<SVGPolygonElement>(
      '[data-slot="trade-fill-mark"]'
    )
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 160,
    })
    await act(async () => arrow?.dispatchEvent(event))

    expect(event.defaultPrevented).toBe(true)
    expect(onOpenArrowMenu).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    host.remove()
  })
})

describe("a chart arrow's hover words", () => {
  it("names the FLOCK grid rung that the buy exits", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const marketKey = "kucoin:mainnet:FLOCKUSDTM"
    const fills: LiveFill[] = [
      {
        ...trade.fills[0],
        fillId: "first-short",
        orderId: "first-short-order",
        marketKey,
        side: "sell",
        px: 0.05229149,
        sz: 1_340,
        at: 1_000,
        fee: 0.04204236,
        dir: "Sell",
        grid: true,
        gridDirection: "short",
        gridRung: 2,
      },
      {
        ...trade.fills[0],
        fillId: "second-short",
        orderId: "second-short-order",
        marketKey,
        side: "sell",
        px: 0.05554482,
        sz: 1_930,
        at: 2_000,
        fee: 0.0643209,
        dir: "Sell",
        grid: true,
        gridDirection: "short",
        gridRung: 3,
      },
      {
        ...trade.fills[0],
        fillId: "buy-back",
        orderId: "buy-back-order",
        marketKey,
        side: "buy",
        px: 0.05254477,
        sz: 1_930,
        at: 3_000,
        fee: 0.06084684,
        dir: "Buy",
        grid: true,
        gridDirection: "short",
      },
    ]

    await act(async () => {
      root.render(
        <JournalMarksLayer
          surface={surface}
          trades={[]}
          fills={fills}
          focusedTrade={null}
          positions={[{ walletId: trade.walletId, marketKey, szi: -1_340 }]}
          showArrows={true}
          tradeLimit={null}
        />
      )
    })

    const arrows = host.querySelectorAll<SVGPolygonElement>(
      '[data-slot="trade-fill-mark"]'
    )
    expect(arrows).toHaveLength(3)
    await act(async () => {
      arrows[2].dispatchEvent(new MouseEvent("pointerover", { bubbles: true }))
    })

    expect(host.textContent).toContain("Exit rung 3 - profit $5.66")
    expect(host.textContent).toContain("Still holding $70.41")

    await act(async () => root.unmount())
    host.remove()
  })
})
