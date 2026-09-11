// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ChartSurface } from "@/components/trade/price-chart"
import { TradeLinesLayer } from "@/components/trade/trade-lines-layer"
import type { ChartColors } from "@/lib/trade/chart-theme"
import type { TradeOrder, TradePosition } from "@/lib/trade/paper"
import type { PriceAlert } from "@/lib/trade/price-alerts"

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
  alert: "theme-purple",
  neutral: "theme-neutral",
  badgeText: "theme-badge-text",
  foreground: "theme-foreground",
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
const alert: PriceAlert = {
  id: "00000000-0000-4000-8000-000000000001",
  protocol: "hyperliquid",
  network: "mainnet",
  marketKey: MARKET,
  price: 100,
  direction: "above",
  createdAt: 1,
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
  orders: readonly TradeOrder[],
  currentPx: number | null = null,
  feesPaidFor?: (position: TradePosition) => number | null
): string {
  return renderToStaticMarkup(
    <TradeLinesLayer
      surface={surface}
      colors={colors}
      marketKey={MARKET}
      currentPx={currentPx}
      positions={[held]}
      feesPaidFor={feesPaidFor}
      orders={orders}
      walletName={() => "Wallet"}
      tool={null}
      onMoveOrder={() => undefined}
      onCancelOrder={() => undefined}
      onSetBrackets={() => undefined}
    />
  )
}

function entryLabel(html: string): Element {
  const host = document.createElement("div")
  host.innerHTML = html
  const entry = [...host.querySelectorAll("text")].find((one) =>
    one.textContent?.startsWith("Entry")
  )
  if (!entry) throw new Error("Entry label is missing")
  return entry
}

function lineLabel(html: string, startsWith: string): Element {
  const host = document.createElement("div")
  host.innerHTML = html
  const label = [...host.querySelectorAll("text")].find((one) =>
    one.textContent?.startsWith(startsWith)
  )
  if (!label) throw new Error(`${startsWith} label is missing`)
  return label
}

