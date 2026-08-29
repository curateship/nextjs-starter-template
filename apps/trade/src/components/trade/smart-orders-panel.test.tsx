// @vitest-environment jsdom

import { act, useState, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const flowRunsApi = vi.hoisted(() => ({
  loadRunningBots: vi.fn(),
  getRunningBotsErrorMessage: vi.fn(
    () => "The running bots could not be read."
  ),
}))
const flowTradingApi = vi.hoisted(() => ({
  pauseFlow: vi.fn(),
  stopFlow: vi.fn(),
  flowActionProblem: vi.fn(() => "The bot action failed."),
}))

vi.mock("@/lib/api/trade/flow-runs", () => flowRunsApi)
vi.mock("@/lib/api/trade/flow-trading", () => flowTradingApi)

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: ComponentProps<"a"> & {
    to: string
    params: { runId: string }
  }) => (
    <a href={to.replace("$runId", params.runId)} {...props}>
      {children}
    </a>
  ),
}))

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

const EMPTY = "No ladder or grid of your own is working"
const READING = "Reading your smart orders"

afterEach(() => {
  flowRunsApi.loadRunningBots.mockReset()
  flowTradingApi.pauseFlow.mockReset()
  flowTradingApi.stopFlow.mockReset()
  vi.useRealTimers()
})

beforeEach(() => {
  flowRunsApi.loadRunningBots.mockResolvedValue([])
  flowTradingApi.pauseFlow.mockResolvedValue({ summary: "Paused." })
  flowTradingApi.stopFlow.mockResolvedValue({ summary: "Stopped." })
})

const shared = {
  protocol: "hyperliquid" as const,
  initialBots: [],
  initialBotsError: null,
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

const runningBot = {
  runId: "run-1",
  automationId: "flow-1",
  name: "Buy the dip",
  strategy: "DCA ladder" as const,
  marketCount: 12,
  workingCount: 3,
  holdingCount: 2,
  netUsd: 24.5,
  tradesClosed: 4,
  walletLabel: "Practice",
  real: false,
  startedAt: Date.now() - 60_000,
  paused: false,
  stopping: false,
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

async function openBots(host: HTMLElement) {
  const trigger = host.querySelector<HTMLButtonElement>(
    '[data-slot="tabs-trigger"][aria-selected="false"]'
  )
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
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    )
    trigger?.focus()
  })
}

