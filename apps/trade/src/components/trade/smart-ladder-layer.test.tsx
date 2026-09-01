// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ChartSurface } from "@/components/trade/price-chart"
import { SmartLadderLayer } from "@/components/trade/smart-ladder-layer"
import type { ChartColors } from "@/lib/trade/chart-theme"
import type { SmartLadder } from "@/lib/trade/smart-plan"

const colors: ChartColors = {
  text: "#777",
  grid: "#ddd",
  border: "#ddd",
  primary: "#00f",
  up: "#0a0",
  down: "#a00",
  warning: "#aa0",
  alert: "#70c",
  neutral: "#777",
  badgeText: "#fff",
  upSoft: "#afa",
  downSoft: "#faa",
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

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe("DCA chart ladders", () => {
  it("shows order dollars instead of coin prices", async () => {
    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[]}
          preview={{
            anchorPx: 110,
            rungs: [
              { px: 100, dollars: 250 },
              { px: 90, dollars: 500 },
            ],
            onMove: () => undefined,
            onResize: () => undefined,
          }}
          tool={null}
          walletName={() => "Wallet"}
        />
      )
    })

    expect(host.textContent).toContain("Rung 1 · $250")
    expect(host.textContent).toContain("Rung 2 · $500")
    expect(host.textContent).not.toContain("$100")
    expect(host.textContent).not.toContain("$90")
  })

  it("shows and drags the mirrored exits before placement", async () => {
    const onMoveExit = vi.fn()
    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[]}
          preview={{
            anchorPx: 110,
            rungs: [
              { px: 100, dollars: 250 },
              { px: 90, dollars: 500 },
            ],
            exitGapPct: 0,
            onMove: () => undefined,
            onResize: () => undefined,
            onMoveExit,
          }}
          tool={null}
          walletName={() => "Wallet"}
        />
      )
    })

    expect(host.textContent).toContain("Exit rung 2 for profit at +$111.11")
    expect(host.textContent).toContain("Exit rung 1 for profit at +$52.50")

    const move = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole exit ladder from rung 2\'s exit"]'
    )
    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientY: 80,
        })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 70 })
      )
    })

    expect(onMoveExit).toHaveBeenCalledWith(0, 130)
  })

  it("moves the complete ladder from any rung and resizes from the deepest handle", async () => {
    const onMove = vi.fn()
    const onResize = vi.fn()
    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[]}
          preview={{
            anchorPx: 110,
            rungs: [
              { px: 100, dollars: 250 },
              { px: 90, dollars: 500 },
            ],
            onMove,
            onResize,
          }}
          tool={null}
          walletName={() => "Wallet"}
        />
      )
    })

    const move = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole DCA ladder from rung 1"]'
    )
    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 80 })
      )
    })
    // Rung 1 moved from $100 to $120, so the $110 anchor moves by the same 1.2×.
    expect(onMove).toHaveBeenCalledWith(132)

    const resize = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand or contract the DCA ladder"]'
    )
    await act(async () => {
      resize?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 110 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 120 })
      )
    })
    expect(onResize).toHaveBeenCalledWith(80)
  })

  it("leaves the ladder unchanged when its drag handle is only clicked", async () => {
    const onMove = vi.fn()
    const onResize = vi.fn()
    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[]}
          preview={{
            anchorPx: 110,
            rungs: [
              { px: 100, dollars: 250 },
              { px: 90, dollars: 500 },
            ],
            onMove,
            onResize,
          }}
          tool={null}
          walletName={() => "Wallet"}
        />
      )
    })

    const move = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole DCA ladder from rung 1"]'
    )
    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 100 })
      )
    })

    expect(onMove).not.toHaveBeenCalled()
    expect(onResize).not.toHaveBeenCalled()
  })

  it("waits for a saved move before accepting another drag", async () => {
    let finish: (saved: boolean) => void = () => undefined
    const onMove = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    )
    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[]}
          preview={{
            anchorPx: 110,
            rungs: [{ px: 100, dollars: 250 }],
            onMove,
            onResize: () => undefined,
          }}
          tool={null}
          walletName={() => "Wallet"}
        />
      )
    })

    const move = () =>
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Move the whole DCA ladder from rung 1"]'
      )
    await act(async () => {
      move()?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 80 })
      )
    })
    await act(async () => {
      move()?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 80 })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 60 })
      )
    })

    expect(onMove).toHaveBeenCalledOnce()
    await act(async () => finish(true))
  })

  it("offers the same controls on a placed ladder until its first buy", async () => {
    const reshape = vi.fn(async () => true)
    const ladder = {
      id: "ladder",
      walletId: "wallet",
      marketKey: "market",
      kind: "dca",
      status: "active",
      flowRunId: null,
      createdAt: 1,
      updatedAt: 1,
      plan: {
        anchorPx: 110,
        steppedDown: 0,
        reclaim: null,
        rungs: [
          {
            px: 100,
            sz: 2.5,
            budget: 250,
            status: "waiting",
            orderId: null,
            sellOrderId: null,
            dead: false,
            touched: false,
          },
          {
            px: 90,
            sz: 5,
            budget: 450,
            status: "waiting",
            orderId: null,
            sellOrderId: null,
            dead: false,
            touched: false,
          },
        ],
        takeProfit: null,
        stopLoss: null,
      },
    } as unknown as SmartLadder

    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[ladder]}
          preview={null}
          tool={null}
          walletName={() => "Wallet"}
          onReshapeLadder={reshape}
        />
      )
    })

    const move = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole DCA ladder from rung 1"]'
    )
    const ladderBar = host.querySelector<HTMLElement>(
      "[data-dca-ladder-summary]"
    )
    const rungTops = () =>
      [
        ...host.querySelectorAll<HTMLButtonElement>(
          'button[aria-label^="Move the whole DCA ladder from rung"]'
        ),
      ].map((button) => button.closest("span")?.parentElement?.style.top)
    // The ladder-wide controls are a footer below the lowest rung. The summary
    // must not cover a priced rung or exit.
    expect(ladderBar?.style.top).toBe("138px")
    expect(rungTops()).toEqual(["100px", "110px"])
    expect(ladderBar?.querySelector(".border-t")).toBeNull()

    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })
      )
      window.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientY: 80 })
      )
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
    })
    // Rung 1 moved from $100 to $120 and rung 2 moved to $108. The footer
    // follows the lowest rung in the same frame, before the server sees the
    // drop.
    expect(ladderBar?.style.top).toBe("120px")
    expect(rungTops()).toEqual(["80px", "92px"])

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 80 })
      )
    })

    expect(reshape).toHaveBeenCalledWith(ladder, { anchorPx: 132 })
    expect(
      host.querySelector(
        'button[aria-label="Expand or contract the DCA ladder"]'
      )
    ).not.toBeNull()
  })

  it("draws waiting, armed, and sold exit-ladder levels distinctly", async () => {
    const ladder = {
      id: "ladder",
      walletId: "wallet",
      marketKey: "market",
      kind: "dca",
      status: "active",
      flowRunId: null,
      createdAt: 1,
      updatedAt: 1,
      plan: {
        anchorPx: 110,
        rungs: [
          { px: 100, sz: 2, status: "filled", sellOrderId: null },
          { px: 90, sz: 4, status: "filled", sellOrderId: null },
          { px: 81, sz: 6, status: "filled", sellOrderId: null },
        ],
        exitRungs: [
          { status: "waiting", orderId: "exit-1", armedSz: 6 },
          { status: "waiting", orderId: null, armedSz: 0 },
          { status: "sold", orderId: null, armedSz: 0 },
        ],
        takeProfit: { mode: "exitLadder", pct: null, exitGapPct: 0 },
        stopLoss: null,
      },
    } as unknown as SmartLadder

    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[ladder]}
          preview={null}
          tool={null}
          readOnly
          walletName={() => "Wallet"}
        />
      )
    })

    expect(host.textContent).toContain("Exit rung 3 for profit at +$174.00")
    expect(host.textContent).toContain("Exit rung 2 for profit at +$124.00")
    expect(host.textContent).not.toContain("Exit rung 1")
    const armed = [...host.querySelectorAll("span")].find((element) =>
      element.textContent?.startsWith("Exit rung 3 for profit at")
    )?.previousElementSibling
    const waiting = [...host.querySelectorAll("span")].find((element) =>
      element.textContent?.startsWith("Exit rung 2 for profit at")
    )?.previousElementSibling
    expect(armed?.className).not.toContain("border-dashed")
    expect(waiting?.className).toContain("border-dashed")
  })

  it("drags every placed exit from any exit label", async () => {
    let finish: (saved: boolean) => void = () => undefined
    const reshape = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    )
    const ladder = {
      id: "ladder",
      walletId: "wallet",
      marketKey: "market",
      kind: "dca",
      status: "active",
      flowRunId: null,
      createdAt: 1,
      updatedAt: 1,
      plan: {
        anchorPx: 110,
        rungs: [
          { px: 100, sz: 2, status: "filled", sellOrderId: null },
          { px: 90, sz: 4, status: "filled", sellOrderId: null },
        ],
        exitRungs: [
          { status: "waiting", orderId: "exit-1", armedSz: 4 },
          { status: "waiting", orderId: null, armedSz: 0 },
        ],
        takeProfit: { mode: "exitLadder", pct: null, exitGapPct: 0 },
        stopLoss: null,
      },
    } as unknown as SmartLadder

    await act(async () => {
      root.render(
        <SmartLadderLayer
          surface={surface}
          colors={colors}
          marketKey="market"
          ladders={[ladder]}
          preview={null}
          tool={null}
          walletName={() => "Wallet"}
          onReshapeLadder={reshape}
        />
      )
    })

    const move = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Move the whole exit ladder from rung 2\'s exit"]'
    )
    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientY: 80,
        })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 70 })
      )
    })

    expect(reshape).toHaveBeenCalledWith(ladder, {
      exitIndex: 0,
      exitPx: 130,
    })

    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientY: 70,
        })
      )
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 60 })
      )
    })
    expect(reshape).toHaveBeenCalledTimes(1)

    await act(async () => {
      move?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 2,
          clientY: 80,
        })
      )
    })
    expect(reshape).toHaveBeenCalledTimes(1)
    await act(async () => finish(true))
  })
})