describe("chart bracket lines", () => {
  it("opens the settings window from a watched manual order", async () => {
    const onEditOrder = vi.fn()
    const watched: TradeOrder = {
      id: "watch-1",
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px: 100,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          currentPx={100}
          positions={[]}
          orders={[watched]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onEditOrder={onEditOrder}
          onSetBrackets={() => undefined}
        />
      )
    })

    const settings = host.querySelector<SVGGElement>(
      `[aria-label="Change this order's size, leverage, stop loss, and exit."]`
    )
    expect(settings).not.toBeNull()
    const cog = settings?.parentElement?.querySelector(
      "[data-order-settings-icon]"
    )
    expect(cog).not.toBeNull()
    expect(cog?.getAttribute("width")).toBe("12")
    expect(cog?.getAttribute("height")).toBe("12")
    await act(async () => {
      settings?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(onEditOrder).toHaveBeenCalledWith("watch-1", settings)
    await act(async () => root.unmount())
  })

  it("draws an alert with the existing purple draggable bar and close control", () => {
    const html = renderToStaticMarkup(
      <TradeLinesLayer
        surface={surface}
        colors={colors}
        marketKey={MARKET}
        currentPx={100}
        positions={[]}
        orders={[]}
        alerts={[alert]}
        walletName={() => "Wallet"}
        tool={null}
        onMoveAlert={() => undefined}
        onDeleteAlert={() => undefined}
        onMoveOrder={() => undefined}
        onCancelOrder={() => undefined}
        onSetBrackets={() => undefined}
      />
    )

    expect(html).toContain('data-chart-alert="true"')
    expect(html).toContain("theme-purple")
    expect(html).toContain("stroke-width:44px")
    expect(html).toContain("Alert at $100")
    expect(html).toContain("Remove alert")
  })

  it("moves and closes an alert from its chart bar", async () => {
    const onMove = vi.fn()
    const onDelete = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          currentPx={100}
          positions={[]}
          orders={[]}
          alerts={[alert]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveAlert={onMove}
          onDeleteAlert={onDelete}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onSetBrackets={() => undefined}
        />
      )
    })

    const drag = host.querySelector<SVGLineElement>(
      '[aria-label="Alert at $100"]'
    )
    expect(drag).not.toBeNull()
    Object.assign(drag!, {
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
    })
    await act(async () => {
      drag!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
    })
    await act(async () => {
      drag!.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 120 })
      )
    })
    expect(onMove).toHaveBeenCalledWith(alert.id, 80)

    const close = host.querySelector<SVGGElement>('[aria-label="Remove alert"]')
    await act(async () => {
      close?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(onDelete).toHaveBeenCalledWith(alert.id)
    await act(async () => root.unmount())
  })

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
          currentPx={null}
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

  it("does not invent a zero before the current price arrives", () => {
    const entry = entryLabel(render("target"))

    expect(entry.textContent).toBe("Entry")
    expect(entry.querySelector("tspan")).toBeNull()
  })

  it.each([
    ["a long that made money", 1, 156, "+$56.00", "theme-up"],
    ["a long that lost money", 1, 44, "-$56.00", "theme-down"],
    ["a short that made money", -1, 44, "+$56.00", "theme-up"],
    ["a position at zero", 1, 100, "$0.00", "#2962ff"],
  ] as const)(
    "adds the current profit and its color for %s to Entry",
    (_, size, mark, pnl, color) => {
      const held = position("target")
      held.szi = size

      const entry = entryLabel(renderLines(held, [], mark))
      const money = entry.querySelector("tspan")
      expect(entry.textContent).toBe(`Entry ${pnl}`)
      expect(entry.getAttribute("fill")).toBe("#2962ff")
      expect(money?.textContent).toBe(pnl)
      expect(money?.getAttribute("fill")).toBe(color)
    }
  )

  it.each([
    ["target", "Exit"],
    ["stop", "Stop Loss"],
  ] as const)("draws a live %s order as one bracket bar", (kind, label) => {
    const html = render(kind)

    expect(html).toContain(label)
    expect(html).not.toContain("Sell $")
    expect(html).not.toContain("theme-neutral")
  })

  it.each([
    ["a long", 2, 70, "-$65.00"],
    ["a short", -2, 130, "-$65.00"],
  ] as const)(
    "shows how much %s loses after fees at the exchange liquidation price",
    (_, size, liquidation, loss) => {
      const held = position("target")
      held.szi = size
      held.feesPaid = 5
      held.live = { ...held.live!, liquidationPx: liquidation }

      const label = lineLabel(renderLines(held, []), "LIQUIDATION")
      expect(label.textContent).toBe(`LIQUIDATION ${loss}`)
      expect(label.querySelector("tspan")?.textContent).toBe(loss)
      expect(label.querySelector("tspan")?.getAttribute("fill")).toBe(
        "theme-down"
      )
    }
  )

  it("shows the amount at Trade's estimated liquidation price for practice", () => {
    const held = position("target")
    held.szi = 2
    held.leverage = 2
    held.maxLeverage = 50
    held.feesPaid = 5
    delete held.live

    const label = lineLabel(renderLines(held, []), "LIQUIDATION")
    expect(label.textContent).toBe("LIQUIDATION -$103.00")
  })

  it("keeps the stop loss amount tied to the dragged price", () => {
    const held = position("stop")
    held.szi = 2
    held.feesPaid = 5

    const label = lineLabel(renderLines(held, []), "Stop Loss")
    expect(label.textContent).toBe("Stop Loss -$25.00")
  })

  it("shows no after-fee amount when the fee history is incomplete", () => {
    const held = position("stop")
    held.live = { ...held.live!, liquidationPx: 70 }
    const html = renderLines(held, [], null, () => null)

    expect(lineLabel(html, "Stop Loss").textContent).toBe("Stop Loss —")
    expect(lineLabel(html, "LIQUIDATION").textContent).toBe("LIQUIDATION —")
  })

  it("names a spare protection leg for what it is, not as a plain sell", () => {
    // A position can end up carrying two stops or two targets, and the extra
    // one used to draw as "Sell $110" in the neutral grey of an ordinary
    // waiting order. It is not one: it fires by itself and sells the position.
    const html = render("target", "another-order")

    expect(html).toContain("Exit")
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

describe("one stop line for the hand-placed orders that share it", () => {
  function watched(id: string, px: number, slPx: number): TradeOrder {
    return {
      id,
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: null,
      slPx,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
  }

  function renderOrders(
    orders: readonly TradeOrder[],
    onMergeStops?: (merges: readonly { orderId: string; price: number }[]) => void
  ): string {
    return renderToStaticMarkup(
      <TradeLinesLayer
        surface={surface}
        colors={colors}
        marketKey={MARKET}
        currentPx={100}
        positions={[]}
        orders={orders}
        walletName={() => "Wallet"}
        tool={null}
        onMoveOrder={() => undefined}
        onCancelOrder={() => undefined}
        onMoveOrderStop={() => undefined}
        onMergeStops={onMergeStops}
        onSetBrackets={() => undefined}
      />
    )
  }

  it("draws one pill carrying what both orders lose together", () => {
    const html = renderOrders([watched("a", 100, 90), watched("b", 104, 91)])
    const host = document.createElement("div")
    host.innerHTML = html
    const stops = [...host.querySelectorAll("text")].filter((one) =>
      one.textContent?.startsWith("Stop Loss")
    )

    expect(stops).toHaveLength(1)
    // Both stop at 91: the first order loses $9 of its $100, the second $13.
    expect(stops[0].textContent).toBe("Stop Loss -$22.00")
  })

  it("moves every order in the group when the one line is dragged", async () => {
    const onMoveOrderStop = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          currentPx={100}
          positions={[]}
          orders={[watched("a", 100, 91), watched("b", 104, 91)]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onMoveOrderStop={onMoveOrderStop}
          onSetBrackets={() => undefined}
        />
      )
    })

    const drag = host.querySelector<SVGLineElement>(
      '[aria-label="Stop Loss -$22.00 at $91"]'
    )
    expect(drag).not.toBeNull()
    Object.assign(drag!, {
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
    })
    await act(async () => {
      drag!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 109 })
      )
    })
    await act(async () => {
      drag!.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 115 })
      )
    })

    expect(onMoveOrderStop.mock.calls).toEqual([
      ["wallet", "a", 85],
      ["wallet", "b", 85],
    ])
    await act(async () => root.unmount())
  })

  it("asks for the saves that put both orders on the tighter stop", async () => {
    const onMergeStops = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          currentPx={100}
          positions={[]}
          orders={[watched("a", 100, 90), watched("b", 104, 91)]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onMoveOrderStop={() => undefined}
          onMergeStops={onMergeStops}
          onSetBrackets={() => undefined}
        />
      )
    })

    expect(onMergeStops).toHaveBeenCalledTimes(1)
    expect(onMergeStops.mock.calls[0][0]).toEqual([
      { walletId: "wallet", orderId: "a", price: 91 },
    ])
  })

  it("leaves a real resting order its own line", () => {
    const resting: TradeOrder = {
      ...watched("live", 104, 91),
      watched: undefined,
      live: true,
    }
    const html = renderOrders([watched("a", 100, 90), resting])
    const host = document.createElement("div")
    host.innerHTML = html
    const stops = [...host.querySelectorAll("text")].filter((one) =>
      one.textContent?.startsWith("Stop Loss")
    )

    expect(stops).toHaveLength(2)
  })
})