describe("the Smart orders panel", () => {
  it("gives its order list a bounded scroll area", () => {
    const html = draw({ smartOrders: [ladder], settled: true, failed: false })
    const document = new DOMParser().parseFromString(html, "text/html")
    const smartTab = document.querySelector(
      '[data-slot="tabs-content"][data-state="active"]'
    )

    expect(smartTab?.className).toContain("flex-col")
    expect(smartTab?.querySelector('[data-slot="scroll-area"]')).not.toBeNull()
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
    const half = draw({ smartOrders: [ladder], settled: false, failed: false })
    expect(half).toContain("XMR")
    expect(half).not.toContain(READING)
  })

  it("lists each running bot and links its name to the run dashboard", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    flowRunsApi.loadRunningBots.mockResolvedValue([runningBot])
    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          initialBots={[runningBot]}
          smartOrders={[]}
          settled
          failed={false}
        />
      )
    })
    await openBots(host)

    const link = host.querySelector<HTMLAnchorElement>(
      'a[href="/flow-runs/run-1"]'
    )
    expect(link?.textContent).toContain("Buy the dip")
    expect(link?.textContent).toContain("DCA ladder")
    expect(link?.textContent).toContain("+$24.50")
    expect(link?.textContent).toContain("3 of 12 working")
    expect(flowRunsApi.loadRunningBots).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain("none running")
    expect(host.textContent).not.toMatch(/working.*holding/i)
    await act(async () => root.unmount())
    host.remove()
  })

  it("does not call a failed bot read an empty list", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    const root = createRoot(host)
    flowRunsApi.loadRunningBots.mockRejectedValue(new Error("offline"))

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          initialBotsError="The running bots could not be read."
          smartOrders={[]}
          settled
          failed={false}
        />
      )
    })
    await openBots(host)

    expect(host.textContent).toContain("could not be read")
    expect(host.textContent).not.toContain("No bot is running")
    await act(async () => root.unmount())
  })

  it("keeps the last bot list when its immediate refresh fails", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    flowRunsApi.loadRunningBots.mockRejectedValue(new Error("offline"))
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          initialBots={[runningBot]}
          smartOrders={[]}
          settled
          failed={false}
        />
      )
    })
    await openBots(host)

    expect(flowRunsApi.loadRunningBots).toHaveBeenCalledWith("hyperliquid")
    expect(host.textContent).toContain("Buy the dip")
    expect(host.textContent).toContain("The list could not be refreshed")
    await act(async () => root.unmount())
  })

  it("rests while the browser tab is hidden and refreshes when it returns", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    let hidden = false
    const hiddenSpy = vi
      .spyOn(document, "hidden", "get")
      .mockImplementation(() => hidden)
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel {...shared} smartOrders={[]} settled failed={false} />
      )
    })
    await openBots(host)
    expect(flowRunsApi.loadRunningBots).toHaveBeenCalledTimes(1)

    hidden = true
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await vi.advanceTimersByTimeAsync(300_000)
    })
    expect(flowRunsApi.loadRunningBots).toHaveBeenCalledTimes(1)

    hidden = false
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(flowRunsApi.loadRunningBots).toHaveBeenCalledTimes(2)

    await act(async () => root.unmount())
    hiddenSpy.mockRestore()
  })

  it("shows the bot figures and confirms Stop before acting", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    flowRunsApi.loadRunningBots
      .mockResolvedValueOnce([runningBot])
      .mockResolvedValueOnce([])
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          initialBots={[runningBot]}
          smartOrders={[]}
          settled
          failed={false}
        />
      )
    })
    await openBots(host)
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Open Buy the dip bot details"]'
        )
        ?.click()
    })

    expect(document.body.textContent).toContain("Made or lost+$24.50")
    expect(document.body.textContent).toContain("Coins working3 of 12")
    expect(document.body.textContent).toContain("Practice money")

    const stop = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Stop"
    )
    await act(async () => stop?.click())
    expect(document.body.textContent).toContain("Stop this bot?")
    expect(flowTradingApi.stopFlow).not.toHaveBeenCalled()

    const confirm = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Stop it"
    )
    await act(async () => confirm?.click())

    expect(flowTradingApi.stopFlow).toHaveBeenCalledWith("flow-1")
    expect(host.textContent).not.toContain("Buy the dip")
    await act(async () => root.unmount())
    host.remove()
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

    const headerButtons = Array.from(host.querySelectorAll("thead button"))
    const headers = headerButtons.map((button) => button.textContent)
    expect(headers).toEqual(["Ticker", "Type", "PnL", "Banked"])
    expect(
      Array.from(host.querySelectorAll("thead th")).map((heading) =>
        heading.className.match(/w-\[\d+%\]/)?.[0]
      )
    ).toEqual(["w-[35%]", "w-[20%]", "w-[20%]", "w-[25%]"])
    expect(
      headerButtons
        .slice(2)
        .every((button) => button.className.includes("justify-end"))
    ).toBe(true)
    expect(headerButtons[3]?.className).toContain(
      "[&>span:first-child]:order-2"
    )
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
    expect(headerButtons[2]?.querySelector(".lucide-arrow-down")).not.toBeNull()
    const firstRowCells = host
      .querySelectorAll("tbody tr")[0]
      ?.querySelectorAll("td")
    expect(firstRowCells?.[0]?.className).not.toContain("text-right")
    expect(firstRowCells?.[1]?.textContent).toContain("Long")
    expect(firstRowCells?.[2]?.className).toContain("text-right")
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
    // The hover target is the icon and the ticker name together, so the
    // details trigger holds the icon's letter and the symbol.
    expect(details?.textContent).toBe("XXMR")
    expect(host.textContent).toContain("$0.00")
    expect(host.querySelector(".lucide-piggy-bank")).toBeNull()
    expect(host.querySelector(".lucide-ellipsis-vertical")).toBeNull()
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
          smartOrders={[ladder, short]}
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
    const aster: SmartOrder = {
      ...ladder,
      id: "aster-hype",
      marketKey: "aster:mainnet:HYPEUSDT",
    }
    const kucoin: SmartOrder = {
      ...ladder,
      id: "kucoin-sol",
      marketKey: "kucoin:mainnet:SOLUSDTM",
    }
    const hyperliquid: SmartOrder = {
      ...ladder,
      id: "hyperliquid-tsla",
      marketKey: "hyperliquid:mainnet:xyz:TSLA",
    }
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
    const ticker = Array.from(host.querySelectorAll("tbody .font-semibold"))
      .find((label) => label.textContent?.trim() === "XMR")
      ?.closest("button")
    await act(async () => ticker?.click())

    expect(ticker?.closest("tr")?.dataset.state).toBe("selected")
    await act(async () => root.unmount())
    host.remove()
  })

  it("moves grid progress and held funds into the ticker tooltip", async () => {
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
    expect(host.textContent).not.toContain("$70.00")

    await openSmartOrderDetails(host)

    expect(document.body.textContent).toContain("3 waiting · 7 completed")
    expect(document.body.textContent).toContain("Held to sell$70.00")
    const tooltip = document.body.querySelector('[data-slot="tooltip-content"]')
    expect(tooltip?.className).toContain("bg-popover")
    expect(tooltip?.className).toContain("[&>span:not([role])]:hidden")
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
        smartOrders={[ladder]}
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
    expect(markup).not.toContain("1 rung waiting")
  })
})
