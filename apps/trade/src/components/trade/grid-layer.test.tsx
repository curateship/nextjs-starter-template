// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { GridLayer } from "@/components/trade/grid-layer"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { ChartColors } from "@/lib/trade/chart-theme"
import { baseStopDetection } from "@/lib/trade/dca"
import type { SmartGrid } from "@/lib/trade/smart-plan"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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

function grid(direction: "long" | "short", holding = true): SmartGrid {
  const stopPx = direction === "long" ? 80 : 120
  const entryPrices = direction === "long" ? [100, 90, 110] : [100, 110, 90]
  const heldSizes = holding ? [2, 1, 0.5] : [0, 0, 0]
  const levels = entryPrices.slice(0, 2).map((buyPx, index) => ({
    buyPx,
    sellPx: direction === "long" ? buyPx + 10 : buyPx - 10,
    sz: heldSizes[index],
    budget: 100,
    heldSz: heldSizes[index],
    status: holding ? ("holding" as const) : ("waiting" as const),
    armed: true,
    dead: false,
    cycles: 0,
  }))
  const carriedLevels = holding
    ? [
        {
          buyPx: entryPrices[2],
          sellPx:
            direction === "long" ? entryPrices[2] + 10 : entryPrices[2] - 10,
          sz: heldSizes[2],
          budget: 100,
          heldSz: heldSizes[2],
          status: "holding" as const,
          armed: true,
          dead: false,
          cycles: 0,
        },
      ]
    : []

  return {
    id: "grid",
    walletId: "wallet",
    marketKey: "market",
    status: "active",
    flowRunId: null,
    createdAt: 1,
    updatedAt: 1,
    kind: "grid",
    plan: {
      direction,
      topPx: 110,
      bottomPx: 90,
      takeProfitPx: null,
      spacing: "even",
      sizing: "even",
      manualSizing: false,
      manualRungPcts: null,
      potPct: 20,
      maxOrderVolPct: 0,
      startedAt: 1,
      sizeDecimals: 4,
      priceTick: null,
      minOrderValueUsd: 10,
      leverage: 1,
      maxLeverage: 20,
      levels,
      carriedLevels,
      stopLoss: { mode: "fixed", underPct: 5, px: stopPx, base: null },
      baseDetection: baseStopDetection(),
      baseWatch: null,
      aimedSlPx: null,
      pairedStop: null,
      seenFillsTo: 0,
      cycles: 0,
      follow: false,
      followDown: false,
      entered: true,
      shifts: 0,
      downShifts: 0,
      closedReason: null,
      reverseWhenStopped: false,
      reversedFrom: null,
      reverseFailReason: null,
    },
  }
}

function layer(
  grid: SmartGrid,
  onMoveExit: (
    grid: SmartGrid,
    which: "takeProfit" | "stopLoss",
    px: number
  ) => Promise<boolean> = async () => true,
  feesPaidFor: (grid: SmartGrid) => number | null = (one) =>
    [...one.plan.levels, ...one.plan.carriedLevels].some(
      (level) => level.status === "holding"
    )
      ? 5
      : 0,
  onMoveRange: (
    grid: SmartGrid,
    move: { end: "top" | "bottom" | "whole"; px: number }
  ) => Promise<boolean> = async () => true
) {
  return (
    <GridLayer
      surface={surface}
      colors={colors}
      marketKey="market"
      currentPx={100}
      grids={[grid]}
      preview={null}
      tool={null}
      walletName={() => "Wallet"}
      feesPaidFor={feesPaidFor}
      onCancelLevel={() => undefined}
      onCancelGrid={() => undefined}
      onReverseGrid={() => undefined}
      reverseDisabledReason={() => null}
      onOpenSettings={() => undefined}
      onMoveRange={onMoveRange}
      onMoveExit={onMoveExit}
    />
  )
}