describe("one exit line for the orders that share it", () => {
  function watched(
    id: string,
    px: number,
    tpPx: number,
    extra: Partial<TradeOrder> = {}
  ): TradeOrder {
    return {
      id,
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx,
      slPx: null,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
      ...extra,
    }
  }

  function exits(orders: readonly TradeOrder[]): (string | null)[] {
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(
      <TradeLinesLayer
        surface={surface}
        colors={colors}
        marketKey={MARKET}
        currentPx={100}
        positions={[]}
        orders={orders}
        walletName={() => "Wallet"}
        tool={null}
        onMoveOrder={() => undefined}
        onCancelOrder={() => undefined}
        onMoveOrderTarget={() => undefined}
        onSetBrackets={() => undefined}
      />
    )
    return [...host.querySelectorAll("text")]
      .map((one) => one.textContent)
      .filter((one) => one?.startsWith("Exit") ?? false)
  }

  it("draws one pill carrying what both orders make together", () => {
    // Both bought below $120: the first makes $30, the second $20.
    expect(exits([watched("a", 90, 120), watched("b", 100, 120)])).toEqual([
      "Exit +$50.00",
    ])
  })

  it("leaves two exits at different prices as two lines", () => {
    expect(exits([watched("a", 90, 120), watched("b", 100, 130)])).toEqual([
      "Exit +$30.00",
      "Exit +$30.00",
    ])
  })

  it("draws nothing for an order still being sent", () => {
    expect(
      exits([watched("sending", 90, 120, { placing: true, watched: undefined })])
    ).toEqual([])
  })
})

