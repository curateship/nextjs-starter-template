// @vitest-environment jsdom

import { act, useState, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

import { SmartOrdersPanel as SmartOrdersPanelContent } from "@/components/trade/smart-orders-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { writeSmartOrdersCache } from "@/lib/trade/dashboard-cache"
import { ladderPlanSchema } from "@/lib/trade/dca"
import type { MarketRow } from "@/lib/protocols/contracts"
import type { TradePosition } from "@/lib/trade/paper"
import type { SmartOrder } from "@/lib/trade/smart-plan"

function SmartOrdersPanel(
  props: ComponentProps<typeof SmartOrdersPanelContent>
) {
  return (
    <TooltipProvider>
      <SmartOrdersPanelContent {...props} />
    </TooltipProvider>
  )
}

/**
 * The Smart orders panel's three answers, told apart.
 *
 * "Nothing of yours is working", "still reading" and "could not read" are
 * different answers, and only the first is safe to act on. The panel used to
 * give the first one whatever had happened, so a ladder holding real money
 * read as no ladder at all for as long as the exchange took to answer.
 *
 * **Still reading includes half-read.** The trading read lands in two halves,
 * practice and real, and either may be first. A person whose ladders are all
 * on real wallets holds an empty practice half for a second or two, and that
 * half is not an answer. `settled` is both halves being in.
 */

const EMPTY = "No grid of your own is working"
const READING = "Reading your grids"

afterEach(() => {
  vi.useRealTimers()
})

const shared = {
  cacheScope: "test:hyperliquid",
  positions: [],
  fills: [],
  trades: [],
  markets: new Map(),
  wallets: [],
  walletName: () => "Main",
  selectedMarketKey: null,
  onRetry: () => {},
  onResumeSmartOrder: vi.fn(async () => true),
  onSelectMarket: () => {},
}

/** One hand-placed ladder with a single rung still waiting. */
const ladder: SmartOrder = {
  id: "one",
  walletId: "w1",
  marketKey: "hyperliquid:mainnet:XMR",
  status: "active",
  kind: "dca",
  flowRunId: null,
  createdAt: 1,
  updatedAt: 1,
  // Parsed rather than written out, so the schema fills every field this
  // panel does not read and the fixture cannot drift from the real shape.
  plan: ladderPlanSchema.parse({
    anchorPx: 100,
    sizeDecimals: 2,
    maxLeverage: 20,
    rungs: [
      {
        px: 95,
        sz: 1,
        status: "waiting",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
    ],
    takeProfit: null,
    stopLoss: null,
    aimedTpPx: null,
    aimedSlPx: null,
    twoGreen: false,
    greenInterval: null,
    green: null,
  }),
}

const grid = {
  ...ladder,
  id: "grid",
  kind: "grid",
  plan: {
    carriedLevels: [],
    levels: [
      { status: "waiting", heldSz: 0, buyPx: 10 },
      { status: "waiting", heldSz: 0, buyPx: 20 },
      { status: "waiting", heldSz: 0, buyPx: 30 },
      ...Array.from({ length: 7 }, () => ({
        status: "holding",
        heldSz: 1,
        buyPx: 10,
      })),
    ],
  },
} as unknown as SmartOrder

/** A long grid on the same coin, for tests that are about the table itself. */
const xmrGrid = { ...grid, id: "xmr-grid" } as SmartOrder

const bitcoin: SmartOrder = {
  ...ladder,
  id: "two",
  marketKey: "hyperliquid:mainnet:BTC",
}

const pnlPositions: TradePosition[] = [
  {
    id: "xmr-position",
    walletId: ladder.walletId,
    marketKey: ladder.marketKey,
    szi: 1,
    entryPx: 100,
    leverage: 1,
    maxLeverage: 20,
    targets: [],
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
  },
  {
    id: "btc-position",
    walletId: bitcoin.walletId,
    marketKey: bitcoin.marketKey,
    szi: 1,
    entryPx: 100,
    leverage: 1,
    maxLeverage: 20,
    targets: [],
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
  },
]

const pnlMarkets = new Map([
  [ladder.marketKey, { price: 120, iconUrl: null }],
  [bitcoin.marketKey, { price: 110, iconUrl: null }],
]) as unknown as Map<string, MarketRow>

function draw(state: {
  smartOrders: readonly SmartOrder[]
  settled: boolean
  failed: boolean
}): string {
  return renderToStaticMarkup(<SmartOrdersPanel {...shared} {...state} />)
}

/** Presses one of the panel's two tabs by its label. */
async function openTab(host: HTMLElement, label: "Grid" | "DCA") {
  const trigger = Array.from(
    host.querySelectorAll<HTMLButtonElement>('[data-slot="tabs-trigger"]')
  ).find((button) => button.textContent?.trim() === label)
  await act(async () => {
    trigger?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  })
}

async function openSmartOrderDetails(host: HTMLElement, symbol = "XMR") {
  const trigger = host.querySelector<HTMLButtonElement>(
    `[aria-label="${symbol} smart order details"]`
  )
  await act(async () => {
    trigger?.click()
  })
}

describe("the Smart orders panel", () => {
  it("gives its order list a bounded scroll area", () => {
    const html = draw({ smartOrders: [xmrGrid], settled: true, failed: false })
    const document = new DOMParser().parseFromString(html, "text/html")
    const smartTab = document.querySelector(
      '[data-slot="tabs-content"][data-state="active"]'
    )

    expect(smartTab?.className).toContain("flex-col")
    const scroller = smartTab?.querySelector('[data-slot="scroll-area"]')
    expect(scroller).not.toBeNull()
    // It fills the tab rather than growing with its rows, so the rows past
    // the fold are reached by scrolling.
    expect(scroller?.className.split(/\s+/)).toContain("flex-1")
    expect(scroller?.className.split(/\s+/)).toContain("min-h-0")
  })

  // A panel that sized itself to its rows put the last ones out of reach with
  // no scrollbar inside the collapsed-column menu (Tyler, 29 Sep 2026). It
  // fills whatever box it is given, in the menu and in its own column alike,
  // and never sets a height of its own.
  it("fills the box it is given instead of growing with its rows", () => {
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(
      <SmartOrdersPanel {...shared} smartOrders={[]} settled failed={false} />
    )

    const tabs = host.querySelector<HTMLElement>('[data-slot="tabs"]')!
    expect(tabs.className.split(/\s+/)).toContain("flex-1")
    expect(tabs.className.split(/\s+/)).toContain("min-h-0")
    expect(tabs.className).not.toContain("max-h-")
  })

  it("says nothing is working only once both halves have answered", () => {
    const answered = draw({ smartOrders: [], settled: true, failed: false })
    expect(answered).toContain(EMPTY)
    expect(answered).not.toContain("none working")
  })

  it("keeps reading before both halves have landed", () => {
    const half = draw({ smartOrders: [], settled: false, failed: false })
    expect(half).not.toContain(EMPTY)
    expect(half).toContain(READING)
  })

  it("says the read refused rather than claiming nothing is working", () => {
    const refused = draw({ smartOrders: [], settled: true, failed: true })
    expect(refused).not.toContain(EMPTY)
    expect(refused).toContain("could not be read")
  })

  it("draws the orders the landed half brought, without waiting for the other", () => {
    const half = draw({ smartOrders: [xmrGrid], settled: false, failed: false })
    expect(half).toContain("XMR")
    expect(half).not.toContain(READING)
  })

  // Grid first and DCA second, in place of Smart orders and Bots (Tyler,
  // 6 Oct 2026).
  it("opens on a Grid tab beside a DCA tab, and nothing else", () => {
    const html = draw({ smartOrders: [], settled: true, failed: false })
    const document = new DOMParser().parseFromString(html, "text/html")
    const tabs = Array.from(
      document.querySelectorAll('[data-slot="tabs-trigger"]')
    )

    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Grid", "DCA"])
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true")
    expect(html).not.toContain("Bots")
  })

  it("lists grids under Grid and ladders under DCA", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    const root = createRoot(host)
    const btcGrid = {
      ...grid,
      id: "btc-grid",
      marketKey: bitcoin.marketKey,
    } as SmartOrder

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[ladder, btcGrid]}
          settled
          failed={false}
        />
      )
    })
    expect(host.querySelector("tbody")?.textContent).toContain("BTC")
    expect(host.querySelector("tbody")?.textContent).not.toContain("XMR")

    await openTab(host, "DCA")
    expect(host.querySelector("tbody")?.textContent).toContain("XMR")
    expect(host.querySelector("tbody")?.textContent).not.toContain("BTC")
    await act(async () => root.unmount())
  })

  // The Positions tab leaves out every coin this panel lists, so a paused
  // signal trade with no tab would take its holding off the screen.
  it("lists a paused signal trade under DCA so its coin is never hidden", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const signal = {
      ...ladder,
      id: "signal",
      kind: "signal",
      flowRunId: "run-1",
      plan: { phase: "holding", paused: true, pauseReason: "Refused." },
    } as unknown as SmartOrder
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[signal]}
          settled
          failed={false}
        />
      )
    })
    expect(host.textContent).toContain(EMPTY)

    await openTab(host, "DCA")
    expect(host.querySelector("tbody")?.textContent).toContain("XMR")
    await act(async () => root.unmount())
  })

  it("names the DCA tab's own kind when nothing is working there", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel {...shared} smartOrders={[]} settled failed={false} />
      )
    })
    await openTab(host, "DCA")

    expect(host.textContent).toContain("No DCA ladder of your own is working")
    await act(async () => root.unmount())
  })

  it("draws the last complete answer while the new read is still landing", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    writeSmartOrdersCache(shared.cacheScope, {
      orders: [ladder],
      positions: [pnlPositions[0]],
    })
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[]}
          markets={pnlMarkets}
          settled={false}
          failed={false}
        />
      )
    })
    await openTab(host, "DCA")

    expect(host.textContent).toContain("XMR")
    expect(host.textContent).toContain("+$20.00")
    expect(host.textContent).not.toContain(READING)
    await act(async () => root.unmount())
  })

  it("draws four sortable columns and puts details on the ticker icon and name", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[ladder, bitcoin]}
          positions={pnlPositions}
          markets={pnlMarkets}
          settled
          failed={false}
        />
      )
    })
    await openTab(host, "DCA")

    const headerButtons = Array.from(host.querySelectorAll("thead button"))
    const headers = headerButtons.map((button) => button.textContent)
    expect(headers).toEqual(["Ticker", "Type", "Value", "PnL"])
    expect(
      Array.from(host.querySelectorAll("thead th")).map((heading) =>
        heading.className.match(/w-\[\d+%\]/)?.[0]
      )
    ).toEqual(["w-[34%]", "w-[22%]", "w-[20%]", "w-[24%]"])
    // One rule for every column: headings and figures read from the left.
    expect(
      headerButtons.every(
        (button) => !button.className.includes("justify-end")
      )
    ).toBe(true)
    expect(host.querySelector("table")?.className).toContain(
      "[&_td:last-child]:pr-4"
    )
    expect(
      host.querySelector('[data-slot="table-container"]')?.className
    ).toContain("color-mix")
    const rowTickers = () =>
      Array.from(host.querySelectorAll("tbody tr")).map((row) =>
        row.querySelector(".font-semibold")?.textContent?.trim()
      )
    expect(rowTickers()).toEqual(["XMR", "BTC"])
    // PnL is the last column, and the one the list opens sorted by.
    expect(headerButtons[3]?.querySelector(".lucide-arrow-down")).not.toBeNull()
    const firstRowCells = host
      .querySelectorAll("tbody tr")[0]
      ?.querySelectorAll("td")
    expect(firstRowCells?.[0]?.className).not.toContain("text-right")
    expect(firstRowCells?.[1]?.textContent).toContain("Long")
    expect(
      Array.from(firstRowCells ?? []).every(
        (cell) => !cell.className.includes("text-right")
      )
    ).toBe(true)
    await act(async () => {
      host.querySelector<HTMLButtonElement>("thead button")?.click()
    })
    expect(rowTickers()).toEqual(["BTC", "XMR"])
    const details = host.querySelector(
      '[aria-label="XMR smart order details"]'
    )
    expect(
      host.querySelector('[data-slot="dashboard-card-header"]')?.className
    ).toContain("min-h-[var(--dashboard-card-header-height)]")
    expect(details?.getAttribute("aria-label")).toBe("XMR smart order details")
    // The $0.00 before a first sale left with the Banked column; what an
    // order has sold is read in its details card now.
    expect(host.textContent).not.toContain("$0.00")
    expect(host.querySelector(".lucide-piggy-bank")).toBeNull()
    expect(host.querySelector(".lucide-ellipsis-vertical")).not.toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })

  it("shows and sorts long and short order types like Active Trades", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const short: SmartOrder = {
      ...grid,
      id: "short-grid",
      marketKey: "hyperliquid:mainnet:BTC",
      plan: { ...grid.plan, direction: "short" },
    } as SmartOrder
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[xmrGrid, short]}
          settled
          failed={false}
        />
      )
    })

    const rows = () => Array.from(host.querySelectorAll("tbody tr"))
    expect(rows().map((row) => row.children[1]?.textContent)).toEqual([
      "Long",
      "Short",
    ])
    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>("thead button"))
        .find((button) => button.textContent === "Type")
        ?.click()
    })
    expect(rows().map((row) => row.children[1]?.textContent)).toEqual([
      "Long",
      "Short",
    ])
    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>("thead button"))
        .find((button) => button.textContent === "Type")
        ?.click()
    })
    expect(rows().map((row) => row.children[1]?.textContent)).toEqual([
      "Short",
      "Long",
    ])

    await act(async () => root.unmount())
  })

  it("uses the coin name instead of exchange contract affixes", () => {
    const aster = {
      ...grid,
      id: "aster-hype",
      marketKey: "aster:mainnet:HYPEUSDT",
    } as SmartOrder
    const kucoin = {
      ...grid,
      id: "kucoin-sol",
      marketKey: "kucoin:mainnet:SOLUSDTM",
    } as SmartOrder
    const hyperliquid = {
      ...grid,
      id: "hyperliquid-tsla",
      marketKey: "hyperliquid:mainnet:xyz:TSLA",
    } as SmartOrder
    const html = renderToStaticMarkup(
      <SmartOrdersPanel
        {...shared}
        smartOrders={[aster, kucoin, hyperliquid]}
        settled
        failed={false}
        markets={
          new Map([
            [aster.marketKey, { symbol: "HYPE", iconUrl: null }],
            [kucoin.marketKey, { symbol: "SOL", iconUrl: null }],
            [hyperliquid.marketKey, { symbol: "xyz:TSLA", iconUrl: null }],
          ]) as unknown as Map<string, MarketRow>
        }
      />
    )

    expect(html).toContain(">HYPE<")
    expect(html).toContain(">SOL<")
    expect(html).toContain(">TSLA<")
    expect(html).not.toContain("HYPEUSDT")
    expect(html).not.toContain("SOLUSDTM")
    expect(html).not.toContain("xyz:TSLA")
  })

  it("shows when a sale happened and the dollars sold", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 25, 19, 9))
    const soldAt = new Date(2026, 7, 23, 18, 9).getTime()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[ladder]}
          fills={[
            {
              fillId: "sale-1",
              orderId: "order-1",
              walletId: ladder.walletId,
              marketKey: ladder.marketKey,
              side: "sell",
              px: 0.032181,
              sz: 2_000,
              at: soldAt,
              closedPnl: 0.5,
              fee: 0.01,
              dir: "Close Long",
              liquidation: false,
            },
          ]}
          settled
          failed={false}
        />
      )
    })
    await openTab(host, "DCA")

    await openSmartOrderDetails(host)

    expect(document.body.textContent).toContain("2 days ago @ 6:09 PM · $64.36")
    expect(document.body.textContent).not.toContain("$0.032181")
    await act(async () => root.unmount())
    host.remove()
  })

  it("keeps the charted smart order selected across the whole row", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    function SelectedSmartOrder() {
      const [selectedMarketKey, setSelectedMarketKey] = useState<string | null>(
        null
      )
      return (
        <SmartOrdersPanel
          {...shared}
          smartOrders={[ladder]}
          selectedMarketKey={selectedMarketKey}
          settled
          failed={false}
          onSelectMarket={setSelectedMarketKey}
        />
      )
    }

    await act(async () => root.render(<SelectedSmartOrder />))
    await openTab(host, "DCA")
    const ticker = Array.from(host.querySelectorAll("tbody .font-semibold"))
      .find((label) => label.textContent?.trim() === "XMR")
      ?.closest("button")
    await act(async () => ticker?.click())

    expect(ticker?.closest("tr")?.dataset.state).toBe("selected")
    await act(async () => root.unmount())
    host.remove()
  })

  it("gives held funds their own column and keeps progress in the tooltip", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[grid]}
          settled
          failed={false}
        />
      )
    })
    expect(host.textContent).not.toContain("3 waiting · 7 completed")
    // The Held column carries the dollars the grid still has to close.
    expect(host.textContent).toContain("$70")

    await openSmartOrderDetails(host)

    expect(document.body.textContent).toContain("3 waiting · 7 completed")
    expect(document.body.textContent).toContain("Held to sell$70.00")
    const popover = document.body.querySelector('[data-slot="popover-content"]')
    expect(popover?.className).toContain("bg-popover")
    await act(async () => root.unmount())
    host.remove()
  })

  it("shows a ladder's bought rungs in the Held column", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    // One rung bought 2 coins at $95, so the ladder holds $190 to sell.
    const bought: SmartOrder = {
      ...ladder,
      plan: {
        ...ladder.plan,
        rungs: [
          { ...ladder.plan.rungs[0], px: 95, sz: 2, status: "filled" as const },
          { ...ladder.plan.rungs[0], px: 85, sz: 2, status: "waiting" as const },
        ],
      },
    } as SmartOrder

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[bought]}
          settled
          failed={false}
        />
      )
    })
    await openTab(host, "DCA")
    const cells = host.querySelectorAll("tbody tr")[0]?.querySelectorAll("td")
    // Whole dollars in the column; the tooltip keeps the cents.
    expect(cells?.[2]?.textContent).toBe("$190")
    await act(async () => root.unmount())
    host.remove()
  })

  it("says a selling grid is holding to BUY BACK, not to sell", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    const short = {
      ...grid,
      plan: { ...grid.plan, direction: "short" as const },
    }
    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[short]}
          settled
          failed={false}
        />
      )
    })
    await openSmartOrderDetails(host)

    expect(document.body.textContent).toContain("Held to buy back$70.00")
    await act(async () => root.unmount())
    host.remove()
  })

  it("shows why a strategy paused and lets its owner resume it", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const paused: SmartOrder = {
      ...ladder,
      plan: {
        ...ladder.plan,
        paused: true,
        pauseReason: "The order is below the market minimum.",
        refusalStreak: 5,
      },
    }
    const onResumeSmartOrder = vi.fn(async () => true)
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[paused]}
          onResumeSmartOrder={onResumeSmartOrder}
          settled
          failed={false}
        />
      )
    })
    await openTab(host, "DCA")
    expect(host.textContent).toContain("Paused")
    await openSmartOrderDetails(host)
    expect(document.body.textContent).toContain(
      "Paused. The order is below the market minimum."
    )

    const resume = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Resume"
    )
    await act(async () => resume?.click())
    expect(onResumeSmartOrder).toHaveBeenCalledWith(paused)

    await act(async () => root.unmount())
    host.remove()
  })

  it("says an active smart order cannot act after its key expires", () => {
    const markup = renderToStaticMarkup(
      <SmartOrdersPanel
        {...shared}
        smartOrders={[xmrGrid]}
        wallets={[
          {
            id: "w1",
            label: "Main",
            kind: "live",
            status: "active",
            protocol: "hyperliquid",
            network: "mainnet",
            startingBalance: 1_000,
            address: "0x1",
            hasKey: true,
            keyValidUntil: Date.now() - 1,
          },
        ]}
        settled
        failed={false}
      />
    )
    expect(markup).toContain("Key expired")
    expect(markup).not.toContain("3 waiting")
  })
})
