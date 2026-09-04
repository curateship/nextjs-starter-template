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
      handSetAt: null,
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
  onMoveGrid: (range: { topPx: number; bottomPx: number }) => void,
  includeWinningEdge = false,
  direction: "long" | "short" = "long"
) {
  return (
    <GridLayer
      surface={surface}
      colors={{ ...colors, primary: "#171717", badgeText: "#ffffff" }}
      marketKey="market"
      currentPx={100}
      grids={[]}
      preview={{
        direction,
        levelCount: 2,
        lines: [
          ...(includeWinningEdge
            ? [{ px: direction === "long" ? 120 : 80, kind: "edge" as const }]
            : []),
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

describe("the money on each grid line", () => {
  /**
   * A grid where `sz` and `heldSz` are different numbers on every level.
   *
   * The `grid()` helper above sets them equal, which is exactly why the bug
   * this guards against went unseen: with 2 planned and 2 held, reading the
   * wrong field looks right. These figures are the KuCoin BR grid from
   * 3 Sep 2026, where a rung planned with 44 coins was holding 149 and the
   * chart printed the 44.
   */
  function mixed(): SmartGrid {
    const one = grid("short")
    return {
      ...one,
      plan: {
        ...one.plan,
        levels: [
          {
            ...one.plan.levels[0],
            buyPx: 100,
            sz: 1,
            heldSz: 4,
            status: "holding" as const,
          },
          {
            ...one.plan.levels[1],
            buyPx: 110,
            sz: 2,
            heldSz: 0,
            status: "waiting" as const,
          },
        ],
        carriedLevels: [
          {
            ...one.plan.carriedLevels[0],
            buyPx: 90,
            sz: 3,
            heldSz: 7,
            status: "holding" as const,
          },
        ],
      },
    }
  }

  function moneyOnLines(html: string): string[] {
    const box = document.createElement("div")
    box.innerHTML = html
    return [...box.querySelectorAll("span")]
      .map((one) => one.textContent ?? "")
      .filter((text) => /^\$[\d,.]+$/.test(text))
  }

  it("prints what a holding rung holds, not the stake it was planned with", () => {
    // 4 coins at $100, not the $100 its planned size of 1 would give.
    const money = moneyOnLines(render(mixed()))
    expect(money).toContain("$400")
    expect(money).not.toContain("$100")
  })

  it("prints the planned stake on a rung that has bought nothing", () => {
    // 2 coins at $110, because nothing is held there yet.
    expect(moneyOnLines(render(mixed()))).toContain("$220")
  })

  it("reads a carried rung by the same rule as a rung inside the range", () => {
    // 7 coins at $90, not the $270 its planned size of 3 would give.
    const money = moneyOnLines(render(mixed()))
    expect(money).toContain("$630")
    expect(money).not.toContain("$270")
  })
})

describe("the grid stop-loss line", () => {
  it.each(["long", "short"] as const)(
    "shows what the held %s grid would lose at its stop after fees",
    (direction) => {
      expect(render(grid(direction))).toContain("SL -$70.00")
    }
  )

  it("shows that a flat grid has no money at risk yet", () => {
    expect(render(grid("long", false))).toContain("SL $0.00")
  })

  it("shows no amount when the fills cannot provide the fees", () => {
    const html = renderToStaticMarkup(
      layer(
        grid("long"),
        async () => true,
        () => null
      )
    )
    expect(html).toContain("SL —")
  })

  it("recalculates the amount when the stop moves", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveExit = vi.fn(async () => true)
    await act(async () => root.render(layer(grid("long"), onMoveExit)))
    const stop = [...host.querySelectorAll("span")].find((one) =>
      one.textContent?.startsWith("SL")
    )
    expect(stop?.textContent).toBe("SL -$70.00")

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
    expect(host.textContent).toContain("SL -$105.00")
    await act(async () => root.unmount())
  })
})

describe("the grid preview's whole-grid grip", () => {
  it("does not shade the unused winning-edge rung", () => {
    const html = renderToStaticMarkup(previewLayer(vi.fn(), true))
    // The real rungs run from $110 to $90. The unused $120 exit still exists
    // for range maths, but it must not add another shaded rung to the preview.
    expect(html).toContain(
      "top:90px;height:20px;background-color:theme-up;opacity:0.05"
    )
    expect(html).not.toContain(
      "top:80px;height:30px;background-color:theme-up;opacity:0.05"
    )
  })

  it("shades a selling preview only down to its lowest short, like the buying one", () => {
    // Tyler, 4 Sep 2026: the selling grid copies the buying grid's pattern.
    // Nothing is drawn or shaded at the $80 buy-back edge before rung 1 sells.
    const html = renderToStaticMarkup(previewLayer(vi.fn(), true, "short"))
    expect(html).toContain(
      "top:90px;height:20px;background-color:theme-down;opacity:0.05"
    )
    expect(html).not.toContain(
      "top:90px;height:30px;background-color:theme-down;opacity:0.05"
    )
    expect(html).not.toContain("Rung 1 exit and move down")
  })

  it("moves both range edges by the same price amount", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onMoveGrid = vi.fn()
    await act(async () => root.render(previewLayer(onMoveGrid)))

    const grip = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole grid"]'
    )
    expect(grip).not.toBeNull()
    // The preview's grip sits on a DRAG GRID bar dressed like the name bars.
    expect(grip?.parentElement?.textContent).toBe("DRAG GRID")
    expect(grip?.parentElement?.className).toContain("w-28")
    expect(grip?.parentElement?.className).toContain("bg-background")
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
    // The preview's grip sits on a plain muted bar of the shared bar width.
    expect(grip?.parentElement?.children[0]).toBe(grip)
    expect(grip?.parentElement?.className).toContain("w-28")
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

describe("the names on a placed grid's range", () => {
  // The saved grid: range 90–110, two levels. On a buying grid the levels are
  // 90 and 100, so rung 1 (the highest buy) is 100 and the top edge 110 is
  // where it sells. On a selling grid the levels are 100 and 110, so rung 1
  // is 100 and the bottom edge 90 is where it buys back.
  /** The y each named line is drawn at, read off its own wrapper. */
  function yOfName(html: string, name: string): string | null {
    const box = document.createElement("div")
    box.innerHTML = html
    const span = [...box.querySelectorAll("span")].find((one) =>
      one.textContent?.includes(name)
    )
    let node: HTMLElement | null = span ?? null
    while (node && !node.style.top) node = node.parentElement
    return node?.style.top ?? null
  }

  /** The border colour of a named line's bar. */
  function colourOfName(html: string, name: string): string | null {
    const box = document.createElement("div")
    box.innerHTML = html
    const span = [...box.querySelectorAll("span")].find(
      (one) => one.textContent === name && one.hasAttribute("style")
    )
    return (
      span?.getAttribute("style")?.match(/(?:^|;)border-color:([^;]+)/)?.[1] ??
      null
    )
  }

  it("puts UPPER PRICE on rung 1's own price on a buying grid", () => {
    const html = render(grid("long", false))
    expect(html).toContain("UPPER PRICE")
    expect(html).toContain("LOWER PRICE")
    // $100 is drawn at y=100 and $90 at y=110. The top edge, $110 at y=90,
    // stays out until rung 1 buys.
    expect(yOfName(html, "UPPER PRICE")).toBe("100px")
    expect(yOfName(html, "LOWER PRICE")).toBe("110px")
    expect(html).not.toContain('style="top:90px"')
  })

  it("does not draw the winning-edge strip before rung 1 buys", () => {
    const html = render(grid("long", false))
    expect(html).not.toContain("Rung 1 exit and move up")
    // The visible band stops at rung 1 on $100 instead of implying another
    // rung at its $110 exit.
    expect(html).toContain(
      "top:100px;height:10px;background-color:theme-up;opacity:0.05"
    )
  })

  it("shows rung 1's exit and move-up line after rung 1 buys", () => {
    const one = grid("long", false)
    const rungOne = one.plan.levels.reduce((nearest, level) =>
      level.buyPx > nearest.buyPx ? level : nearest
    )
    rungOne.status = "holding"
    rungOne.sz = 2
    rungOne.heldSz = 2

    const html = render(one)
    expect(html).toContain("Rung 1 exit and move up")
    expect(yOfName(html, "Rung 1 exit and move up")).toBe("90px")
    expect(colourOfName(html, "Rung 1 exit and move up")).toBe("theme-down")
    expect(html).toContain(
      "top:90px;height:20px;background-color:theme-up;opacity:0.05"
    )
  })

  it("puts LOWER PRICE on rung 1's own price on a selling grid", () => {
    const html = render(grid("short", false))
    expect(html).toContain("UPPER PRICE")
    expect(html).toContain("LOWER PRICE")
    expect(yOfName(html, "UPPER PRICE")).toBe("90px")
    expect(yOfName(html, "LOWER PRICE")).toBe("100px")
    expect(html).not.toContain('style="top:110px"')
  })

  it("draws where a carried rung closes, on either grid", () => {
    // The fixture carries 0.5 coins: a buy at $110 that sells at $120
    // (y=80), or a short at $90 that buys back at $80 (y=120). Nothing drew
    // that way out before 4 Sep 2026, so the carried entry read as an exit.
    const long = render(grid("long"))
    expect(yOfName(long, "Carried buy sells here")).toBe("80px")
    expect(colourOfName(long, "Carried buy sells here")).toBe("theme-down")
    expect(long).toContain("sells its 0.5 coins here, at $120")

    const short = render(grid("short"))
    expect(yOfName(short, "Carried short buys back here")).toBe("120px")
    expect(colourOfName(short, "Carried short buys back here")).toBe("theme-up")
    expect(short).toContain("buys back its 0.5 coins here, at $80")

    expect(render(grid("long", false))).not.toContain("Carried buy")
  })

  it("shows the selling grid's strip and move-down line only once rung 1 sells", () => {
    // Tyler, 4 Sep 2026: copy the buying grid's pattern. Before rung 1 sells
    // the band stops at rung 1 on $100 and nothing sits at the $90 edge.
    const one = grid("short", false)
    const waiting = render(one)
    expect(waiting).not.toContain("Rung 1 exit and move down")
    expect(waiting).toContain(
      "top:90px;height:10px;background-color:theme-down;opacity:0.05"
    )

    const rungOne = one.plan.levels.reduce((nearest, level) =>
      level.buyPx < nearest.buyPx ? level : nearest
    )
    rungOne.status = "holding"
    rungOne.sz = 2
    rungOne.heldSz = 2

    const html = render(one)
    expect(html).toContain("Rung 1 exit and move down")
    expect(html).not.toContain("Rung 1 exit and move up")
    // Rung 1 sells at $100 (y=100) and buys back at $90, the bottom edge, so
    // the band now reaches down to that line.
    expect(yOfName(html, "Rung 1 exit and move down")).toBe("110px")
    expect(colourOfName(html, "Rung 1 exit and move down")).toBe("theme-up")
    expect(html).toContain(
      "top:90px;height:20px;background-color:theme-down;opacity:0.05"
    )
  })

  it("colours the range by direction and End Grid orange", () => {
    const long = grid("long", false)
    long.plan.takeProfitPx = 120
    const longHtml = render(long)
    expect(longHtml).toContain("border-color:theme-up")
    expect(longHtml).toMatch(/border-color:theme-warning[^]*?END GRID/)
    expect(longHtml).toMatch(/background-color:theme-up[^]*?2\/2/)

    const shortHtml = render(grid("short", false))
    expect(shortHtml).toMatch(/background-color:theme-down[^]*?2\/2/)
    expect(shortHtml).not.toContain("theme-primary")
  })

  it("puts the grip inside the options bar, midway between the two names, off the rungs", () => {
    // Tyler, 3 Sep 2026: the options bar sits in the middle, flush right,
    // the same width as the name bars, with the whole-grid grip inside it.
    const html = render(grid("long", false))
    const box = document.createElement("div")
    box.innerHTML = html
    const grip = box.querySelector('button[aria-label="Move the whole grid"]')
    const bar = grip?.parentElement as HTMLElement
    expect(bar.children[0]).toBe(grip)
    expect(bar.textContent).toContain("2/2")
    expect(
      bar.querySelector('button[aria-label="Reverse the grid"]')
    ).not.toBeNull()
    expect(bar.className).toContain("w-28")
    // UPPER PRICE is on $100 (y=100) and LOWER PRICE on $90 (y=110), so the
    // row sits midway, at y=105.
    expect((bar.parentElement as HTMLElement).style.top).toBe("105px")
    const upper = [...box.querySelectorAll("span")].find((s) =>
      s.textContent?.startsWith("UPPER PRICE")
    )
    expect(upper?.parentElement?.textContent).not.toContain("2/2")
  })

  it("lands rung 1 under the hand when UPPER PRICE is dragged on a buying grid", async () => {
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
    const upper = [...host.querySelectorAll("span")].find((one) =>
      one.textContent?.includes("UPPER PRICE")
    )
    // Rung 1 sits at $100 (y=100). Dropping it at y=95 asks for rung 1 at
    // $105; with the bottom held at $90 the step is $15 and the top is $120.
    await act(async () => {
      upper?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 95 })
      )
    })
    expect(onMoveRange).toHaveBeenCalledTimes(1)
    const [, move] = onMoveRange.mock.calls[0] as unknown as [
      SmartGrid,
      { end: string; px: number },
    ]
    expect(move.end).toBe("top")
    expect(move.px).toBeCloseTo(120, 6)
    await act(async () => root.unmount())
  })

  it("names rung 1 once with a rung's money and ×, not as a level and an edge", () => {
    const html = render(grid("long", false))
    // Only the two rungs carry a cancel ×; the top edge line has none.
    const box = document.createElement("div")
    box.innerHTML = html
    expect(
      box.querySelectorAll('button[aria-label^="Cancel the buy at"]').length
    ).toBe(2)
  })
})

describe("two named lines on one price", () => {
  const rowOf = (html: string, name: string) => {
    const box = document.createElement("div")
    box.innerHTML = html
    const span = [...box.querySelectorAll("span")].find((s) =>
      s.textContent?.startsWith(name)
    )
    return [...(span?.parentElement?.children ?? [])]
  }

  it("draws a stop sitting on the bottom rung's price on that rung's row, to the left of its name", () => {
    // The stop 0% under the bottom of the range is the bottom rung's own
    // price. Two bars on one pixel hid half of each other.
    const one = grid("long", false)
    one.plan.stopLoss = { mode: "fixed", underPct: 0, px: 90, base: null }
    const html = render(one)
    const texts = rowOf(html, "LOWER PRICE").map((c) => c.textContent)
    expect(texts[0]).toContain("SL")
    expect(
      texts.findIndex((one) => one?.includes("LOWER PRICE"))
    ).toBeGreaterThan(0)
    // The stop bar appears once, not once on each line.
    expect(html.match(/SL/g)?.length).toBe(1)
  })

  it("keeps a stop clear of the range on its own line", () => {
    // $70 draws at y=130, twenty pixels under the bottom rung at y=110.
    const one = grid("long", false)
    one.plan.stopLoss = { mode: "fixed", underPct: 22, px: 70, base: null }
    const html = render(one)
    const row = rowOf(html, "SL")
    // An empty money slot, then the bar flush right, and nothing else.
    expect(row[row.length - 1]?.textContent).toContain("SL")
    expect(row.slice(0, -1).every((c) => c.textContent === "")).toBe(true)
  })

  it("puts the bar flush right with the money and × to its left", () => {
    // Tyler, 3 Sep 2026: the amounts are aligned right, all the way to the
    // right. So a line reads: name, ×, money — and the × keeps its width when
    // a rung cannot be cancelled so the money column stays put.
    const html = render(grid("long", false))
    const row = rowOf(html, "UPPER PRICE")
    // ×, then the money, then the bar flush right. No rung number on a
    // placed grid.
    expect(
      row[0]?.querySelector("button")?.getAttribute("aria-label") ??
        row[0]?.getAttribute("aria-label")
    ).toContain("Cancel the buy")
    // The flat fixture's rungs hold no size, so its money slot is empty; a
    // held rung fills it, and a held rung has no ×.
    expect(row[1]?.textContent).toBe("")
    expect(row[2]?.textContent).toContain("UPPER PRICE")
    const heldRow = rowOf(render(grid("long", true)), "UPPER PRICE")
    expect(heldRow[0]?.textContent).toBe("$200")
    expect(heldRow[1]?.textContent).toContain("UPPER PRICE")
  })
})

describe("a rung with no bar", () => {
  it("keeps a bar's worth of room so its money stays in the column", () => {
    const one = grid("long", true)
    // Three rungs: 90, 100, 110 — the middle one has no bar of its own.
    one.plan.levels.push({
      ...one.plan.levels[0],
      buyPx: 95,
      sellPx: 105,
    })
    const html = render(one)
    const box = document.createElement("div")
    box.innerHTML = html
    const chip = [...box.querySelectorAll("span")].find(
      (s) => s.textContent === "$190"
    )
    // In this tiny fixture the middle rung is also where the options bar
    // lands, so the bar-width thing after the money is the options bar; on a
    // wider grid it is an empty bar-width slot. Either way the money is
    // never the last thing on the line.
    const row = chip?.closest(".right-0")
    const last = row?.lastElementChild as HTMLElement
    expect(last.className).toContain("w-28")
    expect(row?.children[0]?.textContent).toBe("$190")
  })
})

describe("the money on the rungs while the range is dragged", () => {
  /**
   * A flat buying grid with four rungs at $100, $110, $120 and $130, staking
   * $100, $220, $360 and $520. The two middle rungs are the ones that have no
   * name of their own, which is where the money used to vanish mid-drag.
   */
  function four(): SmartGrid {
    const one = grid("long", false)
    const spare = one.plan.levels[0]
    return {
      ...one,
      plan: {
        ...one.plan,
        topPx: 140,
        bottomPx: 100,
        levels: [1, 2, 3, 4].map((coins, index) => ({
          ...spare,
          buyPx: 100 + index * 10,
          sellPx: 110 + index * 10,
          sz: coins,
          heldSz: 0,
          status: "waiting" as const,
        })),
      },
    }
  }

  /** Drops UPPER PRICE five pixels up and leaves the move unanswered. */
  async function dragged(): Promise<{ host: HTMLElement; stop: () => void }> {
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () =>
      root.render(
        layer(
          four(),
          async () => true,
          () => 0,
          // Never answers, so the drawing stays as the drag left it.
          () => new Promise<boolean>(() => undefined)
        )
      )
    )
    const upper = [...host.querySelectorAll("span")].find((one) =>
      one.textContent?.includes("UPPER PRICE")
    )
    // Rung 1 is $130, drawn at y=70. Dropping it at y=65 widens the range.
    await act(async () => {
      upper?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 70 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 65 })
      )
    })
    return { host, stop: () => void act(() => root.unmount()) }
  }

  const moneyIn = (host: HTMLElement): string[] =>
    [...host.querySelectorAll("span")]
      // The chip itself, not the empty slot that reserves its column: both
      // read back the same text, and the slot would count every amount twice.
      .filter((one) => one.children.length === 0)
      .map((one) => one.textContent ?? "")
      .filter((text) => /^\$[\d,.]+$/.test(text))

  it("keeps the stake on the rungs that have no name of their own", async () => {
    const { host, stop } = await dragged()
    // The $220 and $360 rungs are the two between UPPER PRICE and LOWER
    // PRICE. Their stake is a share of the account, so moving the range
    // cannot change it and it must not disappear either.
    expect(moneyIn(host)).toContain("$220")
    expect(moneyIn(host)).toContain("$360")
    stop()
  })

  it("prints every rung's stake exactly once, with no second chip on a named rung", async () => {
    const { host, stop } = await dragged()
    const money = moneyIn(host)
    for (const amount of ["$100", "$220", "$360", "$520"]) {
      expect(money.filter((text) => text === amount)).toHaveLength(1)
    }
    stop()
  })
})