describe("a stop with no order in sight", () => {
  function watched(id: string, px: number, slPx: number): TradeOrder {
    return {
      id,
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: null,
      slPx,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
  }

  function labels(orders: readonly TradeOrder[]): (string | null)[] {
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(
      <TradeLinesLayer
        surface={surface}
        colors={colors}
        marketKey={MARKET}
        currentPx={100}
        positions={[]}
        orders={orders}
        walletName={() => "Wallet"}
        tool={null}
        onMoveOrder={() => undefined}
        onCancelOrder={() => undefined}
        onMoveOrderStop={() => undefined}
        onSetBrackets={() => undefined}
      />
    )
    return [...host.querySelectorAll("text")].map((one) => one.textContent)
  }

  // The test surface puts price 100 at the middle of a 240px chart and price
  // 400 far above its top, where the order's own bar is clipped away.
  it("drops the stop line while the order it belongs to is off the chart", () => {
    const drawn = labels([watched("far", 400, 90)])
    expect(drawn).toContain("Buy $400")
    expect(drawn).not.toContain("Stop Loss -$310.00")
    expect(drawn.some((one) => one?.startsWith("Stop Loss"))).toBe(false)
  })

  it("keeps it while the order is in view", () => {
    expect(labels([watched("near", 100, 90)])).toContain("Stop Loss -$10.00")
  })
})

describe("a waiting order's stop cannot be dragged to the winning side", () => {
  function watched(id: string, px: number, slPx: number): TradeOrder {
    return {
      id,
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: null,
      slPx,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
  }

  async function dragTo(clientY: number) {
    const onMoveOrderStop = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          currentPx={100}
          positions={[]}
          orders={[watched("a", 100, 90), watched("b", 104, 90)]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onMoveOrderStop={onMoveOrderStop}
          onSetBrackets={() => undefined}
        />
      )
    })
    const drag = host.querySelector<SVGLineElement>(
      '[aria-label="Stop Loss -$24.00 at $90"]'
    )
    expect(drag).not.toBeNull()
    Object.assign(drag!, {
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
    })
    await act(async () => {
      drag!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 110 })
      )
    })
    await act(async () => {
      drag!.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientY })
      )
    })
    await act(async () => {
      drag!.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientY }))
    })
    const drawn = [...host.querySelectorAll("text")].map((one) => one.textContent)
    await act(async () => root.unmount())
    return { onMoveOrderStop, drawn }
  }

  // The surface maps price to 200 - y, so y 110 is $90 and y 80 is $120,
  // which is above both orders and so not a stop for either of them.
  it("refuses a drop above the cheaper order and keeps the pill honest", async () => {
    const { onMoveOrderStop, drawn } = await dragTo(80)
    expect(onMoveOrderStop).not.toHaveBeenCalled()
    expect(drawn).toContain("Stop Loss -$24.00")
  })

  it("still moves it anywhere below both orders", async () => {
    const { onMoveOrderStop } = await dragTo(130)
    expect(onMoveOrderStop.mock.calls).toEqual([
      ["wallet", "a", 70],
      ["wallet", "b", 70],
    ])
  })
})