function previewLayer(
  onMoveGrid: (range: { topPx: number; bottomPx: number }) => void
) {
  return (
    <GridLayer
      surface={surface}
      colors={{ ...colors, primary: "#171717", badgeText: "#ffffff" }}
      marketKey="market"
      currentPx={100}
      grids={[]}
      preview={{
        direction: "long",
        levelCount: 2,
        lines: [
          { px: 110, kind: "upper", grip: true },
          { px: 100, kind: "level" },
          { px: 90, kind: "lower", grip: true },
          { px: 80, kind: "stopLoss", grip: true },
        ],
        onMoveGrid,
      }}
      tool={null}
      walletName={() => "Wallet"}
      onCancelLevel={() => undefined}
      onCancelGrid={() => undefined}
      onReverseGrid={() => undefined}
      reverseDisabledReason={() => null}
      onOpenSettings={() => undefined}
      onMoveRange={async () => true}
      onMoveExit={async () => true}
    />
  )
}

function render(grid: SmartGrid): string {
  return renderToStaticMarkup(layer(grid))
}

describe("the grid stop-loss line", () => {
  it.each(["long", "short"] as const)(
    "shows what the held %s grid would lose at its stop after fees",
    (direction) => {
      expect(render(grid(direction))).toContain("STOP LOSS -$70.00")
    }
  )

  it("shows that a flat grid has no money at risk yet", () => {
    expect(render(grid("long", false))).toContain("STOP LOSS $0.00")
  })

  it("shows no amount when the fills cannot provide the fees", () => {
    const html = renderToStaticMarkup(
      layer(
        grid("long"),
        async () => true,
        () => null
      )
    )
    expect(html).toContain("STOP LOSS —")
  })

  it("recalculates the amount when the stop moves", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveExit = vi.fn(async () => true)
    await act(async () => root.render(layer(grid("long"), onMoveExit)))
    const stop = [...host.querySelectorAll("span")].find((one) =>
      one.textContent?.startsWith("STOP LOSS")
    )
    expect(stop?.textContent).toBe("STOP LOSS -$70.00")

    await act(async () => {
      stop?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 120 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 130 })
      )
    })

    expect(onMoveExit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "grid" }),
      "stopLoss",
      70
    )
    expect(host.textContent).toContain("STOP LOSS -$105.00")
    await act(async () => root.unmount())
  })
})

describe("the grid preview's whole-grid grip", () => {
  it("moves both range edges by the same price amount", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveGrid = vi.fn()
    await act(async () => root.render(previewLayer(onMoveGrid)))

    const grip = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole grid"]'
    )
    expect(grip).not.toBeNull()
    expect(grip?.className).toContain("bg-muted")
    expect(grip?.className).toContain("text-muted-foreground")
    expect(grip?.style.left).toBe("calc(100% - 64px)")
    await act(async () => {
      grip?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 110 })
      )
    })

    expect(onMoveGrid).toHaveBeenCalledWith({ topPx: 100, bottomPx: 80 })
    await act(async () => root.unmount())
  })

  it("moves the range from the keyboard", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveGrid = vi.fn()
    await act(async () => root.render(previewLayer(onMoveGrid)))

    const grip = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole grid"]'
    )
    await act(async () => {
      grip?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" })
      )
    })

    expect(onMoveGrid).toHaveBeenCalledWith({ topPx: 118, bottomPx: 98 })
    await act(async () => root.unmount())
  })
})

describe("a placed grid's whole-grid grip", () => {
  it("stays on the grid after the placement preview is gone and moves it", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveRange = vi.fn(async () => true)
    await act(async () =>
      root.render(
        layer(
          grid("long", false),
          async () => true,
          () => 0,
          onMoveRange
        )
      )
    )

    const grip = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole grid"]'
    )
    expect(grip).not.toBeNull()
    expect(grip?.className).toContain("bg-muted")
    expect(grip?.className).toContain("text-muted-foreground")
    expect(grip?.style.left).toBe("calc(100% - 64px)")
    expect(grip?.getAttribute("aria-disabled")).toBe("false")

    await act(async () => {
      grip?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 110 })
      )
    })

    expect(onMoveRange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "grid" }),
      { end: "whole", px: 90 }
    )
    await act(async () => root.unmount())
  })

  it("remains visible but cannot move while the grid is holding coin", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveRange = vi.fn(async () => true)
    await act(async () =>
      root.render(
        layer(
          grid("long"),
          async () => true,
          () => 5,
          onMoveRange
        )
      )
    )

    const grip = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole grid"]'
    )
    expect(grip).not.toBeNull()
    expect(grip?.getAttribute("aria-disabled")).toBe("true")
    await act(async () => {
      grip?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 110 })
      )
    })
    expect(onMoveRange).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