describe("no stop line on the wrong side of the price", () => {
  function watched(id: string, px: number, slPx: number): TradeOrder {
    return {
      id,
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: null,
      slPx,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
  }

  function stopsDrawn(
    orders: readonly TradeOrder[],
    positions: readonly TradePosition[],
    currentPx: number | null
  ): (string | null)[] {
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(
      <TradeLinesLayer
        surface={surface}
        colors={colors}
        marketKey={MARKET}
        currentPx={currentPx}
        positions={positions}
        orders={orders}
        walletName={() => "Wallet"}
        tool={null}
        onMoveOrder={() => undefined}
        onCancelOrder={() => undefined}
        onMoveOrderStop={() => undefined}
        onSetBrackets={() => undefined}
      />
    )
    return [...host.querySelectorAll("text")]
      .map((one) => one.textContent)
      .filter((one) => one?.startsWith("Stop Loss") ?? false)
  }

  it("hides a waiting buy order's stop once it is above the price", () => {
    // The order buys at $130 with a stop at $120, and the market is at $100:
    // a stop $20 above the price would get out the instant it was set.
    expect(stopsDrawn([watched("a", 130, 120)], [], 100)).toEqual([])
  })

  it("keeps it while it is below the price", () => {
    expect(stopsDrawn([watched("a", 130, 90)], [], 100)).toEqual([
      "Stop Loss -$40.00",
    ])
  })

  it("hides a long position's stop once it is above the price", () => {
    const long = position("stop")
    long.slPx = 120
    expect(stopsDrawn([], [long], 100)).toEqual([])
  })

  it("draws every stop while the exchange has given no price", () => {
    expect(stopsDrawn([watched("a", 130, 120)], [], null)).toEqual([
      "Stop Loss -$10.00",
    ])
  })
})

describe("dragging the exit leaves the stop where it is", () => {
  function watched(id: string, px: number): TradeOrder {
    return {
      id,
      walletId: "wallet",
      marketKey: MARKET,
      side: "buy",
      px,
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: 120,
      slPx: 90,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
  }

  it("moves only the line that was taken hold of", async () => {
    const onMoveOrderTarget = vi.fn()
    const onMoveOrderStop = vi.fn()
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={MARKET}
          currentPx={100}
          positions={[]}
          orders={[watched("a", 100), watched("b", 104)]}
          walletName={() => "Wallet"}
          tool={null}
          onMoveOrder={() => undefined}
          onCancelOrder={() => undefined}
          onMoveOrderStop={onMoveOrderStop}
          onMoveOrderTarget={onMoveOrderTarget}
          onSetBrackets={() => undefined}
        />
      )
    })

    const exit = host.querySelector<SVGLineElement>(
      '[aria-label="Exit +$36.00 at $120"]'
    )
    expect(exit).not.toBeNull()
    Object.assign(exit!, {
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
    })
    await act(async () => {
      exit!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 80 })
      )
    })
    await act(async () => {
      exit!.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientY: 70 })
      )
    })
    // The stop keeps its own price and its own figure all the way through.
    const midDrag = [...host.querySelectorAll("text")]
      .map((one) => one.textContent)
      .filter((one) => one?.startsWith("Stop Loss") ?? false)
    expect(midDrag).toEqual(["Stop Loss -$24.00"])
    await act(async () => {
      exit!.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 70 })
      )
    })

    expect(onMoveOrderTarget.mock.calls).toEqual([
      ["wallet", "a", 130],
      ["wallet", "b", 130],
    ])
    expect(onMoveOrderStop).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
